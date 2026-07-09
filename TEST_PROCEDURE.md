# SDRWatch — Test Procedure

## Scope

Covers: BurstCapture module, CLI monitor subcommand, and review workflow (`?review=1`).

---

## Section 1: Unit Tests (Automated)

Run all unit tests:

```bash
cd /home/bengi/SDRWatch
python3 -m pytest tests/test_burst.py -v
```

Expected: **10/10 passed**

| Test | What it verifies | Pass/Fail |
|------|------------------|-----------|
| `test_warmup_returns_none` | `read()` returns `None` during warmup period | |
| `test_warmup_completes` | After warmup, signal above HI threshold triggers capture | |
| `test_onset_triggers_capture` | Energy above HI for 2+ consecutive buffers triggers onset | |
| `test_offset_finalizes` | After onset, energy below LO for 3+ buffers finalizes capture | |
| `test_max_duration_finalizes` | Capture finalizes when duration > `max_duration_s` | |
| `test_hysteresis_prevents_chatter` | Signal in hysteresis band (LO < x < HI) doesn't trigger | |
| `test_ema_tracks_noise_floor` | EMA converges to actual noise level within 3 dB | |
| `test_ema_frozen_during_signal` | EMA does NOT update while signal is active | |
| `test_empty_buffer_safe` | Empty buffer doesn't crash `read()` | |
| `test_returns_event_dict` | Finalized capture returns dict with all expected keys | |

### Debugging failed tests

If a test fails, inspect the specific assertion:

```bash
python3 -m pytest tests/test_burst.py::test_onset_triggers_capture -v --tb=long
```

---

## Section 2: Unit Test Coverage (Adversarial)

Each test probes an adversarial class. Verify coverage:

| Ultraqa Class | Probed by | Result |
|---------------|-----------|--------|
| **Malformed input** | `test_empty_buffer_safe` — zero buffer doesn't crash | |
| **Hung/long commands** | `test_max_duration_finalizes` — long burst triggers max-duration cutoff | |
| **Flaky tests** | Run `pytest tests/test_burst.py --count=5 2>&1 | tail -5` (needs pytest-repeat) — verify no flaky failures | |
| **Stale state** | `test_ema_frozen_during_signal` — EMA doesn't update during capture | |
| **Misleading success** | `test_returns_event_dict` — verifies ALL expected keys, not just some | |
| **Repeated interruptions** | `test_hysteresis_prevents_chatter` — signal hovering at threshold doesn't toggle | |

---

## Section 3: BurstCapture Integration Test (Simulated)

Test the full burst pipeline without real SDR hardware.

### 3.1: Simulated burst → capture event

```bash
cd /home/bengi/SDRWatch
python3 -c "
import numpy as np
from sdrwatch.recording.burst import BurstCapture

# Mock SDR that produces a noise floor then a burst then silence
class MockSDR:
    def __init__(self):
        self._idx = 0
        self._bufs = []
        # 20 buffers of noise at -50 dBm (8192 samples each)
        for _ in range(20):
            self._bufs.append(np.random.normal(0, 10**(-50/20), 8192).astype(np.complex64))
        # 30 buffers of signal at -20 dBm
        for _ in range(30):
            self._bufs.append(np.random.normal(0, 10**(-20/20), 8192).astype(np.complex64))
        # 20 buffers of silence
        for _ in range(20):
            self._bufs.append(np.random.normal(0, 10**(-50/20), 8192).astype(np.complex64))
    def read(self, n):
        if self._idx >= len(self._bufs): return np.zeros(n, dtype=np.complex64)
        self._idx += 1
        return np.resize(self._bufs[self._idx-1], n)
    def tune(self, f): pass
    def close(self): pass

import tempfile
with tempfile.TemporaryDirectory() as tmp:
    cap = BurstCapture(MockSDR(), f_center_hz=100e6, threshold_db=6.0, warmup_s=0.01, capture_dir=tmp)
    events = []
    for _ in range(80):
        ev = cap.read()
        if ev: events.append(ev)
    assert len(events) == 1, f'Expected 1 burst, got {len(events)}'
    e = events[0]
    assert e['duration_s'] > 0, 'Duration must be > 0'
    assert e['raw_path'] and os.path.exists(e['raw_path']), 'Raw file must exist'
    print(f'PASS: Burst captured: {e[\"duration_s\"]:.1f}s at {e[\"f_center_hz\"]} Hz')
    print(f'  Peak power: {e[\"max_power_db\"]:.1f} dB')
    print(f'  Noise floor: {e[\"noise_floor_db\"]:.1f} dB')
    import os
    print(f'  File: {e[\"raw_path\"]} ({os.path.getsize(e[\"raw_path\"])} bytes)')
"
```

**PASS criteria**: Script prints "PASS" with burst details, no assertions fail.

### 3.2: No-signal scenario (all noise)

```bash
cd /home/bengi/SDRWatch
python3 -c "
import numpy as np, tempfile
from sdrwatch.recording.burst import BurstCapture
class NoiseSDR:
    def __init__(self):
        self._bufs = [np.random.normal(0, 10**(-50/20), 8192).astype(np.complex64) for _ in range(200)]
        self._idx = 0
    def read(self, n):
        if self._idx >= len(self._bufs): return np.zeros(n, dtype=np.complex64)
        self._idx += 1; return np.resize(self._bufs[self._idx-1], n)
    def tune(self, f): pass
    def close(self): pass
with tempfile.TemporaryDirectory() as tmp:
    cap = BurstCapture(NoiseSDR(), f_center_hz=100e6, threshold_db=6.0, warmup_s=0.01, capture_dir=tmp)
    events = [cap.read() for _ in range(200)]
    events = [e for e in events if e]
    assert len(events) == 0, f'No bursts expected in noise-only signal, got {len(events)}'
    print('PASS: No false triggers on noise-only input')
"
```

