#!/usr/bin/env python3
"""SDRwatch scanner CLI entrypoint (package module)."""

from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Any, List, Optional, Set

from sdrwatch.drivers.rtlsdr import HAVE_RTLSDR
from sdrwatch.drivers.soapy import HAVE_SOAPY
from sdrwatch.io.profiles import default_scan_profiles, serialize_profiles
from sdrwatch.sweep.runner import run_scan
from sdrwatch.util.duration import parse_duration_to_seconds
from sdrwatch.util.exit_codes import ExitCode
from sdrwatch.util.logging import configure_logging, get_logger

_log = get_logger(__name__)


def run(args: argparse.Namespace) -> int:
    """Top-level CLI dispatcher that delegates execution to sweep.runner or subcommands.

    Returns an exit code from ExitCode.
    """
    sub = getattr(args, "_subcommand", None)
    if sub == "ignore":
        return cmd_ignore(args)
    if sub == "replay":
        return cmd_replay(args)
    if sub == "record":
        return cmd_record(args)

    if getattr(args, "list_profiles", False):
        _emit_profiles_json()
        return ExitCode.SUCCESS

    # Configure logging based on verbosity or environment
    log_level = "DEBUG" if os.environ.get("SDRWATCH_DEBUG", "").strip() in ("1", "true", "yes") else "INFO"
    configure_logging(level=log_level)

    try:
        run_scan(args)
        return ExitCode.SUCCESS
    except KeyboardInterrupt:
        _log.info("interrupted by user")
        return ExitCode.SUCCESS
    except RuntimeError as exc:
        msg = str(exc).lower()
        if "baseline" in msg and ("not found" in msg or "does not exist" in msg):
            _log.error("baseline not found: %s", exc)
            return ExitCode.BASELINE_NOT_FOUND
        if "device" in msg or "sdr" in msg or "rtlsdr" in msg or "soapy" in msg:
            _log.error("device unavailable: %s", exc)
            return ExitCode.DEVICE_UNAVAILABLE
        _log.exception("runtime error")
        return ExitCode.GENERAL_ERROR
    except Exception:
        _log.exception("unexpected error")
        return ExitCode.GENERAL_ERROR


