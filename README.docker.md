# SDRwatch - Docker Setup

## Prerequisites

### 1. USB SDR Passthrough (Windows → WSL2 → Docker)

Since you're on Windows with an SDR USB device, you need **usbipd-win** to attach the device to WSL2:

**On Windows (PowerShell as Admin):**
```powershell
# Install usbipd-win
winget install usbipd

# List USB devices
usbipd list

# Attach your SDR to WSL2 (replace BUSID with yours, e.g., 1-1)
usbipd wsl attach --busid <BUSID>
```

**Verify in WSL2:**
```bash
ls /dev/bus/usb/
# You should see 00x/ directories
```

> **Note:** You may need to run `sudo usbipd wsl attach` or configure WSL2 to auto-attach. See [usbipd-win docs](https://github.com/dorssel/usbipd-win) for details.

### 2. Docker & Docker Compose

Ensure Docker is running in WSL2:
```bash
docker info
docker compose version
```

---

## Quick Start

```bash
# Clone (if you haven't already)
git clone https://github.com/BPFLNALCR/SDRwatch.git
cd SDRwatch

# Build the Docker image
docker compose build

# Start the web dashboard + control API
docker compose up -d

# Check logs
docker compose logs -f
```

- **Web UI:** http://localhost:8080
- **Control API:** http://localhost:8765

---

## Usage

### Run a one-off scan

```bash
# List available scan profiles (no SDR required)
docker compose run --rm sdrwatch-cli --list-profiles

# Scan the FM broadcast band (SDR required)
docker compose run --rm sdrwatch-cli \
  --baseline-id latest --driver rtlsdr \
  --start 88e6 --stop 108e6 --fft 4096 --avg 8

# Continuous monitoring 30 MHz – 1.7 GHz
docker compose run --rm sdrwatch-cli \
  --baseline-id latest --start 30e6 --stop 1700e6 --step 2.4e6 \
  --samp-rate 2.4e6 --fft 4096 --avg 8 --gain auto \
  --loop --db /data/sdrwatch.db
```

### Run services in background

```bash
# Start all services
docker compose up -d

# Stop all
docker compose down

# View logs
docker compose logs -f sdrwatch-control
docker compose logs -f sdrwatch-web
```

### Initialize a baseline

First scan will create a baseline automatically with `--baseline-id latest`.

---

## Configuration

Set environment variables in a `.env` file in the project root:

```ini
SDRWATCH_CONTROL_TOKEN=your-secure-token-here
SDRWATCH_TOKEN=your-web-token-here
```

---

## Troubleshooting

### USB device not found in container
```bash
# Check if device is visible on host
lsusb  # (install usbutils if needed)

# Check in WSL2
ls -la /dev/bus/usb/

# If empty, re-attach from Windows:
#   usbipd wsl attach --busid <BUSID>

# Try privileged mode (edit docker-compose.yml):
#   privileged: true  # under sdrwatch-control service
```

### Permission denied on USB device
```bash
# In the container, the devices are mapped via --device /dev/bus/usb
# If you still get permission errors, try:
docker compose run --rm --privileged sdrwatch-cli --list-profiles
```

### Database persistence
The SQLite database is stored in a Docker volume (`sdrwatch-data`).
To reset: `docker compose down -v`

---

## Architecture

```
┌─────────────┐     HTTP     ┌──────────────────┐
│  Web UI     │◄───────────►│  Control API      │
│  :8080      │              │  :8765            │
│  Flask app  │              │  Job Manager      │
└─────────────┘              └────────┬─────────┘
                                      │ spawns
                                      ▼
                              ┌──────────────────┐
                              │  Scanner CLI     │
                              │  python -m       │
                              │  sdrwatch.cli    │
                              └────────┬─────────┘
                                       │ reads/writes
                                       ▼
                              ┌──────────────────┐
                              │  SQLite DB        │
                              │  /data/sdrwatch.db│
                              └──────────────────┘
```
