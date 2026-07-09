"""
Chart data API endpoints for the React dashboard.

Provides clean JSON endpoints for chart data consumed by the React UI,
stripping Jinja2 template-only fields from the underlying charts.py responses.
"""
from __future__ import annotations

from typing import Any, Dict, Set

from flask import Blueprint, abort, jsonify, request

from sdrwatch_web.baseline_helpers import fetch_baseline_record
from sdrwatch_web.charts import (
    coverage_heatmap,
    frequency_bins_all_scans_avg,
    frequency_bins_latest_scan,
    snr_histogram,
    strongest_signals,
    timeline_metrics,
    top_services,
)
from sdrwatch_web.db import get_con_optional
from sdrwatch_web.filters import parse_detection_filters


bp = Blueprint("api_charts", __name__)


# ---------------------------------------------------------------------------
# Template field stripping
# ---------------------------------------------------------------------------

_TEMPLATE_FIELDS: Set[str] = {
    "style_attr",
    "height_px",
    "chart_style_attr",
    "chart_px",
    "det_height",
    "scan_height",
    "snr_height",
    "det_style_attr",
    "scan_style_attr",
    "snr_style_attr",
}
"""Jinja2-specific fields stripped from all chart API responses."""


def _strip_template_fields(obj: Any) -> Any:
    """Recursively remove Jinja2 template-only fields from chart data."""
    if isinstance(obj, dict):
        return {
            k: _strip_template_fields(v)
            for k, v in obj.items()
            if k not in _TEMPLATE_FIELDS
        }
    if isinstance(obj, list):
        return [_strip_template_fields(item) for item in obj]
    return obj


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _build_filters() -> Dict[str, Any]:
    """Build filters dict from request query parameters."""
    filters, _ = parse_detection_filters(request.args)
    baseline_id_raw = request.args.get("baseline_id", "").strip()
    if baseline_id_raw:
        try:
            filters["baseline_id"] = int(baseline_id_raw)
        except ValueError:
            pass
    return filters


# ---------------------------------------------------------------------------
# GET /api/baselines/<int:baseline_id> — single baseline detail
# ---------------------------------------------------------------------------


@bp.get("/api/baselines/<int:baseline_id>")
def api_baseline_detail(baseline_id: int):
    """Return a single baseline record by ID."""
    baseline = fetch_baseline_record(baseline_id)
    if not baseline:
        abort(404, description="Baseline not found")
    return jsonify(baseline)


# ---------------------------------------------------------------------------
# GET /api/charts/timeline — timeline metrics
# ---------------------------------------------------------------------------


@bp.get("/api/charts/timeline")
def api_chart_timeline():
    """Return timeline metrics (detections and scans over time).

    Query params:
        baseline_id: Optional baseline filter.
        since_hours: Lookback window in hours (default: 168).
    """
    con = get_con_optional()
    if con is None:
        return jsonify({"error": "database not available"}), 503

    filters = _build_filters()
    data = timeline_metrics(con, filters)
    return jsonify(_strip_template_fields(data))


# ---------------------------------------------------------------------------
# GET /api/charts/coverage-heatmap — coverage heatmap
# ---------------------------------------------------------------------------


@bp.get("/api/charts/coverage-heatmap")
def api_chart_coverage_heatmap():
    """Return coverage heatmap (detection density by scan and frequency).

    Query params:
        baseline_id: Optional baseline filter.
        scans: Max number of recent scans (default: 20).
        bins: Number of frequency bins (default: 36).
    """
    con = get_con_optional()
    if con is None:
        return jsonify({"error": "database not available"}), 503

    filters = _build_filters()
    max_scans = request.args.get("scans", 20, type=int)
    num_bins = request.args.get("bins", 36, type=int)

    data = coverage_heatmap(con, filters, max_scans=max_scans, num_bins=num_bins)
    return jsonify(_strip_template_fields(data))


# ---------------------------------------------------------------------------
# GET /api/charts/snr-histogram — SNR distribution
# ---------------------------------------------------------------------------


@bp.get("/api/charts/snr-histogram")
def api_chart_snr_histogram():
    """Return SNR histogram distribution.

    Query params:
        baseline_id: Optional baseline filter.
        bucket_db: Bucket width in dB (default: 3).
    """
    con = get_con_optional()
    if con is None:
        return jsonify({"error": "database not available"}), 503

    filters = _build_filters()
    bucket_db = request.args.get("bucket_db", 3, type=int)

    hist, stats = snr_histogram(con, filters, bucket_db=bucket_db)
    return jsonify({
        "histogram": _strip_template_fields(hist),
        "stats": stats,
    })


# ---------------------------------------------------------------------------
# GET /api/charts/frequency-bins — latest + average frequency bins
# ---------------------------------------------------------------------------


@bp.get("/api/charts/frequency-bins")
def api_chart_frequency_bins():
    """Return latest scan and all-scans-average frequency bin data.

    Query params:
        baseline_id: Optional baseline filter.
        bins: Number of frequency bins (default: 40).
    """
    con = get_con_optional()
    if con is None:
        return jsonify({"error": "database not available"}), 503

    filters = _build_filters()
    num_bins = request.args.get("bins", 40, type=int)

    latest_bins, latest_scan, latest_max = frequency_bins_latest_scan(
        con, filters, num_bins=num_bins,
    )
    avg_bins, avg_f_start, avg_f_stop, avg_max = frequency_bins_all_scans_avg(
        con, filters, num_bins=num_bins,
    )

    return jsonify({
        "latest": {
            "bins": _strip_template_fields(latest_bins),
            "scan": latest_scan,
            "max_count": latest_max,
        },
        "average": {
            "bins": _strip_template_fields(avg_bins),
            "f_start_mhz": avg_f_start,
            "f_stop_mhz": avg_f_stop,
            "max_avg": avg_max,
        },
    })


# ---------------------------------------------------------------------------
# GET /api/charts/top-services — top services by count
# ---------------------------------------------------------------------------


@bp.get("/api/charts/top-services")
def api_chart_top_services():
    """Return top services ranked by detection count.

    Query params:
        baseline_id: Optional baseline filter.
        limit: Max results (default: 10).
    """
    con = get_con_optional()
    if con is None:
        return jsonify({"error": "database not available"}), 503

    filters = _build_filters()
    limit = request.args.get("limit", 10, type=int)

    data = top_services(con, filters, limit=limit)
    return jsonify(data)


# ---------------------------------------------------------------------------
# GET /api/charts/strongest-signals — strongest signals by SNR
# ---------------------------------------------------------------------------


@bp.get("/api/charts/strongest-signals")
def api_chart_strongest_signals():
    """Return strongest signals sorted by SNR descending.

    Query params:
        baseline_id: Optional baseline filter.
        limit: Max results (default: 10).
    """
    con = get_con_optional()
    if con is None:
        return jsonify({"error": "database not available"}), 503

    filters = _build_filters()
    limit = request.args.get("limit", 10, type=int)

    data = strongest_signals(con, filters, limit=limit)
    return jsonify(data)
