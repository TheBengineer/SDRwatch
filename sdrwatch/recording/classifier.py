"""Heuristic modulation classifier using spectral features."""

import numpy as np
import scipy.signal

from sdrwatch.util.math import db10


def _compute_psd(cf32: np.ndarray, samp_rate: float) -> tuple[np.ndarray, np.ndarray]:
    """Compute PSD via Welch method and center DC at 0 Hz.

    Returns (freqs_hz, psd_db) where psd_db is normalized to 0 dB peak.
    """
    nperseg = min(4096, max(256, len(cf32) // 4))
    freqs, psd = scipy.signal.welch(
        cf32,
        fs=samp_rate,
        nperseg=nperseg,
        noverlap=nperseg // 2,
        return_onesided=False,
        scaling="density",
        detrend=False,  # preserve DC carrier — crucial for AM/CW detection
    )
    # Shift so DC (0 Hz) is at center
    freqs = np.fft.fftshift(freqs)
    psd = np.fft.fftshift(psd)
    psd_db = db10(psd)
    # Normalize to 0 dB peak
    peak = np.max(psd_db)
    if peak > -300:  # avoid pathological all-zero input
        psd_db = psd_db - peak
    return freqs, psd_db


def _bandwidth_at_level(
    psd_db: np.ndarray, freqs: np.ndarray, level_db: float
) -> float:
    """Frequency span (Hz) where PSD is within *level_db* of the peak.

    level_db=3 means "3 dB bandwidth" — the span where PSD >= -3 dB.
    Returns 0.0 if no bins meet the criterion.
    """
    above = psd_db >= -level_db
    if not np.any(above):
        return 0.0
    idx = np.where(above)[0]
    return float(freqs[idx[-1]] - freqs[idx[0]])


def _extract_features(freqs: np.ndarray, psd_db: np.ndarray) -> dict[str, float | bool]:
    """Extract spectral features for modulation classification."""
    features: dict[str, float | bool] = {}

    # ── Peak-to-average ratio (dB between peak and median) ──────────
    features["peak_to_avg"] = float(np.max(psd_db) - np.median(psd_db))

    # ── Bandwidth at 3 dB, 6 dB, 10 dB, and 20 dB below peak ──────
    features["bandwidth_3db"] = _bandwidth_at_level(psd_db, freqs, 3.0)
    features["bandwidth_6db"] = _bandwidth_at_level(psd_db, freqs, 6.0)
    features["bandwidth_10db"] = _bandwidth_at_level(psd_db, freqs, 10.0)
    features["bandwidth_20db"] = _bandwidth_at_level(psd_db, freqs, 20.0)

    # ── Carrier present (global peak at DC) ────────────────────────
    # A genuine amplitude carrier places its maximum power at the
    # center frequency (DC in baseband).  Signals whose peak is
    # elsewhere (FM, SSB, noise) do not have a DC carrier.
    dc_idx = int(np.argmin(np.abs(freqs)))
    peak_idx = int(np.argmax(psd_db))
    features["carrier_present"] = abs(dc_idx - peak_idx) <= 1

    # ── Spectral symmetry (across the 20 dB bandwidth, excluding DC) ─
    bw_20db = _bandwidth_at_level(psd_db, freqs, 20.0)
    above_db = psd_db >= -20.0 if bw_20db > 0 else psd_db >= -6.0  # fallback to 6 dB
    # Exclude the DC bin so the carrier does not bias symmetry
    lower_mask = above_db & (freqs < 0)
    upper_mask = above_db & (freqs > 0)
    lower_power = (
        float(np.sum(10 ** (psd_db[lower_mask] / 10))) if np.any(lower_mask) else 0.0
    )
    upper_power = (
        float(np.sum(10 ** (psd_db[upper_mask] / 10))) if np.any(upper_mask) else 0.0
    )
    total = lower_power + upper_power
    if total > 0:
        features["spectral_symmetry"] = 1.0 - abs(lower_power - upper_power) / total
        features["upper_sideband_stronger"] = bool(upper_power > lower_power)
    else:
        features["spectral_symmetry"] = 1.0
        features["upper_sideband_stronger"] = True

    return features


def _decision_tree(features: dict[str, float | bool]) -> str:
    """Rule-based decision tree for modulation classification."""
    bw_6db: float = features["bandwidth_6db"]  # type: ignore[assignment]
    bw_10db: float = features["bandwidth_10db"]  # type: ignore[assignment]
    peak_to_avg: float = features["peak_to_avg"]  # type: ignore[assignment]
    symmetry: float = features["spectral_symmetry"]  # type: ignore[assignment]
    carrier: bool = features["carrier_present"]  # type: ignore[assignment]

    # Noise / no-signal guard: flat spectrum with very low peak-to-avg
    if peak_to_avg < 2:
        return "unknown"

    # WFM broadcast: wide bandwidth, symmetric, no carrier
    if bw_6db > 150_000 and symmetry > 0.7 and peak_to_avg > 2:
        return "fm"

    # NFM: medium-wide, symmetric with carrier
    if 8_000 < bw_6db < 20_000 and carrier:
        return "fm"

    # AM: carrier present, symmetric, modulation sidebands widen the
    # 10 dB bandwidth beyond the Hann-window leakage (~1170 Hz).
    if carrier and symmetry > 0.6 and 1500 < bw_10db < 15000:
        return "am"

    # CW: very narrow (≈1 bin), high peak-to-avg, carrier at DC
    if bw_6db < 700 and peak_to_avg > 5 and carrier:
        return "cw"

    # SSB: asymmetric, no carrier
    if symmetry < 0.3 and not carrier:
        upper_stronger: bool = features["upper_sideband_stronger"]  # type: ignore[assignment]
        return "usb" if upper_stronger else "lsb"

    # Digital: structured but doesn't fit other categories
    if bw_6db > 0 and peak_to_avg > 3:
        return "digital"

    return "unknown"


def classify_modulation(
    cf32: np.ndarray,
    samp_rate: float,
    f_center_hz: int = 0,
    bandwidth_hz: float = 0.0,
) -> str:
    """Classify modulation type from raw IQ using spectral decision tree.

    Args:
        cf32: Complex float32 IQ samples (at least ~0.5 s recommended).
        samp_rate: Sample rate in Hz.
        f_center_hz: Center frequency (used for band context).
        bandwidth_hz: Detected bandwidth of the signal.

    Returns:
        One of: ``'fm'``, ``'am'``, ``'cw'``, ``'lsb'``, ``'usb'``,
        ``'digital'``, or ``'unknown'``.
    """
    # Length sanity — need at least two Welch segments
    if len(cf32) < 512:
        return "unknown"

    try:
        freqs, psd_db = _compute_psd(cf32, samp_rate)
        features = _extract_features(freqs, psd_db)
        return _decision_tree(features)
    except Exception:  # noqa: BLE001 — advisory classifier, fail-safe
        return "unknown"
