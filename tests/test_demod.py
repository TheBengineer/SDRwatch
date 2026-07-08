"""Tests for FM/AM/CW/SSB demodulators."""
import numpy as np

from sdrwatch.recording.demod import demodulate_fm


def test_demodulate_fm_sine_tone_produces_peak_at_modulation_frequency() -> None:
    """Synthetic FM tone at 75 kHz deviation produces output with FFT peak at 1 kHz."""
    samp_rate = 2.4e6
    duration = 0.1  # seconds
    t = np.arange(0, duration, 1.0 / samp_rate, dtype=np.float64)

    # FM modulation: 1 kHz tone, 75 kHz deviation
    mod_freq = 1000.0  # Hz
    beta = 75000.0 / mod_freq  # modulation index = 75

    phase = beta * np.sin(2 * np.pi * mod_freq * t)
    cf32 = np.exp(1j * phase).astype(np.complex64)

    audio = demodulate_fm(cf32, samp_rate)

    # FFT to find dominant frequency in output
    audio_rate = 48000
    n = len(audio)
    window = np.hanning(n)
    spectrum = np.fft.rfft(audio * window)
    freqs = np.fft.rfftfreq(n, 1.0 / audio_rate)

    # Find peak in 900-1100 Hz range
    idx_range = np.where((freqs >= 900) & (freqs <= 1100))[0]
    peak_idx = idx_range[np.argmax(np.abs(spectrum[idx_range]))]
    peak_freq = freqs[peak_idx]

    assert 950 <= peak_freq <= 1050, (
        f"Expected FFT peak near 1000 Hz, got {peak_freq:.1f} Hz"
    )


def test_demodulate_fm_sine_tone_snr_above_20db() -> None:
    """FM demodulation of a clean sine tone yields output with >20 dB SNR at 1 kHz."""
    samp_rate = 2.4e6
    duration = 0.1
    t = np.arange(0, duration, 1.0 / samp_rate, dtype=np.float64)

    mod_freq = 1000.0
    beta = 75000.0 / mod_freq
    phase = beta * np.sin(2 * np.pi * mod_freq * t)
    cf32 = np.exp(1j * phase).astype(np.complex64)

    audio = demodulate_fm(cf32, samp_rate)

    audio_rate = 48000
    n = len(audio)
    spectrum = np.fft.rfft(audio * np.hanning(n))
    freqs = np.fft.rfftfreq(n, 1.0 / audio_rate)

    # Signal power at 1 kHz ±50 Hz
    sig_mask = (freqs >= 950) & (freqs <= 1050)
    signal_power = np.max(np.abs(spectrum[sig_mask]))

    # Noise power outside signal band (200 Hz-20 kHz, excluding 950-1050)
    noise_mask = (freqs >= 200) & (freqs <= 20000) & ~sig_mask
    noise_power = np.median(np.abs(spectrum[noise_mask]))

    snr_db = 20 * np.log10(signal_power / noise_power)
    assert snr_db > 20, f"Expected SNR > 20 dB, got {snr_db:.1f} dB"


def test_demodulate_fm_handles_empty_input() -> None:
    """FM demodulation of empty input returns empty array."""
    cf32 = np.array([], dtype=np.complex64)
    audio = demodulate_fm(cf32, 2.4e6)
    assert len(audio) == 0
    assert audio.dtype == np.float32


def test_demodulate_fm_returns_float32() -> None:
    """FM demodulation returns float32 array."""
    samp_rate = 2.4e6
    t = np.arange(0, 0.01, 1.0 / samp_rate, dtype=np.float64)
    cf32 = np.exp(1j * 75.0 * np.sin(2 * np.pi * 1000 * t)).astype(np.complex64)
    audio = demodulate_fm(cf32, samp_rate)
    assert audio.dtype == np.float32


def test_demodulate_fm_output_in_neg_one_to_one() -> None:
    """FM demodulation output is normalized to [-1, 1]."""
    samp_rate = 2.4e6
    t = np.arange(0, 0.05, 1.0 / samp_rate, dtype=np.float64)
    cf32 = np.exp(1j * 75.0 * np.sin(2 * np.pi * 1000 * t)).astype(np.complex64)
    audio = demodulate_fm(cf32, samp_rate)
    assert np.all(np.abs(audio) <= 1.0 + 1e-6), "Output exceeds [-1, 1] range"
