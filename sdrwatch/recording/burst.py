"""Burst capture — continuous energy detection on a single frequency."""

from __future__ import annotations

import os
import time
import logging
from datetime import datetime, timezone
from typing import Optional

import numpy as np

from sdrwatch.util.logging import get_logger

_log = get_logger(__name__)


class BurstCapture:
    """Monitor a single frequency, detect signal onset/offset, capture IQ bursts.

    Uses time-domain energy detection (mean(|x|^2)) with a rolling EMA noise floor
    and GNU Radio-style hysteretic thresholds.

    Args:
        src: SDR source with tune(center_hz) and read(count) methods.
        f_center_hz: Center frequency to monitor.
        samp_rate: Sample rate in Hz.
        threshold_db: Onset threshold above noise floor in dB (HI threshold).
        offset_db: Offset threshold above noise floor in dB (LO threshold, hysteresis).
        max_duration_s: Maximum burst recording duration in seconds.
        capture_dir: Directory for captured .cf32 files.
        store: Optional Store for DB insertion.
        warmup_s: Warmup duration in seconds (no detection during this period).
    """

    def __init__(
        self,
        src,
        f_center_hz: int,
        samp_rate: float = 2.4e6,
        threshold_db: float = 6.0,
        offset_db: float = 2.0,
        max_duration_s: float = 30.0,
        capture_dir: str = "./captures",
        store=None,
        warmup_s: float = 5.0,
    ):
        self.src = src
        self.f_center_hz = f_center_hz
        self.samp_rate = samp_rate
        self.threshold_db = threshold_db
        self.offset_db = offset_db
        self.max_duration_s = max_duration_s
        self.capture_dir = capture_dir
        self.store = store
        self.warmup_s = warmup_s

        # Buffer and detection params
        self.buf_size = 8192  # ~3.4ms at 2.4 MS/s
        self.alpha = 0.01  # EMA time constant (~5.5s for 63%)
        self.onset_debounce = 2  # consecutive buffers above HI to trigger onset
        self.offset_debounce = 3  # consecutive buffers below LO to trigger offset

        # State
        self._signal_active = False
        self._noise_floor_ema: Optional[float] = None  # in power (linear), not dB
        self._onset_count = 0
        self._offset_count = 0
        self._capture_bufs: list[np.ndarray] = []
        self._capture_start: Optional[float] = None
        self._warmup_bufs: list[float] = []
        self._warmup_needed: int = max(1, int(warmup_s * samp_rate / self.buf_size))
        self._event_id = 0

        # Ensure dirs
        os.makedirs(os.path.join(self.capture_dir, "raw"), exist_ok=True)

        # Tune to frequency
        self.src.tune(self.f_center_hz)

    def read(self) -> Optional[dict]:
        """Read one buffer and update detection state.

        Returns:
            Burst event dict on capture completion, or None.
        """
        buf = self.src.read(self.buf_size)
        if len(buf) == 0:
            return None

        # Time-domain energy (no FFT needed — Parseval's theorem)
        mag2 = float(np.mean(np.abs(buf) ** 2))
        power_db = 10.0 * np.log10(max(mag2, 1e-20))

        # Warmup phase
        if self._warmup_needed > 0:
            self._warmup_bufs.append(mag2)
            self._warmup_needed -= 1
            if self._warmup_needed == 0 and self._warmup_bufs:
                # Seed EMA from 10th percentile of warmup data
                p10 = float(np.percentile(self._warmup_bufs, 10))
                self._noise_floor_ema = p10
                _log.info(
                    "burst: warmup complete, noise floor seeded at %.1f dB",
                    10 * np.log10(max(p10, 1e-20)),
                )
                self._warmup_bufs.clear()
            return None

        # Update noise floor EMA (only when no signal active)
        if not self._signal_active and self._noise_floor_ema is not None:
            self._noise_floor_ema = (
                self.alpha * mag2 + (1.0 - self.alpha) * self._noise_floor_ema
            )

        # Compute thresholds
        nf_linear = (
            self._noise_floor_ema if self._noise_floor_ema is not None else mag2
        )
        nf_db = 10.0 * np.log10(max(nf_linear, 1e-20))
        hi_db = nf_db + self.threshold_db
        lo_db = nf_db + self.offset_db
        hi_linear = 10.0 ** (hi_db / 10.0)
        lo_linear = 10.0 ** (lo_db / 10.0)

        # State machine
        if not self._signal_active and mag2 > hi_linear:
            self._onset_count += 1
            if self._onset_count >= self.onset_debounce:
                self._signal_active = True
                self._onset_count = 0
                self._offset_count = 0
                self._capture_bufs = []
                self._capture_start = time.time()
                _log.debug(
                    "burst: onset at %.3f MHz", self.f_center_hz / 1e6
                )
        elif not self._signal_active:
            self._onset_count = 0

        if self._signal_active:
            if mag2 < lo_linear:
                self._offset_count += 1
                if self._offset_count >= self.offset_debounce:
                    return self._finalize()
            else:
                self._offset_count = 0

            # Buffer samples during capture
            self._capture_bufs.append(buf)

            # Check max duration
            dt = time.time() - (self._capture_start or time.time())
            if dt >= self.max_duration_s:
                return self._finalize()

        return None

    def _finalize(self) -> dict:
        """Finalize capture, write .cf32, insert DB row, return event dict."""
        if not self._capture_bufs or self._capture_start is None:
            self._signal_active = False
            self._onset_count = 0
            self._offset_count = 0
            self._capture_bufs = []
            self._capture_start = None
            return {
                "detection_id": -1,
                "f_center_hz": self.f_center_hz,
                "duration_s": 0.0,
                "started_utc": "",
                "raw_path": "",
                "sample_rate_hz": self.samp_rate,
                "max_power_db": -999.0,
                "mean_power_db": -999.0,
                "noise_floor_db": -999.0,
            }

        samples = np.concatenate(self._capture_bufs)
        duration_s = len(samples) / self.samp_rate
        ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
        filename = (
            f"burst_{self.f_center_hz}_{ts}_{int(duration_s * 1000)}ms.cf32"
        )
        filepath = os.path.join(self.capture_dir, "raw", filename)

        # Write .cf32
        samples.tofile(filepath)

        # Compute stats
        mag2 = np.abs(samples) ** 2
        mean_power = float(np.mean(mag2))
        max_power = float(np.max(mag2))
        nf_linear = (
            self._noise_floor_ema if self._noise_floor_ema is not None else 1e-20
        )
        noise_db = 10.0 * np.log10(max(nf_linear, 1e-20))

        # Insert DB row if store was provided
        rec_id = None
        if self.store:
            started = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")
            try:
                rec_id = self.store.add_recording(
                    baseline_id=0,
                    detection_id=0,
                    f_center_hz=self.f_center_hz,
                    bandwidth_hz=0.0,
                    started_utc=started,
                    duration_ms=int(duration_s * 1000),
                    sample_rate_hz=self.samp_rate,
                    raw_path=filepath,
                    raw_bytes=os.path.getsize(filepath),
                )
            except Exception as e:
                _log.warning("burst: failed to insert recording row: %s", e)

        event = {
            "detection_id": rec_id or self._event_id,
            "f_center_hz": self.f_center_hz,
            "duration_s": round(duration_s, 2),
            "started_utc": datetime.now(timezone.utc).strftime(
                "%Y-%m-%dT%H:%M:%S"
            ),
            "raw_path": filepath,
            "sample_rate_hz": self.samp_rate,
            "max_power_db": round(
                10.0 * np.log10(max(max_power, 1e-20)), 1
            ),
            "mean_power_db": round(
                10.0 * np.log10(max(mean_power, 1e-20)), 1
            ),
            "noise_floor_db": round(noise_db, 1),
        }

        _log.info(
            "burst: captured %.1fs at %d Hz -> %s",
            duration_s,
            self.f_center_hz,
            filepath,
        )
        self._event_id += 1

        # Reset state
        self._signal_active = False
        self._onset_count = 0
        self._offset_count = 0
        self._capture_bufs = []
        self._capture_start = None

        return event
