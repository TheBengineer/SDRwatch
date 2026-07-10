# SDR-Watch

![Platform](https://img.shields.io/badge/platform-Raspberry%20Pi%205-red)
![SDR](https://img.shields.io/badge/SDR-RTL--SDR%20%7C%20SoapySDR-blue)
![Planned SDRs](https://img.shields.io/badge/Planned-HackRF%2C%20Airspy%2C%20LimeSDR%2C%20USRP-yellow)
![UI](https://img.shields.io/badge/UI-React%20SPA%20%2B%20Flask%20API-blue)
![License](https://img.shields.io/badge/license-MIT-lightgrey)

**Tactical spectrum situational awareness for SDR devices — wideband scanning, baseline tracking, signal classification, IQ recording, and a real-time React SPA dashboard.**

SDR-Watch transforms a Raspberry Pi 5 (or any Linux host) with an RTL-SDR dongle into a **persistent spectrum monitoring station**. It sweeps wide frequency ranges, detects and logs signals, builds long-term baselines, classifies modulation types, captures IQ recordings, and maps detections to official frequency allocations.

---

## Capabilities

### Core Scanning & Detection
- **Wideband sweeps** across tunable ranges using RTL-SDR (native or SoapySDR abstraction)
- **CFAR detection** with median + MAD noise floor estimation
- **Two-pass verification** — revisit sweeps refine bandwidths and suppress false positives
- **Scan profiles** — preset configurations for FM broadcast, ISM bands, and general VHF/UHF
- **Persistence modes** — control how tentative detections become persistent (hits, duration, or both)
- **Spur calibration** — identify and suppress known SDR artifacts

### Baseline Tracking
- **Long-term EMA noise floor** — exponential moving average per frequency bin
- **Occupancy tracking** — per-bin occupancy counts and duty-cycle analysis
- **Persistent signal registry** — signals that survive multiple sweeps are promoted to `baseline_detections`
- **Baseline management** — create and switch between multiple baselines for different antennas, locations, or time windows

### IQ Recording Pipeline
- **Burst capture** — energy-triggered IQ recording with hysteretic thresholds
- **Patrol mode** — adaptive multi-frequency burst capture that learns active frequencies
- **Modulation classification** — heuristic decision tree (FM, AM, CW, LSB, USB, digital) from spectral features
- **OGG compression** — `ffmpeg`-based audio compression of demodulated recordings
- **Retention management** — TTL-based cleanup and disk quota enforcement

### Tactical Web Dashboard (React SPA)
- **Dashboard** — tactical snapshot, frequency/timeline/SNR/coverage charts, signal card grid, change feed
- **Signals list** — TanStack table with sortable columns, classification filters, bulk operations
- **Signal detail** — full metadata view, classification/label/notes editing, threat assessment, recording queue
- **Recordings** — sortable TanStack table, waveform canvas with click-to-seek, audio playback, on-demand demodulation (WBFM, FM, AM, CW, LSB, USB)
- **Spectrum viewer** — Canvas 2D renderer with zoom/pan, signal markers, and recording annotations
- **Changes feed** — real-time NEW, QUIETED, and POWER_SHIFT event tracking
- **Control panel** — scan job creation, profile selection, device management, live log tailing
- **Live view** — real-time scan window stream with strip chart
- **Spur map** — read-only view of calibrated spur bins
- **Debug panel** — health checks, DB stats, config inspect, error ring buffer

### Controller & API
- **RESTful job API** — `/api/jobs/*` for listing, starting, stopping scan jobs
- **Signal management API** — `/api/signals/*` CRUD with classification, labels, notes
- **Recording API** — `/api/recordings/*` with filtering, download, demodulation, bulk delete
- **Spectrum API** — `/api/spectrum` with configurable downsampling
- **Chart API** — `/api/charts/*` for frequency bins, timeline, SNR histogram, coverage heatmap
- **Bearer token auth** — protect API and control endpoints via `SDRWATCH_TOKEN`

### Container & Dev Tooling
- **Docker Compose** — multi-stage builds (Node frontend + Python backend), USB SDR passthrough
- **Linting** — Ruff (Python) + ESLint (TypeScript) with unified config
- **Auto-discovery** — controller resolves scanner paths for flexible deployments

---

## Intended Workflow

### 1. Hardware Setup
Connect an RTL-SDR dongle (e.g., Nooelec NESDR SMArTee v5) to the host machine. For Docker deployments with USB passthrough, see `README.docker.md`.

### 2. Create a Baseline
A baseline is a named context that ties sweeps, detections, and noise-floor data together. Create one per antenna/location configuration:

```bash
python3 -m sdrwatch.cli --create-baseline --baseline-name "Roof Discone" \
  --start 30e6 --stop 1700e6
```

### 3. Run a Calibration Sweep
Before routine monitoring, run a spur calibration to identify SDR artifacts:

```bash
python3 -m sdrwatch.cli --start 400e6 --stop 470e6 --step 2.4e6 \
  --driver rtlsdr --spur-calibration
```

### 4. Start Continuous Monitoring
Run a wideband sweep loop tied to your baseline:

```bash
python3 -m sdrwatch.cli --baseline-id latest --start 30e6 --stop 1700e6 \
  --step 2.4e6 --driver rtlsdr --gain auto --loop --jsonl events.jsonl
```

Or use the web dashboard to start a scan job via the Control panel.

### 5. Monitor & Classify Signals
Open the web dashboard at `http://<host>:8080`:

- **Dashboard** — review the tactical snapshot, active signals, and band summary
- **Signals** — browse detected signals, apply classification (Friendly/Ambient/Hostile), add labels
- **Recordings** — listen to IQ recordings, demodulate with different modulation types
- **Changes** — monitor NEW, QUIETED, and POWER_SHIFT events as sweeps run

### 6. Manage Recordings
Recordings are automatically captured via burst/patrol mode. From the Recordings page:

- Sort by frequency, modulation, status, or creation time
- Expand a recording to view waveform, play audio, and demodulate
- Queue recordings for compression, download raw I/Q files
- Delete individual recordings or bulk-select for cleanup

### 7. Maintain Baselines
Over time, baselines accumulate noise-floor and occupancy data. Create a fresh baseline when changing antennas, locations, or seasonal conditions:

```bash
python3 -m sdrwatch.cli --create-baseline --baseline-name "Summer Field Site" \
  --start 30e6 --stop 1700e6
```

Switch between baselines in the web dashboard header selector.

---

## Quick Start

### Docker (recommended for evaluation)

```bash
git clone <repo> && cd sdr-watch
docker compose up -d
# Web UI at http://localhost:8080
# Control API at http://localhost:8765
```

With USB SDR passthrough:

```bash
docker compose run --rm --device /dev/bus/usb sdrwatch-cli \
  --baseline-id latest --driver rtlsdr \
  --start 88e6 --stop 108e6
```

### Native (Raspberry Pi 5 / Linux)

```bash
./install-sdrwatch.sh
python3 sdrwatch-web.py --db sdrwatch.db --host 0.0.0.0 --port 8080
```

---

## Key CLI Commands

| Command | Description |
|---------|-------------|
| `-m sdrwatch.cli --list-profiles` | List available scan profiles |
| `-m sdrwatch.cli --list-profiles --json` | Export profiles as JSON |
| `-m sdrwatch.cli --baseline-id N --start S --stop E ...` | Run a single sweep |
| `-m sdrwatch.cli --baseline-id latest --loop ...` | Continuous monitoring |
| `-m sdrwatch.cli --spur-calibration ...` | Spur calibration sweep |
| `-m sdrwatch.cli --two-pass ...` | Two-pass verification sweep |
| `sdrwatch-control.py serve` | Start the controller daemon |
| `sdrwatch-web.py --db PATH --host IP --port P` | Start the web UI |

---

## Frontend Development

```bash
cd sdrwatch_ui
npm install
npm run dev          # Vite dev server with HMR
npm run build        # Production build
npm run lint         # ESLint
npm run typecheck    # TypeScript check
```

### Linting

```bash
ruff check           # Python (config: ruff.toml)
ruff check --fix     # Auto-fix Python issues
npm run lint         # TypeScript/React (config: eslint.config.js)
npm run lint:fix     # Auto-fix TS issues
```

---

## Project Structure

```
sdrwatch/                  # Python scanner package
  cli.py                   # CLI entrypoint
  sweep/                   # Sweep orchestration
  dsp/                     # FFT, CFAR, clustering, noise estimation
  detection/               # Detection engine, types
  baseline/                # Baseline persistence, stats, events
  drivers/                 # SoapySDR + RTL-SDR drivers
  recording/               # Burst capture, demodulation, compression, classification
  util/                    # Logging, math, exit codes
sdrwatch_web/              # Flask REST API + React SPA backend
  blueprints/              # API endpoints (jobs, signals, recordings, charts, etc.)
  app.py                   # Flask app factory
  charts.py               # Chart data aggregation
  controller.py           # Controller client proxy
sdrwatch_ui/               # React SPA frontend
  src/pages/               # 9 route pages
  src/components/          # Reusable UI components
  src/api/                 # API client helpers
sdrwatch-control.py        # Controller daemon (job/lock management)
sdrwatch-web.py            # Web UI entrypoint
docker-compose.yml         # Docker deployment
ruff.toml                  # Python linter config
```

---

## Database

Key tables in the SQLite database:

| Table | Purpose |
|-------|---------|
| `baselines` | Baseline metadata (name, range, location) |
| `baseline_detections` | Persistent signals with classification |
| `baseline_noise` | Per-bin noise floor EMA |
| `baseline_occupancy` | Per-bin occupancy counts and duty cycle |
| `baseline_band_summary` | Occupancy summary per frequency band |
| `scan_updates` | Per-sweep summary statistics |
| `spur_map` | Known spurious signals |
| `recordings` | IQ recording metadata (raw/ogg paths, modulation, status) |
| `ignore_rules` | Frequency exclusions for sweep filtering |

---

## License

MIT License. See [LICENSE](LICENSE).
