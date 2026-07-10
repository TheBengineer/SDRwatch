"""Verify that all SDRwatch dependencies are importable."""
import contextlib
import os
import sys

# Ensure the project root is on sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

checks = [
    ("numpy", lambda: __import__("numpy")),
    ("scipy", lambda: __import__("scipy")),
    ("flask", lambda: __import__("flask")),
]

for _name, imp in checks:
    try:
        imp()
    except Exception:
        sys.exit(1)

# Optional imports (work without SDR hardware)
optional = [
    ("rtlsdr (RtlSdr)", lambda: __import__("rtlsdr", fromlist=["RtlSdr"])),
    ("SoapySDR", lambda: __import__("SoapySDR")),
]
for _name, imp in optional:
    with contextlib.suppress(Exception):
        imp()

try:
    pass
except Exception:
    sys.exit(1)