def parse_args(argv: Optional[List[str]] = None) -> argparse.Namespace:
    if argv is None:
        argv = sys.argv[1:]

    p = argparse.ArgumentParser(
        description="Wideband scanner & baseline builder using SoapySDR or native RTL-SDR",
        argument_default=argparse.SUPPRESS,
    )
    p.add_argument("--start", type=float, help="Start frequency in Hz (e.g., 88e6)")
    p.add_argument("--stop", type=float, help="Stop frequency in Hz (e.g., 108e6)")
    p.add_argument("--step", type=float, help="Center frequency step per window [Hz] (default 2.4e6)")

    p.add_argument("--samp-rate", dest="samp_rate", type=float, help="Sample rate [Hz] (default 2.4e6)")
    p.add_argument("--fft", type=int, help="FFT size (per Welch segment) (default 4096)")
    p.add_argument("--avg", type=int, help="Averaging factor (segments per PSD) (default 8)")

    p.add_argument("--driver", type=str, help="Soapy driver key (e.g., rtlsdr, hackrf, airspy, etc.) or 'rtlsdr_native' for direct librtlsdr (default rtlsdr)")
    p.add_argument("--soapy-args", type=str, help="Comma-separated Soapy device args (e.g., 'serial=00000001,index=0')")
    p.add_argument("--gain", type=str, help='Gain in dB or "auto" (default auto)')

    p.add_argument("--threshold-db", dest="threshold_db", type=float, help="Detection threshold above noise floor [dB] (default 8.0)")
    p.add_argument("--guard-bins", dest="guard_bins", type=int, help="Allow this many below-threshold bins inside a detection (default 1)")
    p.add_argument("--min-width-bins", dest="min_width_bins", type=int, help="Minimum contiguous bins for a detection (default 2)")
    p.add_argument(
        "--persistence-mode",
        choices=["hits", "duration", "both"],
        help="Persistence gate: hit/window ratio, wall-clock duration, or both (default hits)",
    )
    p.add_argument(
        "--persistence-hit-ratio",
        dest="persistence_hit_ratio",
        type=float,
        help="Minimum occupied-window ratio (0-1) within a cluster span to mark persistent (default 0.6)",
    )
    p.add_argument(
        "--persistence-min-seconds",
        dest="persistence_min_seconds",
        type=float,
        help="Minimum wall-clock duration in seconds for duration-based persistence (default 10)",
    )
    p.add_argument(
        "--persistence-min-hits",
        dest="persistence_min_hits",
        type=int,
        help="Minimum hits required before persistence evaluation (default 2)",
    )
    p.add_argument(
        "--persistence-min-windows",
        dest="persistence_min_windows",
        type=int,
        help="Minimum distinct windows required before persistence evaluation (default 2)",
    )
    p.add_argument(
        "--cluster-merge-hz",
        dest="cluster_merge_hz",
        type=float,
        help="Override Hz span when merging per-window segments into clusters/persistent detections",
    )
    p.add_argument(
        "--max-detection-width-ratio",
        dest="max_detection_width_ratio",
        type=float,
        help="Reject cluster matches when the segment width exceeds this ratio of the persisted width (default 3.0)",
    )
    p.add_argument(
        "--max-detection-width-hz",
        dest="max_detection_width_hz",
        type=float,
        help="Clamp persistent detection widths to this maximum Hz span (0 disables)",
    )
    p.add_argument("--cfar", choices=["off", "os", "ca"], help="CFAR mode (default: os)")
    p.add_argument("--cfar-train", dest="cfar_train", type=int, help="Training cells per side for CFAR (default 24)")
    p.add_argument("--cfar-guard", dest="cfar_guard", type=int, help="Guard cells per side (excluded around CUT) for CFAR (default 4)")
    p.add_argument("--cfar-quantile", dest="cfar_quantile", type=float, help="Quantile (0..1) for OS-CFAR order statistic (default 0.75)")
    p.add_argument("--cfar-alpha-db", dest="cfar_alpha_db", type=float, help="Override threshold scaling for CFAR in dB; defaults to --threshold-db")

    p.add_argument("--bandplan", type=str, help="Optional bandplan CSV to map detections")
    p.add_argument("--db", type=str, help="SQLite DB path (default sdrwatch.db)")
    p.add_argument("--baseline-id", dest="baseline_id", type=str, help="Baseline id to attach scans to (or 'latest')")
    p.add_argument("--jsonl", type=str, help="Emit detections as line-delimited JSON to this path")
    p.add_argument("--notify", action="store_true", help="Desktop notifications for new signals")
    p.add_argument("--new-ema-occ", dest="new_ema_occ", type=float, help="EMA occupancy threshold to flag a bin as NEW (default 0.02)")
    p.add_argument("--latitude", type=float, help="Optional latitude in decimal degrees for this scan")
    p.add_argument("--longitude", type=float, help="Optional longitude in decimal degrees for this scan")
    p.add_argument("--profile", type=str, help="Scan profile name to pre-load sane defaults (see documentation)")
    p.add_argument("--spur-calibration", dest="spur_calibration", action="store_true", help="Learn persistent internal spurs instead of emitting detections")
    p.add_argument("--list-profiles", dest="list_profiles", action="store_true", help="Print built-in scan profiles as JSON and exit")
    p.add_argument("--two-pass", dest="two_pass", action="store_true", help="Enable coarse + targeted revisit confirmation sweep")
    p.add_argument("--revisit-fft", dest="revisit_fft", type=int, help="FFT size for revisit windows (defaults to 2x --fft)")
    p.add_argument("--revisit-avg", dest="revisit_avg", type=int, help="Averaging factor for revisit windows (defaults to max(--avg,4))")
    p.add_argument(
        "--revisit-margin-hz",
        dest="revisit_margin_hz",
        type=float,
        help="Additional Hz margin added to revisit windows around each tagged center",
    )
    p.add_argument(
        "--revisit-span-limit-hz",
        dest="revisit_span_limit_hz",
        type=float,
        help="Maximum Hz span allowed when confirming detections during revisit passes (0 disables clamping)",
    )
    p.add_argument(
        "--revisit-max-bands",
        dest="revisit_max_bands",
        type=int,
        help="Maximum revisit targets per sweep (0 = unlimited)",
    )
    p.add_argument(
        "--revisit-floor-threshold-db",
        dest="revisit_floor_threshold_db",
        type=float,
        help="Detection threshold (dB) used during revisit windows (defaults to --threshold-db)",
    )

    group = p.add_mutually_exclusive_group()
    group.add_argument("--loop", action="store_true", help="Run continuous sweep cycles until cancelled")
    group.add_argument("--repeat", type=int, help="Run exactly N full sweep cycles, then exit")
    group.add_argument("--duration", type=str, help="Run sweeps for a duration (e.g., '300', '10m', '2h'). Overrides --repeat count while time remains")

    p.add_argument("--sleep-between-sweeps", dest="sleep_between_sweeps", type=float, help="Seconds to sleep between sweep cycles (default 0)")
    p.add_argument("--tmpdir", type=str, help="Scratch directory for temp files (defaults to $TMPDIR)")

    p.add_argument("--capture-iq", action="store_true", help="Enable raw IQ capture pass after sweep")
    p.add_argument("--continuous-capture", dest="continuous_capture", action="store_true",
                   help="Continuous capture mode (implies --capture-iq)")
    p.add_argument("--capture-dir", dest="capture_dir", type=str, default="./captures", help="Root directory for IQ captures (default ./captures)")
    p.add_argument("--capture-duration", dest="capture_duration", type=float, default=10.0, help="Recording duration in seconds per signal (default 10.0)")
    p.add_argument("--record-ttl-days", dest="record_ttl_days", type=int, default=7, help="Days before auto-deleting recordings (default 7)")
    p.add_argument("--record-quota-gb", dest="record_quota_gb", type=int, default=1, help="Max disk usage for recordings in GB (default 1)")
    p.add_argument("--record-max-signals", dest="record_max_signals", type=int, default=10, help="Max signals to record per sweep (default 10)")

    p.set_defaults(_subcommand=None)
    subparsers = p.add_subparsers(metavar="")
    p_ignore = subparsers.add_parser("ignore", help="Manage signal capture ignore rules")
    p_ignore.set_defaults(_subcommand="ignore")
    p_ignore.add_argument("--add", nargs="*", help="Add ignore rule: FREQ_HZ [--tolerance HZ] [--label TEXT] [--baseline-id ID]")
    p_ignore.add_argument("--remove", type=int, help="Remove ignore rule by ID")
    p_ignore.add_argument("--list", action="store_true", help="List all ignore rules")
    p_ignore.add_argument("--freq", type=float, help="Frequency in Hz (for --add)")
    p_ignore.add_argument("--tolerance", type=float, default=50000, help="Tolerance in Hz (default: 50000)")
    p_ignore.add_argument("--label", type=str, help="Human-readable label")
    p_ignore.add_argument("--baseline-id", type=int, help="Baseline ID to scope the rule")
    p_ignore.add_argument("--db", type=str, help="SQLite DB path (default sdrwatch.db)")

    p_replay = subparsers.add_parser("replay", help="Replay a recorded signal with selected modulation")
    p_replay.set_defaults(_subcommand="replay")
    p_replay.add_argument("--id", type=int, required=True, help="Recording ID from the recordings table")
    p_replay.add_argument("--modulation", choices=["fm", "am", "cw", "lsb", "usb"], default="fm", help="Demodulation mode (default: fm)")
    p_replay.add_argument("--output", type=str, help="Output .ogg file path (default: auto-generated)")
    p_replay.add_argument("--db", type=str, help="SQLite DB path (default sdrwatch.db)")

    p_record = subparsers.add_parser("record", help="Manage recording lifecycle")
    p_record.set_defaults(_subcommand="record")
    p_record_sub = p_record.add_subparsers(dest="_record_action", metavar="")
    p_rec_cleanup = p_record_sub.add_parser("cleanup", help="Enforce retention TTL and disk quota")
    p_rec_cleanup.add_argument("--ttl-days", type=int, default=7, help="Delete recordings older than N days (default 7)")
    p_rec_cleanup.add_argument("--quota-gb", type=int, default=1, help="Max disk usage in GB (default 1)")
    p_rec_cleanup.add_argument("--db", type=str, help="SQLite DB path (default sdrwatch.db)")
    p_rec_status = p_record_sub.add_parser("status", help="Show recording statistics")
    p_rec_status.add_argument("--db", type=str, help="SQLite DB path (default sdrwatch.db)")

    args = p.parse_args(argv)
    args._cli_overrides = set()

    _set_default(args, args._cli_overrides, "step", 2.4e6)
    _set_default(args, args._cli_overrides, "samp_rate", 2.4e6)
    _set_default(args, args._cli_overrides, "fft", 4096)
    _set_default(args, args._cli_overrides, "avg", 8)
    _set_default(args, args._cli_overrides, "driver", "rtlsdr")
    _set_default(args, args._cli_overrides, "soapy_args", None)
    _set_default(args, args._cli_overrides, "gain", "auto")
    _set_default(args, args._cli_overrides, "threshold_db", 8.0)
    _set_default(args, args._cli_overrides, "guard_bins", 1)
    _set_default(args, args._cli_overrides, "min_width_bins", 2)
    _set_default(args, args._cli_overrides, "persistence_mode", "hits")
    _set_default(args, args._cli_overrides, "persistence_hit_ratio", 0.6)
    _set_default(args, args._cli_overrides, "persistence_min_seconds", 10.0)
    _set_default(args, args._cli_overrides, "persistence_min_hits", 2)
    _set_default(args, args._cli_overrides, "persistence_min_windows", 2)
    _set_default(args, args._cli_overrides, "cluster_merge_hz", None)
    _set_default(args, args._cli_overrides, "max_detection_width_ratio", 3.0)
    _set_default(args, args._cli_overrides, "max_detection_width_hz", 0.0)
    _set_default(args, args._cli_overrides, "cfar", "os")
    _set_default(args, args._cli_overrides, "cfar_train", 24)
    _set_default(args, args._cli_overrides, "cfar_guard", 4)
    _set_default(args, args._cli_overrides, "cfar_quantile", 0.75)
    _set_default(args, args._cli_overrides, "cfar_alpha_db", None)
    _set_default(args, args._cli_overrides, "bandplan", None)
    _set_default(args, args._cli_overrides, "db", "sdrwatch.db")
    _set_default(args, args._cli_overrides, "jsonl", None)
    _set_default(args, args._cli_overrides, "notify", False)
    _set_default(args, args._cli_overrides, "new_ema_occ", 0.02)
    _set_default(args, args._cli_overrides, "latitude", None)
    _set_default(args, args._cli_overrides, "longitude", None)
    _set_default(args, args._cli_overrides, "profile", None)
    _set_default(args, args._cli_overrides, "spur_calibration", False)
    _set_default(args, args._cli_overrides, "list_profiles", False)
    _set_default(args, args._cli_overrides, "two_pass", False)
    _set_default(args, args._cli_overrides, "revisit_fft", None)
    _set_default(args, args._cli_overrides, "revisit_avg", None)
    _set_default(args, args._cli_overrides, "revisit_margin_hz", None)
    _set_default(args, args._cli_overrides, "revisit_span_limit_hz", None)
    _set_default(args, args._cli_overrides, "revisit_max_bands", 0)
    _set_default(args, args._cli_overrides, "revisit_floor_threshold_db", None)
    _set_default(args, args._cli_overrides, "loop", False)
    _set_default(args, args._cli_overrides, "repeat", None)
    _set_default(args, args._cli_overrides, "duration", None)
    _set_default(args, args._cli_overrides, "sleep_between_sweeps", 0.0)
    _set_default(args, args._cli_overrides, "tmpdir", os.environ.get("TMPDIR"))
    _set_default(args, args._cli_overrides, "capture_iq", False)
    _set_default(args, args._cli_overrides, "continuous_capture", False)
    _set_default(args, args._cli_overrides, "capture_dir", "./captures")
    _set_default(args, args._cli_overrides, "capture_duration", 10.0)
    _set_default(args, args._cli_overrides, "record_ttl_days", 7)
    _set_default(args, args._cli_overrides, "record_quota_gb", 1)
    _set_default(args, args._cli_overrides, "record_max_signals", 10)
    setattr(args, "abs_power_floor_db", None)

    # --continuous-capture implies --capture-iq
    if getattr(args, "continuous_capture", False):
        setattr(args, "capture_iq", True)

    has_span = hasattr(args, "start") and hasattr(args, "stop")
    is_ignore = getattr(args, "_subcommand", None) == "ignore"
    is_replay = getattr(args, "_subcommand", None) == "replay"
    is_record = getattr(args, "_subcommand", None) == "record"
    is_non_scan = is_ignore or is_replay or is_record or getattr(args, "list_profiles", False)
    if not is_non_scan and not has_span:
        p.error("--start and --stop are required unless --list-profiles is used")

    if has_span:
        _apply_scan_profile(args, p)

    if not is_non_scan:
        baseline_raw = getattr(args, "baseline_id", None)
        if baseline_raw is None:
            p.error("--baseline-id is required for scanning runs")
        baseline_text = str(baseline_raw).strip()
        if not baseline_text:
            p.error("--baseline-id is required for scanning runs")
        if baseline_text.lower() == "latest":
            setattr(args, "baseline_id", "latest")
        else:
            try:
                baseline_val = int(baseline_text)
            except ValueError:
                p.error("--baseline-id must be an integer or 'latest'")
            setattr(args, "baseline_id", baseline_val)

    if hasattr(args, "_cli_overrides"):
        delattr(args, "_cli_overrides")

    if not is_non_scan:
        if args.driver != "rtlsdr_native" and not HAVE_SOAPY:
            p.error("python3-soapysdr not installed. Install it (or use --driver rtlsdr_native).")
        if args.driver == "rtlsdr_native" and not HAVE_RTLSDR:
            p.error("pyrtlsdr not installed. Install with: pip3 install pyrtlsdr")
        if args.stop < args.start:
            p.error("--stop must be >= --start")
        if args.step <= 0:
            p.error("--step must be > 0")

    if args.duration:
        _ = parse_duration_to_seconds(args.duration)

    return args


