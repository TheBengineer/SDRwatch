# SDRWatch IQ Recording & Demodulation Pipeline

Extend SDRWatch to capture raw IQ from detected signals during sweeps, classify/demodulate/compress them to OGG, manage storage lifecycle, and provide CLI replay. Architecture is in-process (same SDR device, post-revisit pass), CF32 native format, CLI-first with web deferred.

## TODOs

### Wave 1 — Foundation (Parallel, no deps)

1. [x] Create recording/ package skeleton. Files: sdrwatch/recording/__init__.py, recorder.py, demod.py, classifier.py, compressor.py, cleanup.py — all stubs with docstrings. QA: python3 -c "from sdrwatch.recording import recorder, demod, classifier, compressor, cleanup"

2. [x] DB schema — recordings + ignore_rules tables. Add CREATE TABLE IF NOT EXISTS to store.py:Store._init() and sdrwatch_web/schema.py:ensure_baseline_schema(). recordings(id PK, baseline_id FK, detection_id, f_center_hz, bandwidth_hz, started_utc, duration_ms, sample_rate_hz, raw_path, raw_bytes, modulation, ogg_path, ogg_bytes, raw_deleted, status, error, created_utc). ignore_rules(id PK, baseline_id FK, f_center_hz, tolerance_hz, label, created_utc). QA: New DB has both tables, existing DB migrates cleanly.

### Wave 2 — Core Capture Primitives (needs Wave 1, parallel in wave)

3. [x] IQRecorder — tune, capture CF32, tofile, insert DB row. Implement recorder.py: tune src to f_center, read(N) where N = samp_rate * duration, write via tofile() to capture_dir/raw/, insert recordings row with status=raw. QA: mock test produces correct file size + DB row.

4. [x] FM demodulator. Implement demod.py:demodulate_fm() using np.diff(np.unwrap(np.angle())) + 75us deemphasis IIR filter. Returns float32 mono audio array. QA: Synthetic FM tone at 75kHz deviation produces audible 1kHz output verified by FFT.

5. [x] OGG compressor. Implement compressor.py:compress_to_ogg() — write float32 array to temp WAV, shell to ffmpeg -c:a libvorbis, clean up temp. Graceful fallback if ffmpeg not on PATH. QA: 440Hz float32 array -> valid .ogg, no temp files leaked.

6. [x] Ignore CLI subcommand. sdrwatch ignore --add FREQ --tolerance HZ --label TEXT, sdrwatch ignore --remove ID, sdrwatch ignore --list. DB methods: add_ignore_rule(), remove_ignore_rule(), list_ignore_rules(), is_frequency_ignored(). QA: Add rule -> list shows it -> remove -> list empty -> recording pass skips frequency.

### Wave 3 — Sweeper Integration (needs Wave 2)

7. [x] CLI flags + Sweeper._run_recording_pass(). Add --capture-iq, --capture-dir, --capture-duration, --record-ttl-days, --record-quota-gb, --record-max-signals to CLI. After sweep+revisit in Sweeper.run(), call _run_recording_pass() that filters by ignore_rules, sorts by bandwidth asc, records via IQRecorder, calls classifier->demodulate->compress->delete raw. QA: With --capture-iq, .cf32 files appear then .ogg files appear then .cf32 deleted. Without flag, no behavior change.

8. [x] Raw IQ deletion after OGG. After compress_to_ogg() succeeds: os.remove(raw_path), set raw_deleted=1. On failure: set status=compression_failed, keep raw file. QA: Raw deleted on success, kept on failure.

### Wave 4 — Phase 0 Verification (needs Wave 3)

9. [x] Phase 0 end-to-end hardware verification. Run on real RTL-SDR against 88-108 MHz FM band with --capture-iq. Verify recordings table has status=compressed rows, .ogg files playable, no .cf32 files remain. Fix any issues found.

### Wave 5 — Expanded Modulations (needs Wave 4, parallel in wave)

10. [x] AM/CW/LSB/USB demodulators. Implement demod.py: demodulate_am() (envelope + DC block), demodulate_cw() (narrow BPF), demodulate_lsb()/demodulate_usb() (Hilbert transform sideband selection). Each returns float32 audio. QA: Each demod has unit test with synthetic modulated signal.

11. [x] Heuristic modulation classifier. Implement classifier.py:classify_modulation() using spectral decision tree — bandwidth occupancy, carrier presence, peak-to-avg ratio, spectral symmetry. Writes to recordings.modulation as advisory metadata. QA: >80% accuracy on synthetic test set.

12. [x] Replay CLI subcommand. sdrwatch replay --id RECORDING_ID --modulation fm/am/cw/lsb/usb --output out.ogg. Loads raw .cf32, applies selected demodulator, writes .ogg via compressor. QA: Output .ogg playable, matches expected duration.

### Wave 6 — Management (needs Wave 5)

13. [x] Retention TTL + quota enforcement. Implement cleanup.py:enforce_retention() — delete recordings older than TTL days; if raw+ogg bytes exceed quota GB, delete oldest recordings. Add sdrwatch record cleanup CLI command to trigger immediately. QA: 8-day-old recording deleted by 7-day TTL. Quota enforcement deletes oldest when over limit.

### Wave 7 — Advanced Features (needs Wave 6, parallel in wave)

14. [x] Continuous capture mode. --continuous-capture implies --capture-iq, runs capture pass after each sweep in a loop. QA: --loop --continuous-capture produces recordings per cycle.

15. [x] Management CLI: status. sdrwatch record status: total recordings, disk usage, oldest, newest. QA: Human-readable summary printed.

16. [x] SNR-prioritized recording order. Change recording sort key from bandwidth-asc to SNR-asc (weakest signals captured first, they are most ephemeral). QA: With 2 signals at 30dB and 6dB and --record-max-signals=1, only 6dB signal is captured.

17. [x] Daemon pass-through in controller. Add capture flags to sdrwatch-control.py:_build_cmd() mapping_num and boolean lists. QA: Controller submits --capture-iq --continuous-capture flags correctly.

## Final Verification Wave

F1. [x] Full pipeline E2E on real RTL-SDR. Run continuous capture on 88-108 MHz FM band. Verify .ogg files are playable. Verify raw .cf32 files are deleted after compression. Verify ignore list works.

F2. [x] Retention enforcement. Verify TTL pruning and quota enforcement by creating recordings with past timestamps vs current timestamps.

F3. [x] CLI subcommands. Verify sdrwatch replay, sdrwatch ignore, sdrwatch record status, sdrwatch record cleanup all produce correct output.

F4. [x] No regressions. Existing sweep/detection/baseline behavior unchanged when --capture-iq is NOT set.
