# =============================================================================
# SDRwatch - Docker Image
# =============================================================================
# Tactical spectrum situational awareness for SDR devices.
#
# Build:
#   docker compose build
#
# Run (with USB SDR attached):
#   docker compose up
#
# Quick scan (CLI):
#   docker compose run --rm sdrwatch-cli \
#     python -m sdrwatch.cli --baseline-id latest --driver rtlsdr \
#     --start 88e6 --stop 108e6 --fft 4096 --avg 8
# =============================================================================

FROM ubuntu:24.04 AS base

LABEL org.opencontainers.image.title="SDRwatch"
LABEL org.opencontainers.image.description="Tactical spectrum situational awareness for SDR devices"
LABEL org.opencontainers.image.source="https://github.com/BPFLNALCR/SDRwatch"
LABEL org.opencontainers.image.licenses="MIT"

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1
ENV SDRWATCH_HOME=/opt/sdrwatch

# ---------------------------------------------------------------------------
# Stage 1: System dependencies
# ---------------------------------------------------------------------------
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Build essentials
    git ca-certificates build-essential cmake pkg-config \
    libusb-1.0-0 libusb-1.0-0-dev \
    # Python
    python3 python3-venv python3-dev \
    python3-numpy python3-scipy \
    python3-soapysdr \
    # RTL-SDR (native)
    librtlsdr2 librtlsdr-dev rtl-sdr \
    # SoapySDR
    soapysdr-module-rtlsdr soapysdr-module-hackrf \
    soapysdr-tools \
    # HackRF
    hackrf \
    # Utilities
    curl procps udev ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# ---------------------------------------------------------------------------
# Stage 2: Build rtl-sdr from source (for up-to-date drivers)
# ---------------------------------------------------------------------------
RUN if ! rtl_test -t >/dev/null 2>&1; then \
        mkdir -p /tmp/rtl-build && cd /tmp/rtl-build && \
        git clone --depth=1 https://github.com/rtlsdrblog/rtl-sdr-blog.git && \
        cd rtl-sdr-blog && mkdir build && cd build && \
        cmake -DDETACH_KERNEL_DRIVER=ON \
              -DCPACK_PACKAGING_INSTALL_PREFIX=/usr \
              -DCMAKE_INSTALL_PREFIX=/usr .. && \
        make -j"$(nproc)" && make install && ldconfig && \
        rm -rf /tmp/rtl-build; \
    fi

# ---------------------------------------------------------------------------
# Stage 3: Python virtual environment
# ---------------------------------------------------------------------------
COPY requirements.txt /tmp/requirements.txt

RUN python3 -m venv --system-site-packages "$SDRWATCH_HOME/.venv" && \
    "$SDRWATCH_HOME/.venv/bin/pip" install -U pip setuptools wheel && \
    "$SDRWATCH_HOME/.venv/bin/pip" install -r /tmp/requirements.txt && \
    rm /tmp/requirements.txt

# Patch pyrtlsdr to skip C symbols not present in Ubuntu 24.04's librtlsdr
# (rtlsdr_set_dithering, rtlsdr_set_gpio_*, rtlsdr_set_and_get_tuner_bandwidth)
COPY scripts/patch-pyrtlsdr.py /tmp/patch-pyrtlsdr.py
RUN python3 /tmp/patch-pyrtlsdr.py "$SDRWATCH_HOME/.venv" && rm /tmp/patch-pyrtlsdr.py

ENV PATH="$SDRWATCH_HOME/.venv/bin:$PATH"

# ---------------------------------------------------------------------------
# Stage 4: Application code
# ---------------------------------------------------------------------------
WORKDIR $SDRWATCH_HOME

COPY . .

# Symlink legacy entry points
RUN ln -sf sdrwatch-web.py sdrwatch-web-simple.py 2>/dev/null || true; \
    ln -sf sdrwatch-web.py sdrwatch_web_simple.py 2>/dev/null || true

# Verify imports
RUN "$SDRWATCH_HOME/.venv/bin/python3" scripts/verify_imports.py

# Default: show help
CMD ["python3", "-m", "sdrwatch.cli", "--help"]

# =============================================================================
# Multi-service entry points (used by docker-compose)
# =============================================================================

FROM base AS control

EXPOSE 8765
CMD ["python3", "sdrwatch-control.py", "serve", "--host", "0.0.0.0", "--port", "8765"]

FROM base AS web

EXPOSE 8080
CMD ["python3", "sdrwatch-web.py", "--db", "/data/sdrwatch.db", "--host", "0.0.0.0", "--port", "8080"]