def _set_default(args: argparse.Namespace, overrides: Set[str], attr: str, value: Any) -> None:
    if hasattr(args, attr):
        overrides.add(attr)
    else:
        setattr(args, attr, value)


def _apply_scan_profile(args: argparse.Namespace, parser: argparse.ArgumentParser) -> None:
    profile_name = getattr(args, "profile", None)
    if not profile_name:
        return
    profiles = default_scan_profiles()
    profile = profiles.get(str(profile_name).lower())
    if not profile:
        parser.error(f"Unknown scan profile '{profile_name}'. Use --list-profiles to inspect options.")

    requested_low = min(args.start, args.stop)
    requested_high = max(args.start, args.stop)
    if requested_low < profile.f_low_hz or requested_high > profile.f_high_hz:
        _log.warning(
            "requested span %.3f-%.3fMHz outside profile '%s' band, skipping profile defaults",
            requested_low / 1e6,
            requested_high / 1e6,
            profile.name,
        )
        return

    overrides: Set[str] = getattr(args, "_cli_overrides", set())

    def maybe_set(attr: str, value: Any) -> None:
        if value is None:
            return
        if attr in overrides:
            return
        setattr(args, attr, value)

    if profile.step_hz is not None:
        maybe_set("step", profile.step_hz)
    maybe_set("samp_rate", profile.samp_rate)
    maybe_set("fft", profile.fft)
    maybe_set("avg", profile.avg)
    maybe_set("threshold_db", profile.threshold_db)
    maybe_set("guard_bins", profile.guard_bins)
    maybe_set("min_width_bins", profile.min_width_bins)
    maybe_set("cfar_train", profile.cfar_train)
    maybe_set("cfar_guard", profile.cfar_guard)
    maybe_set("cfar_quantile", profile.cfar_quantile)
    maybe_set("persistence_hit_ratio", profile.persistence_hit_ratio)
    maybe_set("persistence_min_seconds", profile.persistence_min_seconds)
    maybe_set("persistence_min_hits", profile.persistence_min_hits)
    maybe_set("persistence_min_windows", profile.persistence_min_windows)
    maybe_set("revisit_fft", profile.revisit_fft)
    maybe_set("revisit_avg", profile.revisit_avg)
    maybe_set("revisit_margin_hz", profile.revisit_margin_hz)
    maybe_set("revisit_max_bands", profile.revisit_max_bands)
    maybe_set("revisit_floor_threshold_db", profile.revisit_floor_threshold_db)
    maybe_set("revisit_span_limit_hz", profile.revisit_span_limit_hz)
    maybe_set("two_pass", profile.two_pass)
    maybe_set("cluster_merge_hz", profile.cluster_merge_hz)
    maybe_set("center_match_hz", getattr(profile, "center_match_hz", None))
    maybe_set("max_detection_width_ratio", profile.max_detection_width_ratio)
    maybe_set("max_detection_width_hz", profile.max_detection_width_hz)
    maybe_set("segment_center_mode", profile.segment_center_mode)
    maybe_set("segment_centroid_span_hz", profile.segment_centroid_span_hz)
    maybe_set("segment_centroid_drop_db", profile.segment_centroid_drop_db)
    maybe_set("segment_centroid_floor_margin_db", profile.segment_centroid_floor_margin_db)

    maybe_set("match_bandwidth_pad_hz", getattr(profile, "match_bandwidth_pad_hz", None))
    maybe_set("min_match_bandwidth_hz", getattr(profile, "min_match_bandwidth_hz", None))
    maybe_set("display_bandwidth_pad_hz", getattr(profile, "display_bandwidth_pad_hz", None))
    maybe_set("min_display_bandwidth_hz", getattr(profile, "min_display_bandwidth_hz", None))

    if profile.bandwidth_pad_hz is not None:
        setattr(args, "bandwidth_pad_hz", profile.bandwidth_pad_hz)
    if profile.min_emit_bandwidth_hz is not None:
        setattr(args, "min_emit_bandwidth_hz", profile.min_emit_bandwidth_hz)
    if profile.confidence_hit_normalizer is not None:
        setattr(args, "confidence_hit_normalizer", profile.confidence_hit_normalizer)
    if profile.confidence_duration_norm is not None:
        setattr(args, "confidence_duration_norm", profile.confidence_duration_norm)
    if profile.confidence_bias is not None:
        setattr(args, "confidence_bias", profile.confidence_bias)
    if profile.abs_power_floor_db is not None:
        setattr(args, "abs_power_floor_db", profile.abs_power_floor_db)

    gain_override = "gain" in overrides and not (isinstance(getattr(args, "gain"), str) and getattr(args, "gain").lower() == "auto")
    if not gain_override:
        if isinstance(getattr(args, "gain"), str) and getattr(args, "gain").lower() == "auto":
            _log.info(
                "overriding auto gain with fixed %.1fdB from profile '%s'",
                profile.gain_db,
                profile.name,
            )
        setattr(args, "gain", float(profile.gain_db))

    _log.info("applied profile '%s'", profile.name)


