"""OGG compression via ffmpeg subprocess."""
from __future__ import annotations

import os
import subprocess
import tempfile

import numpy as np

from sdrwatch.util.logging import get_logger

_log = get_logger(__name__)


def _has_ffmpeg() -> bool:
    """Check if ffmpeg is available on the system PATH."""
    try:
        subprocess.run(["ffmpeg", "-version"], capture_output=True, timeout=5)
        return True
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False


def compress_to_ogg(
    audio: np.ndarray,
    samp_rate: float,
    output_path: str,
) -> bool:
    """Compress float32 mono audio to OGG Vorbis using ffmpeg.

    Args:
        audio: Float32 mono audio array. Values should be in [-1, 1] range.
        samp_rate: Audio sample rate in Hz.
        output_path: Destination path for the .ogg file.

    Returns:
        True on success, False on failure (ffmpeg missing or error).
    """
    if not _has_ffmpeg():
        _log.warning("ffmpeg not found on PATH; OGG compression unavailable")
        return False

    tmp_path: str | None = None

    try:
        # Write float32 audio as raw PCM to temp file
        with tempfile.NamedTemporaryFile(suffix=".f32le", delete=False) as tmp:
            tmp_path = tmp.name
            audio.astype(np.float32).tofile(tmp)

        # Encode with ffmpeg
        cmd = [
            "ffmpeg", "-y",
            "-f", "f32le",
            "-ar", str(int(samp_rate)),
            "-ac", "1",
            "-i", tmp_path,
            "-c:a", "libvorbis",
            "-q:a", "3",
            output_path,
        ]
        result = subprocess.run(cmd, capture_output=True, timeout=120)
        if result.returncode != 0:
            stderr = result.stderr.decode("utf-8", errors="replace")[:500]
            _log.error("ffmpeg failed (exit %d): %s", result.returncode, stderr)
            return False

        _log.info("compressed to OGG: %s", output_path)
        return True

    except subprocess.TimeoutExpired:
        _log.error("ffmpeg timed out after 120s")
        return False
    except Exception as e:
        _log.error("compression error: %s", e)
        return False
    finally:
        # Clean up temp file
        if tmp_path is not None:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
