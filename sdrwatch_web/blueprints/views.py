"""
HTML view routes blueprint for SDRwatch Web.

All template-rendering endpoints have been removed — the React SPA handles
them via the catch-all route in app.py. Only API/export endpoints remain.
"""
from __future__ import annotations

import csv
import io

from flask import Blueprint, Response, jsonify, request

from sdrwatch_web.auth import require_auth
from sdrwatch_web.db import db_state, get_con, qa

bp = Blueprint("views", __name__)


# ---------------------------------------------------------------------------
# Spur map data  (/api/spur-map)
# ---------------------------------------------------------------------------


@bp.get("/api/spur-map")
def api_spur_map():
    """Spur calibration map data as JSON."""
    require_auth()
    state, _ = db_state()
    if state != "ready":
        return jsonify({"spur_entries": []})
    con = get_con()
    try:
        rows = qa(
            con,
            """
            SELECT bin_hz, mean_power_db, hits, last_seen_utc
            FROM spur_map
            ORDER BY bin_hz
            """,
        )
    except Exception:
        rows = []
    return jsonify({"spur_entries": rows})


# ---------------------------------------------------------------------------
# CSV export  (/export/detections.csv)
# ---------------------------------------------------------------------------


@bp.get("/export/detections.csv")
def export_csv():
    """Export detections as CSV."""
    state, _ = db_state()
    if state != "ready":
        return Response("Database not ready", mimetype="text/plain", status=503)

    from sdrwatch_web.db import (
        detection_predicates,
        detections_have_confidence,
        parse_detection_filters,
    )

    con = get_con()
    filters, _ = parse_detection_filters(request.args, default_since_hours=168)
    confidence_available = detections_have_confidence()
    filters["__confidence_available"] = confidence_available

    conds, params = detection_predicates(filters, alias="d")
    where_sql = " WHERE " + " AND ".join(conds) if conds else ""
    confidence_sql = "d.confidence" if confidence_available else "NULL"

    try:
        rows = qa(
            con,
            f"""
            SELECT time_utc, scan_id, f_center_hz, f_low_hz, f_high_hz,
                   peak_db, noise_db, snr_db, service, region, notes,
                   {confidence_sql} AS confidence
            FROM detections d {where_sql}
            ORDER BY time_utc DESC
            LIMIT 100000
            """,
            tuple(params),
        )
    except Exception:
        return Response("Query failed", mimetype="text/plain", status=500)

    buf = io.StringIO()
    fieldnames = [
        "time_utc",
        "scan_id",
        "f_center_hz",
        "f_low_hz",
        "f_high_hz",
        "peak_db",
        "noise_db",
        "snr_db",
        "service",
        "region",
        "notes",
        "confidence",
    ]
    w = csv.DictWriter(buf, fieldnames=fieldnames)
    w.writeheader()
    for r in rows:
        w.writerow({k: r.get(k, "") for k in fieldnames})
    buf.seek(0)

    return Response(
        buf.read(),
        mimetype="text/csv",
        headers={"Content-Disposition": "attachment; filename=detections.csv"},
    )