def _emit_profiles_json() -> None:
    payload = serialize_profiles()
    print(json.dumps(payload, indent=2, sort_keys=True))


def _resolve_db_path(args: argparse.Namespace) -> str:
    db = getattr(args, "db", None)
    if db:
        return str(db)
    return os.environ.get("SDRWATCH_DB", "sdrwatch.db")


def cmd_ignore(args: argparse.Namespace) -> int:
    from sdrwatch.baseline.store import Store as _Store
    from sdrwatch.util.exit_codes import ExitCode as _ExitCode

    store = _Store(_resolve_db_path(args))
    if args.list:
        rules = store.list_ignore_rules(getattr(args, "baseline_id", None))
        if not rules:
            print("No ignore rules.")
            return _ExitCode.SUCCESS
        print(f"{'ID':>4}  {'Freq (MHz)':<12}  {'Tolerance':<10}  {'Label':<20}  {'Created'}")
        print("-" * 70)
        for r in rules:
            f_mhz = r["f_center_hz"] / 1e6
            print(f"{r['id']:>4}  {f_mhz:<12.4f}  {r['tolerance_hz']:<10}  {(r.get('label') or ''):<20}  {r['created_utc']}")
        return _ExitCode.SUCCESS
    elif args.add is not None or getattr(args, "freq", None) is not None:
        freq = getattr(args, "freq", None)
        if freq is None and args.add:
            try:
                freq = float(args.add[0])
            except (IndexError, ValueError):
                freq = None
        if freq is None:
            print("error: --freq or --add FREQ_HZ is required")
            return _ExitCode.GENERAL_ERROR
        rid = store.add_ignore_rule(
            baseline_id=getattr(args, "baseline_id", None) or 0,
            f_center_hz=int(freq),
            tolerance_hz=int(args.tolerance),
            label=getattr(args, "label", None),
        )
        print(f"Added ignore rule #{rid}: {freq/1e6:.4f} MHz ± {args.tolerance} Hz")
        return _ExitCode.SUCCESS
    elif getattr(args, "remove", None) is not None:
        store.remove_ignore_rule(args.remove)
        print(f"Removed ignore rule #{args.remove}")
        return _ExitCode.SUCCESS
    else:
        print("usage: sdrwatch ignore --add FREQ_HZ [--tolerance HZ] [--label TEXT] [--baseline-id ID]")
        print("       sdrwatch ignore --remove ID")
        print("       sdrwatch ignore --list [--baseline-id ID]")
        return _ExitCode.SUCCESS


