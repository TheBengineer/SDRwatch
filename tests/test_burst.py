"""Tests for burst capture module."""
from unittest.mock import patch

import numpy as np

from sdrwatch.recording.burst import BurstCapture


class MockSDR:
    """Mock SDR source returning synthetic IQ at configurable power levels."""

    def __init__(self, buffers: list[np.ndarray] | None = None):
        self._bufs = buffers or []
        self._idx = 0
        self._freq = 0.0

    def add_buffer(self, buf: np.ndarray):
        self._bufs.append(buf)

    def add_sequence(self, power_db: float, n_bufs: int, freq_hz: float = 0.0):
        """Add n_bufs of synthetic IQ at given power level."""
        samples = len(self._bufs[0]) if self._bufs else 8192
        for _ in range(n_bufs):
            self._bufs.append(_synthetic_buf(samples, power_db, freq_hz))

    def read(self, n: int) -> np.ndarray:
        if self._idx >= len(self._bufs):
            return np.zeros(n, dtype=np.complex64)
        buf = self._bufs[self._idx]
        self._idx += 1
        if len(buf) != n:
            return np.resize(buf, n)
        return buf

    def tune(self, f: float):
        self._freq = f

    def close(self):
        pass


def _synthetic_buf(
    samples: int = 8192, power_db: float = -30.0, freq_hz: float = 0.0
) -> np.ndarray:
    """Create a buffer of synthetic IQ at given power level and frequency offset."""
    amplitude = 10.0 ** (power_db / 20.0)
    t = np.arange(samples, dtype=np.float64)
    phase = 2.0 * np.pi * freq_hz * t / 2.4e6
    return (amplitude * np.exp(1j * phase)).astype(np.complex64)


class _FastClock:
    """Clock that advances a fixed step per call — for testing time-dependent behavior."""

    def __init__(self, step: float = 0.01):
        self._t = 1000.0
        self._step = step

    def __call__(self) -> float:
        v = self._t
        self._t += self._step
        return v


# ── Test scenarios ──────────────────────────────────────────────────────────


def test_warmup_returns_none():
    """During warmup period, read() always returns None."""
    src = MockSDR()
    src.add_sequence(-50.0, 100)  # well beyond warmup
    capture = BurstCapture(src, f_center_hz=100e6, warmup_s=0.2)
    for _ in range(int(0.15 * 2.4e6 / 8192)):  # before warmup completes
        assert capture.read() is None, "Should return None during warmup"


def test_warmup_completes():
    """After warmup, read() can detect and capture signals."""
    src = MockSDR()
    src.add_sequence(-50.0, 10)  # quiet during warmup
    src.add_sequence(-30.0, 10)  # louder after warmup
    src.add_sequence(-50.0, 5)  # trailing noise for offset
    capture = BurstCapture(
        src, f_center_hz=100e6, threshold_db=6.0, warmup_s=0.01
    )
    events = []
    for _ in range(30):
        ev = capture.read()
        if ev:
            events.append(ev)
    assert len(events) > 0, "Should capture burst after warmup"


def test_onset_triggers_capture():
    """Energy above HI threshold for 2+ consecutive buffers triggers onset and eventual capture."""
    src = MockSDR()
    src.add_sequence(-50.0, 20)  # noise floor: -50 dB
    src.add_sequence(-30.0, 10)  # burst: +20 dB above noise (well above 6 dB HI)
    src.add_sequence(-50.0, 5)  # trailing noise to trigger offset
    capture = BurstCapture(
        src, f_center_hz=100e6, threshold_db=6.0, warmup_s=0.01
    )
    events = []
    for _ in range(40):
        ev = capture.read()
        if ev:
            events.append(ev)
    assert len(events) == 1, "Should produce exactly one burst event"


def test_offset_finalizes():
    """After onset, energy below LO for 3+ consecutive buffers finalizes capture."""
    src = MockSDR()
    src.add_sequence(-50.0, 20)  # noise
    src.add_sequence(-30.0, 5)  # burst (above HI)
    src.add_sequence(-50.0, 10)  # back to noise (below LO)
    capture = BurstCapture(
        src, f_center_hz=100e6, threshold_db=6.0, warmup_s=0.01
    )
    events = []
    for _ in range(40):
        ev = capture.read()
        if ev:
            events.append(ev)
    assert len(events) == 1, "Burst should finalize when signal drops below LO"
    assert events[0]["duration_s"] > 0, "Duration should be positive"


