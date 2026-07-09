"""Patrol mode — adaptive sweeping with burst recording and frequency learning."""

from __future__ import annotations

import time
import logging
from datetime import datetime, timezone

import numpy as np

from sdrwatch.recording.recorder import IQRecorder

_log = logging.getLogger(__name__)

# Default thresholds
ONSET_DB = 6.0       # dB above noise floor to trigger burst
OFFSET_DB = 2.0      # dB below noise floor to end burst
ONSET_BUFS = 2       # consecutive buffers above threshold
OFFSET_BUFS = 3      # consecutive buffers below threshold
BUF_SIZE = 8192      # samples per buffer (~3.4ms at 2.4 MS/s)


class PatrolScanner:
    """Continuously sweep a band, detect signals, record bursts, learn locations.

    1. Load known signal locations from DB (past detections).
    2. Build adaptive scan plan: known-active frequencies first, then fill gaps.
    3. For each window: measure energy, if above threshold → burst capture.
    4. After burst: record location in DB with hit_count.
    5. Repeat — known frequencies get scanned every cycle; quiet bands less often.
    """

    def __init__(self, src, store, baseline_id: int, start_hz: int, stop_hz: int,
                 samp_rate: float = 2.4e6, threshold_db: float = ONSET_DB,
                 max_duration_s: float = 30.0, step_hz: float | None = None,
                 capture_dir: str = "./captures"):
        self.src = src
        self.store = store
        self.baseline_id = baseline_id
        self.start_hz = start_hz
        self.stop_hz = stop_hz
        self.samp_rate = samp_rate
        self.threshold_db = threshold_db
        self.max_duration_s = max_duration_s
        self.step_hz = step_hz or (samp_rate * 0.8)
        self.capture_dir = capture_dir
        self.recorder = IQRecorder(store, capture_dir)

        # Build initial window list
        self._build_windows()

        # Energy detection state
        self._noise_floor: float | None = None
        self._warmup_bufs: list[float] = []
        self._warmup_needed = int(5.0 * samp_rate / BUF_SIZE)  # 5s warmup

    def _build_windows(self) -> None:
        """Build ordered scan plan: known signals first, then gaps."""
        # Load known signal locations with >= 3 hits (established signals)
        known = self.store.get_known_signals(self.baseline_id, min_hits=3)
        raw_windows = list(range(self.start_hz, self.stop_hz, int(self.step_hz)))

        # Place known frequencies at the front of the scan plan
        known_freqs = {int(k["f_center_hz"]) for k in known}
        ordered: list[int] = sorted(known_freqs)
        # Add remaining windows not covered by known freqs
        for w in raw_windows:
            if not any(abs(w - kf) < self.samp_rate * 0.4 for kf in known_freqs):
                ordered.append(w)

        self.windows = ordered
        self._window_idx = 0
        _log.info("patrol: %d windows (%d known signals)", len(self.windows), len(known))

    def run(self) -> None:
        """Main patrol loop. Sweeps windows, detects bursts, records, learns."""
        _log.info("patrol: scanning %.3f–%.3f MHz (threshold=%+.1f dB, max_duration=%.1fs)",
                  self.start_hz / 1e6, self.stop_hz / 1e6,
                  self.threshold_db, self.max_duration_s)

        try:
            while True:
                self._patrol_cycle()
        except KeyboardInterrupt:
            _log.info("patrol interrupted")

    def _patrol_cycle(self) -> None:
        """One full cycle through the adaptive scan plan."""
        for i, f_center in enumerate(self.windows):
            self.src.tune(f_center)
            # Burn settling samples
            _ = self.src.read(int(self.samp_rate * 0.2))

            # Read a buffer and check energy
            buf = self.src.read(BUF_SIZE)
            power_db = self._measure_power(buf)

            if self._warmup_needed > 0:
                self._warmup_bufs.append(power_db)
                self._warmup_needed -= 1
                if self._warmup_needed == 0 and self._warmup_bufs:
                    self._noise_floor = float(np.percentile(self._warmup_bufs, 10))
                    _log.info("patrol: warmup complete, noise floor=%.1f dB", self._noise_floor)
                    self._warmup_bufs.clear()
                continue

            # Update noise floor (exponential moving average, only when quiet)
            if self._noise_floor is not None:
                self._noise_floor = 0.01 * power_db + 0.99 * self._noise_floor

            # Check for signal
            if self._noise_floor is not None and (power_db - self._noise_floor) > self.threshold_db:
                self._capture_burst(f_center)

    def _measure_power(self, buf: np.ndarray) -> float:
        """Time-domain energy in dB."""
        return 10.0 * np.log10(max(float(np.mean(np.abs(buf) ** 2)), 1e-20))

    def _capture_burst(self, f_center: int) -> None:
        """Signal detected at f_center — tune and record until dropout or max duration."""
        _log.info("patrol: signal detected at %.3f MHz", f_center / 1e6)
        self.src.tune(f_center)
        _ = self.src.read(int(self.samp_rate * 0.2))

        # Read IQ for burst duration
        total_samps = int(self.samp_rate * self.max_duration_s)
        captured = np.empty(0, dtype=np.complex64)
        dropout_bufs = 0
        onset_bufs = 0
        active = False
        start = time.time()

        while len(captured) < total_samps:
            buf = self.src.read(BUF_SIZE)
            if len(buf) == 0:
                break
            power = self._measure_power(buf)
            nf = self._noise_floor or -90

            if not active:
                if (power - nf) > self.threshold_db:
                    onset_bufs += 1
                    if onset_bufs >= ONSET_BUFS:
                        active = True
                        onset_bufs = 0
                        dropout_bufs = 0
                        captured = np.concatenate([captured, buf])
                else:
                    onset_bufs = 0
            else:
                captured = np.concatenate([captured, buf])
                if (power - nf) < OFFSET_DB:
                    dropout_bufs += 1
                    if dropout_bufs >= OFFSET_BUFS:
                        break
                else:
                    dropout_bufs = 0

        # Save the burst
        duration = time.time() - start
        if len(captured) > BUF_SIZE * ONSET_BUFS and self.store:
            ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
            fname = f"patrol_{f_center}_{ts}_{int(duration*1000)}ms.cf32"
            import os
            os.makedirs(os.path.join(self.capture_dir, "raw"), exist_ok=True)
            path = os.path.join(self.capture_dir, "raw", fname)
            captured.tofile(path)

            self.recorder.record(
                src=self.src,
                f_center_hz=f_center,
                samp_rate=self.samp_rate,
                duration_s=duration,
                baseline_id=self.baseline_id,
                detection_id=0,
            )

            # Learn: record this signal location
            self.store.record_signal_location(
                self.baseline_id, f_center, duration,
                band=f"{self.start_hz}-{self.stop_hz}",
            )

        _log.info("patrol: captured %.1fs burst at %.3f MHz", duration, f_center / 1e6)