def cmd_replay(args: argparse.Namespace) -> int:
    import os

    import numpy as np

    from sdrwatch.baseline.store import Store as _Store
    from sdrwatch.recording.compressor import compress_to_ogg
    from sdrwatch.recording.demod import demodulate_fm
    from sdrwatch.util.exit_codes import ExitCode as _ExitCode

    _UNIMPLEMENTED = {"am", "cw", "lsb", "usb"}

    store = _Store(_resolve_db_path(args))
    rec = store.get_recording(args.id)
    if rec is None:
        print(f"error: recording #{args.id} not found")
        return _ExitCode.GENERAL_ERROR

    raw_path = rec.get("raw_path")
    if not raw_path or not os.path.exists(str(raw_path)):
        print(f"error: raw file not found: {raw_path}")
        return _ExitCode.GENERAL_ERROR

    samp_rate = rec.get("sample_rate_hz")
    if not samp_rate:
        print("error: recording missing sample_rate_hz metadata")
        return _ExitCode.GENERAL_ERROR

    mod = str(args.modulation or rec.get("modulation") or "fm")

    if mod in _UNIMPLEMENTED:
        print(f"error: demodulation '{mod}' is not yet implemented")
        return _ExitCode.GENERAL_ERROR

    samp_rate_f = float(samp_rate)
    cf32 = np.fromfile(str(raw_path), dtype=np.complex64)
    audio = demodulate_fm(cf32, samp_rate_f)

    output = str(args.output) if args.output else str(raw_path).replace(".cf32", f"_{mod}.ogg")
    ok = compress_to_ogg(audio, 48000, output)
    if ok:
        print(f"Replayed {mod}: {output}")
        return _ExitCode.SUCCESS

    print("error: OGG compression failed (ffmpeg available?)")
    return _ExitCode.GENERAL_ERROR