**PASS criteria**: Prints "PASS: No false triggers", no assertions fail.

---

## Section 4: Manual CLI Test (Requires RTL-SDR)

Test with real hardware in a controlled environment.

### 4.1: Monitor FM broadcast band

**Setup**: Place an antenna near a known strong FM station (88–108 MHz).

```bash
cd /home/bengi/SDRWatch

# Step 1: Find a strong local FM station
python3 -m sdrwatch.cli --start 88e6 --stop 108e6 --driver rtlsdr 2>&1 | grep -E 'window|detection|promoted'

# Note a frequency with high detections, e.g. 100.5 MHz

# Step 2: Monitor that frequency
python3 -m sdrwatch.cli monitor --freq 100.5e6 --threshold-db 8 --max-duration 10 --capture-dir /tmp/burst-test

# Step 3: While monitoring, briefly unplug/replug the antenna to simulate signal dropout
# Expect: bursts captured when signal is present, silence otherwise
```

**Expected behavior**:
- Warmup period (~5s): no output
- Signal present: bursts are captured, logged to console
- Signal absent: idle, no false triggers
- Ctrl+C: clean shutdown

**PASS criteria**: At least one `.cf32` file created in `/tmp/burst-test/raw/`.

### 4.2: Monitor a quiet frequency (no-signal baseline)

```bash
cd /home/bengi/SDRWatch
python3 -m sdrwatch.cli monitor --freq 1e9 --threshold-db 10 --max-duration 10 --capture-dir /tmp/burst-test-quiet
# Run for 30 seconds, then Ctrl+C
```

**Expected behavior**: Warmup completes, then quiet monitoring. Zero or very few false triggers (< 3 in 30s is acceptable).

**PASS criteria**: Runs without errors, no more than 3 false bursts in 30 seconds.

### 4.3: Monitor an EMS/police frequency (if applicable)

```bash
# Tune to a known active frequency in your area
python3 -m sdrwatch.cli monitor --freq 155.1e6 --threshold-db 6 --max-duration 30 --capture-dir /tmp/burst-test-ems
```

**Expected behavior**: Bursts captured when transmissions occur, timed out at max 30s if signal continues.

**PASS criteria**: Captured bursts are demodulatable via the recordings page.

---

## Section 5: Review Workflow Test (Browser)

### 5.1: Normal recordings page (no regression)

1. Open `http://localhost:8080/recordings`
2. Verify: filters toolbar visible, recordings table visible, bulk delete button present
3. Click a recording row → expand row shows amplitude plot + modulation buttons + audio player

**PASS criteria**: All elements render correctly, no console errors.

### 5.2: Review mode

1. Open `http://localhost:8080/recordings?review=1`
2. Verify:
   - [ ] Filters toolbar is hidden
   - [ ] Recordings table is hidden
   - [ ] Single recording card displayed with frequency, duration, sample rate
   - [ ] Amplitude plot loads (canvas renders waveform)
   - [ ] Audio player is present
   - [ ] 5 demod buttons visible: FM, AM, CW, LSB, USB
   - [ ] Classification dropdown: Unknown, Friendly, Ambient, Hostile
   - [ ] Label text input
   - [ ] Save & Next button
   - [ ] Auto-advance checkbox
   - [ ] Prev/Next navigation buttons
   - [ ] Progress indicator ("Signal N of M")
3. Click "Next" → advances to next recording
4. Click "Prev" → goes back
5. Click FM demod button → audio plays through player
6. Click AM demod button → audio re-demodulates and plays
7. Select classification → click "Save & Next" → advances and shows success status
8. Check "Auto-advance" → classification saves and auto-advances

**PASS criteria**: All 12 items checked and functional.

### 5.3: Edge cases

1. Open `http://localhost:8080/recordings?review=1` with no recordings in DB
   - Verify: "No recordings found for review" message displayed
2. Open `http://localhost:8080/recordings?review=1` with only one recording
   - Verify: Prev/Next buttons disabled or hidden correctly

**PASS criteria**: Error states handled gracefully.

---

## Section 6: CLI --help verification

```bash
python3 -m sdrwatch.cli monitor --help
```

Expected output includes all 8 flags:

| Flag | Present |
|------|---------|
| `--freq` | |
| `--samp-rate` | |
| `--threshold-db` | |
| `--max-duration` | |
| `--capture-dir` | |
| `--db` | |
| `--driver` | |
| `--gain` | |

**PASS criteria**: All 8 flags listed in help output.

---

## Section 7: Regression Tests

Ensure existing features still work:

```bash
# Basic sweep still works
python3 -m sdrwatch.cli --list-profiles

# Existing subcommands work
python3 -m sdrwatch.cli ignore --help
python3 -m sdrwatch.cli replay --help
python3 -m sdrwatch.cli record status --db /tmp/test.db

# Existing unit tests still pass
python3 -m pytest tests/test_demod.py -v
```

**PASS criteria**: All commands exit 0, all existing tests pass.

---

## Section 8: Test Sign-Off

| Section | Test | Status (Pass/Fail) | Tester | Date |
|---------|------|-------------------|--------|------|
| 1 | Unit tests (10/10) | | | |
| 2 | Adversarial coverage | | | |
| 3.1 | Simulated burst | | | |
| 3.2 | Noise-only | | | |
| 4.1 | FM broadcast monitor | | | |
| 4.2 | Quiet frequency | | | |
| 4.3 | EMS monitor | | | |
| 5.1 | Recordings page | | | |
| 5.2 | Review mode | | | |
| 5.3 | Edge cases | | | |
| 6 | CLI --help | | | |
| 7 | Regression | | | |

**Final verdict**: `PASS` / `FAIL` (circle one)

**Notes**:
