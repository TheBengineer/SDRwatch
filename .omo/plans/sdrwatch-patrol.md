# SDRWatch Patrol Mode — Adaptive Sweep + Burst Recording

Continuous band scanning that records signals on detection, learns their locations,
and prioritizes known-active frequencies.

## TODOs

1. [ ] Create signal_locations table. sdrwatch/baseline/store.py: add patrol_tracker table (f_center_hz, hit_count, last_seen_utc, avg_duration_s, band). sdrwatch_web/schema.py: migration. Category: quick.

2. [ ] Create sdrwatch/recording/patrol.py. PatrolScanner class: loads signal_locations, builds adaptive scan plan (known freqs first, then gaps). Uses BurstCapture energy detection per window. On detection: records burst (reuse IQRecorder + demod endpoint). On completion: updates signal_locations. Category: deep.

3. [ ] Add patrol CLI subcommand. sdrwatch/cli.py: patrol --start FREQ --stop FREQ [--threshold-db N] [--max-duration N]. Category: quick.

4. [ ] Learning logic: after each burst, update signal_locations hit_count and last_seen. Frequencies with >=3 hits get priority scan every cycle. Frequencies with no hits for >24h get deprioritized. Category: unspecified-low.
