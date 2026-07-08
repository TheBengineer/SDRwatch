"""Demodulators: FM, AM, CW, LSB, USB from complex float32 IQ."""
import numpy as np
import scipy.signal


def demodulate_fm(cf32: np.ndarray, samp_rate: float) -> np.ndarray:
    """FM broadcast demodulation via phase discriminator + 75us deemphasis.

    Args:
        cf32: Complex float32 IQ samples.
        samp_rate: Sample rate in Hz (typically 2.4e6).

    Returns:
        Float32 mono audio array at standard audio rate (48 kHz if decimated).
    """
    if len(cf32) < 2:
        return np.array([], dtype=np.float32)

    # 1. Phase discriminator
    rot = np.diff(np.unwrap(np.angle(cf32)))

    # 2. Deemphasis (75 us single-pole IIR for WBFM broadcast)
    dt = 1.0 / samp_rate
    rc = 75e-6
    alpha = dt / (rc + dt)
    audio = scipy.signal.lfilter([alpha], [1, -(1 - alpha)], rot)

    # 3. Scale to [-1, 1] using max FM deviation (75 kHz for WBFM)
    audio = audio / (2.0 * np.pi * 75000.0 * dt)

    # 4. Decimate to standard audio rate (48 kHz)
    audio_rate = 48000.0
    if samp_rate > audio_rate:
        decimation = int(round(samp_rate / audio_rate))
        audio = scipy.signal.decimate(audio, decimation, ftype="iir", zero_phase=True)

    # 5. Normalize peak to 1.0
    peak = np.max(np.abs(audio))
    if peak > 0:
        audio = audio / peak

    return audio.astype(np.float32)


def demodulate_am(cf32: np.ndarray, samp_rate: float) -> np.ndarray:
    """AM demodulation via envelope detection + DC block.

    Args:
        cf32: Complex float32 IQ samples.
        samp_rate: Sample rate in Hz (typically 2.4e6).

    Returns:
        Float32 mono audio array at standard audio rate (48 kHz if decimated).
    """
    if len(cf32) < 2:
        return np.array([], dtype=np.float32)

    # 1. Envelope detection
    envelope = np.abs(cf32)

    # 2. DC block (remove carrier component)
    audio = scipy.signal.lfilter([1, -1], [1, -0.999], envelope)

    # 3. Decimate to standard audio rate (48 kHz)
    audio_rate = 48000.0
    if samp_rate > audio_rate:
        decimation = int(round(samp_rate / audio_rate))
        audio = scipy.signal.decimate(audio, decimation, ftype="iir", zero_phase=True)

    # 4. Normalize peak to 1.0
    peak = np.max(np.abs(audio))
    if peak > 0:
        audio = audio / peak

    return audio.astype(np.float32)


def demodulate_cw(cf32: np.ndarray, samp_rate: float) -> np.ndarray:
    """CW demodulation via narrow bandpass filter + envelope detection.

    Applies a 500 Hz bandpass filter centered at 800 Hz audio tone,
    then recovers the Morse keying via envelope detection.  The signal
    is first decimated to ~48 kHz so the narrow IIR bandpass is
    numerically stable.

    Args:
        cf32: Complex float32 IQ samples.
        samp_rate: Sample rate in Hz (typically 2.4e6).

    Returns:
        Float32 mono audio array at standard audio rate (48 kHz if decimated).
    """
    if len(cf32) < 2:
        return np.array([], dtype=np.float32)

    # 1. Decimate to ~48 kHz first so the narrow BPF is numerically stable
    audio_rate = 48000.0
    if samp_rate > audio_rate:
        decimation = int(round(samp_rate / audio_rate))
        sig = scipy.signal.decimate(cf32, decimation, ftype="iir", zero_phase=True)
        filt_rate = audio_rate
    else:
        sig = cf32
        filt_rate = float(samp_rate)

    # 2. Narrow bandpass filter: 500 Hz BW centered on 800 Hz
    nyquist = filt_rate / 2.0
    low = max(1.0, 800.0 - 250.0) / nyquist
    high = min(filt_rate / 2.0 - 1.0, 800.0 + 250.0) / nyquist
    sos = scipy.signal.butter(4, [low, high], btype="band", output="sos")
    filtered = scipy.signal.sosfilt(sos, sig)

    # 3. Envelope detection
    envelope = np.abs(filtered)

    # 4. DC block
    audio = scipy.signal.lfilter([1, -1], [1, -0.999], envelope)

    # 5. Normalize peak to 1.0
    peak = np.max(np.abs(audio))
    if peak > 0:
        audio = audio / peak

    return audio.astype(np.float32)


def demodulate_lsb(cf32: np.ndarray, samp_rate: float) -> np.ndarray:
    """LSB demodulation via FFT sideband selection.

    Extracts the lower sideband by zeroing positive frequencies in the
    complex baseband spectrum, then recovering the real audio.

    Args:
        cf32: Complex float32 IQ samples.
        samp_rate: Sample rate in Hz (typically 2.4e6).

    Returns:
        Float32 mono audio array at standard audio rate (48 kHz if decimated).
    """
    if len(cf32) < 2:
        return np.array([], dtype=np.float32)

    n = len(cf32)
    # 1. FFT — keep only negative frequencies (LSB)
    spectrum = np.fft.fft(cf32)
    spectrum[0] = 0           # remove DC (no carrier in SSB)
    spectrum[1 : n // 2 + 1] = 0  # zero out positive freqs + Nyquist
    audio = np.real(np.fft.ifft(spectrum)) * 2.0

    # 2. Decimate to standard audio rate (48 kHz)
    audio_rate = 48000.0
    if samp_rate > audio_rate:
        decimation = int(round(samp_rate / audio_rate))
        audio = scipy.signal.decimate(audio, decimation, ftype="iir", zero_phase=True)

    # 3. Normalize peak to 1.0
    peak = np.max(np.abs(audio))
    if peak > 0:
        audio = audio / peak

    return audio.astype(np.float32)


def demodulate_usb(cf32: np.ndarray, samp_rate: float) -> np.ndarray:
    """USB demodulation via FFT sideband selection.

    Extracts the upper sideband by zeroing negative frequencies in the
    complex baseband spectrum, then recovering the real audio.

    Args:
        cf32: Complex float32 IQ samples.
        samp_rate: Sample rate in Hz (typically 2.4e6).

    Returns:
        Float32 mono audio array at standard audio rate (48 kHz if decimated).
    """
    if len(cf32) < 2:
        return np.array([], dtype=np.float32)

    n = len(cf32)
    # 1. FFT — keep only positive frequencies (USB)
    spectrum = np.fft.fft(cf32)
    spectrum[0] = 0           # remove DC (no carrier in SSB)
    spectrum[n // 2 :] = 0    # zero out Nyquist + negative freqs
    audio = np.real(np.fft.ifft(spectrum)) * 2.0

    # 2. Decimate to standard audio rate (48 kHz)
    audio_rate = 48000.0
    if samp_rate > audio_rate:
        decimation = int(round(samp_rate / audio_rate))
        audio = scipy.signal.decimate(audio, decimation, ftype="iir", zero_phase=True)

    # 3. Normalize peak to 1.0
    peak = np.max(np.abs(audio))
    if peak > 0:
        audio = audio / peak

    return audio.astype(np.float32)
