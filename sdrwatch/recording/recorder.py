"""IQ recording — tune, capture, persist to disk."""

import os
from datetime import datetime, timezone

import numpy as np  # noqa: F401 — samples from SDR driver are ndarrays

from sdrwatch.util.logging import get_logger

_log = get_logger(__name__)


class IQRecorder:
    """Capture raw IQ samples to .cf32 files and insert recording records.

    Args:
        store: Store instance with add_recording() method.
        capture_dir: Root directory for captures. Raw files go in capture_dir/raw/.
    """

    def __init__(self, store, capture_dir: str = "./captures"):
        self.store = store
        self.capture_dir = capture_dir
        self._ensure_dirs()

    def _ensure_dirs(self):
        os.makedirs(os.path.join(self.capture_dir, "raw"), exist_ok=True)

    def record(
        self,
        src,
        f_center_hz: int,
        samp_rate: float,
        duration_s: float,
        baseline_id: int,
        detection_id: int,
    ) -> tuple:
        """Tune SDR to f_center_hz, capture duration_s of CF32 samples, write to file.

        Args:
            src: SDR source with tune(center_hz) and read(count) methods.
            f_center_hz: Center frequency to tune to.
            samp_rate: Sample rate in Hz.
            duration_s: Recording duration in seconds.
            baseline_id: Baseline ID for file naming and DB.
            detection_id: Detection ID for file naming and DB.

        Returns:
            (recording_id, file_path) on success, or (None, None) on failure.
        """
        try:
            src.tune(f_center_hz)
            # Burn ~50ms of stale samples to let the PLL lock and AGC stabilize
            _ = src.read(int(samp_rate * 0.05))
        except Exception as e:
            _log.error("tune failed for %d Hz: %s", f_center_hz, e)
            return None, None

        nsamps = int(samp_rate * duration_s)
        if nsamps < 1:
            _log.error(
                "invalid sample count %d (rate=%.0f, duration=%.1f)",
                nsamps,
                samp_rate,
                duration_s,
            )
            return None, None

        try:
            samples = src.read(nsamps)
        except Exception as e:
            _log.error("read failed at %d Hz: %s", f_center_hz, e)
            return None, None

        if len(samples) < 1:
            _log.error("read returned 0 samples at %d Hz", f_center_hz)
            return None, None

        ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
        filename = f"{baseline_id}_{detection_id}_{f_center_hz}_{ts}.cf32"
        file_path = os.path.join(self.capture_dir, "raw", filename)
        duration_ms = int((len(samples) / samp_rate) * 1000) if samp_rate > 0 else 0

        try:
            samples.tofile(file_path)
        except Exception as e:
            _log.error("failed to write %s: %s", file_path, e)
            return None, None

        try:
            recording_id = self.store.add_recording(
                baseline_id=baseline_id,
                detection_id=detection_id,
                f_center_hz=f_center_hz,
                bandwidth_hz=0.0,  # filled later by classifier
                started_utc=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S"),
                duration_ms=duration_ms,
                sample_rate_hz=samp_rate,
                raw_path=file_path,
                raw_bytes=os.path.getsize(file_path),
            )
        except Exception as e:
            _log.error("failed to insert recording row: %s", e)
            return None, file_path  # file exists but DB row missing

        _log.info(
            "recorded %.1fs at %d Hz -> %s (id=%s)",
            duration_s,
            f_center_hz,
            file_path,
            recording_id,
        )
        return recording_id, file_path
