"""Verify that all SDRwatch dependencies are importable."""
import sys
import os

# Ensure the project root is on sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

checks = [
    ("numpy", lambda: __import__("numpy")),
    ("scipy", lambda: __import__("scipy")),
    ("flask", lambda: __import__("flask")),
]

for name, imp in checks:
    try:
        imp()
        print(f"[OK] {name}")
    except Exception as e:
        print(f"[FAIL] {name}: {e}")
        sys.exit(1)

# Optional imports (work without SDR hardware)
optional = [
    ("rtlsdr (RtlSdr)", lambda: __import__("rtlsdr", fromlist=["RtlSdr"])),
    ("SoapySDR", lambda: __import__("SoapySDR")),
]
for name, imp in optional:
    try:
        imp()
        print(f"[OK] {name}")
    except Exception:
        print(f"[WARN] {name} skipped (expected when no SDR connected)")

try:
    from sdrwatch_web import create_app
    print("[OK] sdrwatch_web")
except Exception as e:
    print(f"[FAIL] sdrwatch_web: {e}")
    sys.exit(1)

print("\nAll required imports OK.")