def cmd_record(args: argparse.Namespace) -> int:
    from sdrwatch.baseline.store import Store as _Store
    from sdrwatch.recording.cleanup import (
        compute_recording_stats,
        enforce_retention,
    )
    from sdrwatch.util.exit_codes import ExitCode as _ExitCode

    store = _Store(_resolve_db_path(args))
    action = getattr(args, "_record_action", None)

    if action == "cleanup":
        ttl = args.ttl_days
        quota = args.quota_gb
        # capture_dir is unused in enforce_retention for now (file paths are absolute from DB)
        result = enforce_retention(store, "", ttl_days=ttl, quota_gb=quota)
        print(
            f"cleanup: deleted {result['deleted_count']}, "
            f"freed {result['freed_bytes'] / (1024**2):.1f} MB, "
            f"{result['kept_count']} recordings remain"
        )
        return _ExitCode.SUCCESS

    if action == "status":
        stats = compute_recording_stats(store, "")
        print(f"Total recordings:  {stats['total_count']}")
        print(
            f"Disk usage:        {stats['total_bytes'] / (1024**2):.1f} MB "
            f"({stats['total_gb']:.3f} GB)"
        )
        print(f"Oldest recording:  {stats['oldest'] or 'N/A'}")
        print(f"Newest recording:  {stats['newest'] or 'N/A'}")
        return _ExitCode.SUCCESS

    print("usage: sdrwatch record cleanup [--ttl-days 7] [--quota-gb 1]")
    print("       sdrwatch record status")
    return _ExitCode.SUCCESS


if __name__ == "__main__":
    sys.exit(run(parse_args()))