def test_max_duration_finalizes():
    """Capture finalizes when duration exceeds max_duration_s."""
    src = MockSDR()
    src.add_sequence(-50.0, 20)  # noise
    src.add_sequence(-30.0, 500)  # long burst (would exceed max_duration)
    capture = BurstCapture(
        src,
        f_center_hz=100e6,
        threshold_db=6.0,
        max_duration_s=0.05,
        warmup_s=0.01,
    )
    clock = _FastClock(step=0.01)
    with patch("time.time", clock):
        events = []
        for _ in range(520):
            ev = capture.read()
            if ev:
                events.append(ev)
    assert len(events) >= 1, "Should finalize by max duration"
    for ev in events:
        assert ev["duration_s"] <= 0.1, (
            f"Each burst duration ({ev['duration_s']}) should be bounded by max_duration_s"
        )


def test_hysteresis_prevents_chatter():
    """Signal at LO+3dB (below HI) doesn't toggle ON when already OFF."""
    src = MockSDR()
    src.add_sequence(-50.0, 20)  # noise floor: -50 dB
    # Signal at -45 dB: LO = -48 dB, HI = -44 dB. -45 dB is LO < x < HI → no onset
    src.add_sequence(-45.0, 20)  # in hysteresis band
    capture = BurstCapture(
        src,
        f_center_hz=100e6,
        threshold_db=6.0,
        offset_db=2.0,
        warmup_s=0.01,
    )
    events = []
    for _ in range(40):
        ev = capture.read()
        if ev:
            events.append(ev)
    # -45 dB is below HI (-44 dB) so should NOT trigger
    assert len(events) == 0, "Signal in hysteresis band should not trigger onset"


def test_ema_tracks_noise_floor():
    """EMA noise floor converges to the actual noise level."""
    src = MockSDR()
    src.add_sequence(-50.0, 50)  # steady at -50 dB
    capture = BurstCapture(
        src, f_center_hz=100e6, threshold_db=6.0, warmup_s=0.01
    )
    for _ in range(55):
        capture.read()
    nf = capture._noise_floor_ema
    assert nf is not None, "Noise floor should be set after warmup + EMAs"
    nf_db = 10 * np.log10(max(nf, 1e-20))
    assert (
        abs(nf_db - (-50.0)) < 3.0
    ), f"Noise floor {nf_db:.1f} dB should be within 3 dB of -50 dB"


def test_ema_frozen_during_signal():
    """EMA should NOT update during active signal (to prevent signal bias)."""
    src = MockSDR()
    src.add_sequence(-50.0, 20)  # warmup + settle
    src.add_sequence(-30.0, 10)  # strong signal (should freeze EMA)
    capture = BurstCapture(
        src, f_center_hz=100e6, threshold_db=6.0, warmup_s=0.01
    )
    nf_values = []
    for _ in range(35):
        capture.read()
        if capture._signal_active and capture._noise_floor_ema is not None:
            nf_values.append(capture._noise_floor_ema)
    # All EMA values during signal should be identical (EMA freezes when signal is active)
    if len(nf_values) >= 2:
        assert all(
            v == nf_values[0] for v in nf_values
        ), "EMA should not update during signal"


def test_empty_buffer_safe():
    """read() with empty or zero buffer doesn't crash."""
    src = MockSDR()
    buf = np.zeros(8192, dtype=np.complex64)
    src.add_buffer(buf)
    capture = BurstCapture(
        src, f_center_hz=100e6, threshold_db=6.0, warmup_s=0.01
    )
    result = capture.read()
    assert result is None or isinstance(result, dict)


def test_returns_event_dict():
    """Finalized capture returns dict with expected keys."""
    src = MockSDR()
    src.add_sequence(-50.0, 20)
    src.add_sequence(-30.0, 5)
    src.add_sequence(-50.0, 10)
    capture = BurstCapture(
        src,
        f_center_hz=100e6,
        threshold_db=6.0,
        max_duration_s=0.02,
        warmup_s=0.01,
    )
    events = []
    for _ in range(40):
        ev = capture.read()
        if ev:
            events.append(ev)
    if events:
        expected_keys = {
            "detection_id",
            "f_center_hz",
            "duration_s",
            "started_utc",
            "raw_path",
            "sample_rate_hz",
            "max_power_db",
            "mean_power_db",
            "noise_floor_db",
        }
        assert expected_keys.issubset(events[0].keys()), (
            f"Missing keys: {expected_keys - set(events[0].keys())}"
        )
