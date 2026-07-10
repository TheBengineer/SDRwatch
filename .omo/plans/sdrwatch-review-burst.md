# SDRWatch — Phase 1 (Review Workflow) & Phase 2 (Burst/Monitor Mode)

Two-phase feature. Phase 1 adds `?review=1` mode to recordings page — step through signals one-by-one, try modulations, classify. Phase 2 adds burst capture — tune to a frequency, detect signal onset via energy threshold, record bursts, loop.

## TODOs

### Wave 1 — Foundation (Parallel, no deps)

1. [x] BurstCapture class. Create sdrwatch/recording/burst.py (~200 lines). Time-domain energy detection (mean|buf|^2). EMA noise floor (alpha=0.01, frozen during signal). Hysteretic thresholds (HI=noise+6dB, LO=noise+2dB). Consecutive-buffer debounce (2 onset, 3 offset). Warmup (2-10s from percentile). Returns event dict on burst completion. Category: deep. QA: 8 acceptance criteria (imports, state transitions, EMA freeze, event dict).

2. [x] Review mode JS. Add conditional JS block to templates/recordings.html (~50 lines). When ?review=1 query param present: hide filters/table, group recordings by detection_id, show single recording with amplitude plot + all 5 demod buttons + classification dropdown + label + next/prev. Reuse existing drawAmplitude, playModulation, etc. Category: quick. QA: 8 checks (table hides, grouping, nav, demod works, classify saves, auto-advance).

3. [x] Web review route. Add review param pass-through in sdrwatch_web/blueprints/views.py recordings_page(). Category: quick. QA: GET /recordings?review=1 renders, GET /recordings unchanged.

### Wave 2 — Burst Infrastructure (needs T1)

4. [x] BurstCapture unit tests. Create tests/test_burst.py (~150 lines, 10 tests). Synthetic IQ via MockSDR. Test: warmup returns None, onset triggers capture, offset finalizes, max_duration finalizes, hysteresis prevents chatter, EMA tracks noise floor, EMA frozen during signal, empty buffer safe, returns event dict, writes .cf32. Category: quick. QA: pytest tests/test_burst.py -v all 10 pass.

5. [x] CLI monitor subcommand. Add monitor subparser to sdrwatch/cli.py. Flags: --freq, --samp-rate, --threshold-db, --max-duration, --capture-dir, --db, --driver, --gain. cmd_monitor() function instantiates BurstCapture and loops until Ctrl+C. Category: quick. QA: --help shows options, Ctrl+C graceful stop.

### Wave 3 — Integration (needs Wave 2)

6. [x] Integration test. Synthetic integration test (tests/test_burst_integration.py) with simulated buffer sequence through BurstCapture. Category: unspecified-low. QA: Synthetic burst produces capture event with correct duration.

### Wave 4 — QA (needs T3)

7. [x] QA smoke test. Manual browser check of /recordings?review=1. 9-point checklist: normal table renders, review UI shows, grouping by detection_id, prev/next wraps, demod buttons work, amplitude plot loads, classification saves, auto-advance toggles, refresh preserves state. Category: unspecified-low. QA: All 9 checks pass.

## Final Verification Wave

F1. [x] Phase 1: /recordings?review=1 renders functional review UI, no backend changes
F2. [x] Phase 2: python -m sdrwatch.cli monitor --freq <freq> runs burst capture, writes .cf32, loops until Ctrl+C
F3. [x] All tests pass: pytest tests/test_burst.py -v (10 tests)
F4. [x] Zero backend changes for Phase 1 — all existing API endpoints reused
