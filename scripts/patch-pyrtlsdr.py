"""Patch pyrtlsdr's librtlsdr.py to skip C symbols not present in the system's librtlsdr.

Usage: python3 patch-pyrtlsdr.py <venv_dir>

This comments out function bindings for symbols that don't exist in
Ubuntu 24.04's librtlsdr (rtlsdr_set_dithering, rtlsdr_set_gpio_*,
rtlsdr_set_and_get_tuner_bandwidth). The functions are optional features
in pyrtlsdr; the core device access still works without them.
"""

import re
import sys
from pathlib import Path


def main() -> None:
    if len(sys.argv) < 2:
        print("usage: patch-pyrtlsdr.py <venv_dir>", file=sys.stderr)
        sys.exit(1)

    venv = Path(sys.argv[1])
    lib_paths = list(venv.glob("lib/python*/site-packages/rtlsdr/librtlsdr.py"))
    if not lib_paths:
        print("rtlsdr/librtlsdr.py not found in venv", file=sys.stderr)
        sys.exit(0)  # not fatal — might have been removed

    librtlsdr_py = lib_paths[0]
    content = librtlsdr_py.read_text()
    lines = content.splitlines()

    # Symbols available in Ubuntu 24.04's librtlsdr (from librtlsdr2 package)
    available = {
        "rtlsdr_get_device_count",
        "rtlsdr_get_device_name",
        "rtlsdr_get_device_usb_strings",
        "rtlsdr_get_index_by_serial",
        "rtlsdr_open",
        "rtlsdr_close",
        "rtlsdr_set_center_freq",
        "rtlsdr_get_center_freq",
        "rtlsdr_set_freq_correction",
        "rtlsdr_get_freq_correction",
        "rtlsdr_get_tuner_type",
        "rtlsdr_set_tuner_gain",
        "rtlsdr_get_tuner_gain",
        "rtlsdr_get_tuner_gains",
        "rtlsdr_set_tuner_gain_mode",
        "rtlsdr_set_agc_mode",
        "rtlsdr_set_direct_sampling",
        "rtlsdr_set_sample_rate",
        "rtlsdr_get_sample_rate",
        "rtlsdr_set_tuner_bandwidth",
        "rtlsdr_reset_buffer",
        "rtlsdr_read_sync",
        "rtlsdr_wait_async",
        "rtlsdr_read_async",
        "rtlsdr_cancel_async",
        "rtlsdr_set_bias_tee",
        "rtlsdr_set_xtal_freq",
        "rtlsdr_get_xtal_freq",
        "rtlsdr_set_testmode",
        "rtlsdr_set_offset_tuning",
        "rtlsdr_set_tuner_if_gain",
    }

    modified = list(lines)
    i = 0
    changes = 0

    while i < len(lines):
        m = re.match(r"f\s*=\s*librtlsdr\.(\w+)", lines[i])
        if m and m.group(1) not in available:
            modified[i] = "# " + lines[i]
            changes += 1
            j = i + 1
            while j < len(lines) and (
                "f.restype" in lines[j]
                or "f.argtypes" in lines[j]
                or lines[j].strip().startswith("#")
            ):
                modified[j] = "# " + lines[j]
                j += 1
                changes += 1
            i = j
            continue
        i += 1

    librtlsdr_py.write_text("\n".join(modified))
    print(f"patched pyrtlsdr: {changes} lines commented out")


if __name__ == "__main__":
    main()
