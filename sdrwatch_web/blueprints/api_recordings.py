"""
Recording and ignore-rule API endpoints for SDRwatch Web.

Provides REST API for recording CRUD, raw/OGG file serving, signal queuing,
modulation classification, demodulation, and ignore-rule management.
"""
from __future__ import annotations

import os
import sqlite3
from typing import Any, Dict, List

from flask import Blueprint, Response, abort, current_app, jsonify, request, send_file

from sdrwatch_web.auth import require_auth
from sdrwatch_web.db import get_con

bp = Blueprint("api_recordings", __name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _db_path() -> str:
    """Get the writable database path from app config."""
    return (
        current_app.config.get("SDRWATCH_DB_PATH")
        or current_app.config.get("DB_PATH")
        or ""
    )


def _open_write_con() -> sqlite3.Connection:
    """Open a writable SQLite connection with dict row factory."""
    path = _db_path()
    if not path:
        raise RuntimeError("database path not configured")
    con = sqlite3.connect(path, timeout=10)
    con.row_factory = lambda cur, row: {d[0]: row[i] for i, d in enumerate(cur.description)}
    con.execute("PRAGMA busy_timeout=5000")
    return con


_RECORDING_COLS = """
    id, baseline_id, detection_id, f_center_hz, bandwidth_hz,
    started_utc, duration_ms, sample_rate_hz, raw_path, raw_bytes,
    modulation, ogg_path, ogg_bytes, raw_deleted, status, error,
    created_utc
"""


def _enrich_recording(rec: Dict[str, Any]) -> Dict[str, Any]:
    """Add computed fields to a recording dict."""
    if rec.get("raw_path") and os.path.exists(rec["raw_path"]):
        rec["raw_exists"] = True
        rec["raw_size_display"] = _format_bytes(rec.get("raw_bytes") or 0)
    if rec.get("ogg_path") and os.path.exists(rec["ogg_path"]):
        rec["ogg_exists"] = True
        rec["ogg_size_display"] = _format_bytes(rec.get("ogg_bytes") or 0)
    f_center = rec.get("f_center_hz")
    rec["f_mhz"] = round(f_center / 1e6, 4) if f_center else None
    return rec


def _format_bytes(b: float) -> str:
    """Format byte count as a human-readable string."""
    for unit in ["B", "KB", "MB", "GB"]:
        if b < 1024:
            return f"{b:.1f} {unit}"
        b /= 1024
    return f"{b:.1f} TB"


# ---------------------------------------------------------------------------
# Recording list
# ---------------------------------------------------------------------------


@bp.get("/api/recordings")
def api_recordings_list():
    """List recordings, filterable by baseline_id, detection_id, modulation, status, f_min_mhz, f_max_mhz."""
    require_auth()

    baseline_id = request.args.get("baseline_id", type=int)
    detection_id = request.args.get("detection_id", type=int)
    modulation = request.args.get("modulation")
    status = request.args.get("status")
    show_queued = request.args.get("show_queued", "").strip().lower() in ("1", "true")
    f_min_mhz = request.args.get("f_min_mhz", type=float)
    f_max_mhz = request.args.get("f_max_mhz", type=float)

    con = get_con()
    conditions: List[str] = []
    params: List[Any] = []

    # Hide queued recordings by default — they're placeholders with no files
    if not status and not show_queued:
        conditions.append("status != 'queued'")

    if baseline_id is not None:
        conditions.append("baseline_id = ?")
        params.append(baseline_id)
    if detection_id is not None:
        conditions.append("detection_id = ?")
        params.append(detection_id)
    if modulation:
        conditions.append("modulation = ?")
        params.append(modulation)
    if status:
        conditions.append("status = ?")
        params.append(status)
    if f_min_mhz is not None:
        conditions.append("f_center_hz >= ?")
        params.append(int(f_min_mhz * 1e6))
    if f_max_mhz is not None:
        conditions.append("f_center_hz <= ?")
        params.append(int(f_max_mhz * 1e6))

    where = " AND ".join(conditions) if conditions else "1=1"
    rows = con.execute(
        f"SELECT {_RECORDING_COLS} FROM recordings WHERE {where} ORDER BY created_utc DESC LIMIT 200",
        tuple(params) if params else (),
    ).fetchall()

    recordings = [_enrich_recording(dict(r)) for r in rows]
    return jsonify({"recordings": recordings})


# ---------------------------------------------------------------------------
# Recording detail
# ---------------------------------------------------------------------------


@bp.get("/api/recordings/<int:recording_id>")
def api_recordings_detail(recording_id: int):
    """Get full details for a single recording."""
    require_auth()
    con = get_con()
    row = con.execute(
        f"SELECT {_RECORDING_COLS} FROM recordings WHERE id = ?",
        (recording_id,),
    ).fetchone()
    if not row:
        abort(404, description="Recording not found")
    rec = _enrich_recording(dict(row))
    return jsonify(rec)


# ---------------------------------------------------------------------------
# Delete recording
# ---------------------------------------------------------------------------


@bp.delete("/api/recordings/<int:recording_id>")
def _delete_one(con, recording_id: int) -> bool:
    """Delete a single recording's files and DB row. Returns True if deleted."""
    row = con.execute(
        "SELECT raw_path, ogg_path FROM recordings WHERE id = ?",
        (recording_id,),
    ).fetchone()
    if not row:
        return False
    for path in (row["raw_path"], row["ogg_path"]):
        if path and os.path.exists(path):
            try:
                os.remove(path)
            except OSError:
                pass
    con.execute("DELETE FROM recordings WHERE id = ?", (recording_id,))
    return True


@bp.delete("/api/recordings/<int:recording_id>")
def api_recordings_delete(recording_id: int):
    """Delete a recording (files + DB row)."""
    require_auth()
    wcon = _open_write_con()
    try:
        ok = _delete_one(wcon, recording_id)
        wcon.commit()
    finally:
        wcon.close()
    if not ok:
        abort(404, description="Recording not found")
    return jsonify({"ok": True})


@bp.post("/api/recordings/bulk-delete")
def api_recordings_bulk_delete():
    """Delete multiple recordings at once."""
    require_auth()
    body = request.get_json(force=True, silent=True) or {}
    ids = body.get("ids", [])
    if not ids or not isinstance(ids, list):
        return jsonify({"error": "ids must be a non-empty list"}), 400
    wcon = _open_write_con()
    try:
        deleted = 0
        for rid in ids:
            if _delete_one(wcon, int(rid)):
                deleted += 1
        wcon.commit()
    finally:
        wcon.close()
    return jsonify({"ok": True, "deleted": deleted})


# ---------------------------------------------------------------------------
# Download raw .cf32 file
# ---------------------------------------------------------------------------


@bp.get("/api/recordings/<int:recording_id>/download/raw")
def api_recordings_download_raw(recording_id: int):
    """Serve the raw .cf32 recording file."""
    require_auth()
    con = get_con()
    row = con.execute(
        "SELECT raw_path FROM recordings WHERE id = ?", (recording_id,)
    ).fetchone()
    if not row or not row["raw_path"] or not os.path.exists(row["raw_path"]):
        abort(404)
    return send_file(
        row["raw_path"],
        mimetype="application/octet-stream",
        as_attachment=True,
    )


# ---------------------------------------------------------------------------
# Download .ogg file
# ---------------------------------------------------------------------------


@bp.get("/api/recordings/<int:recording_id>/download/ogg")
def api_recordings_download_ogg(recording_id: int):
    """Serve the compressed .ogg recording file."""
    require_auth()
    con = get_con()
    row = con.execute(
        "SELECT ogg_path FROM recordings WHERE id = ?", (recording_id,)
    ).fetchone()
    if not row or not row["ogg_path"] or not os.path.exists(row["ogg_path"]):
        abort(404)
    return send_file(
        row["ogg_path"],
        mimetype="audio/ogg",
        as_attachment=True,
    )


@bp.get("/api/recordings/<int:recording_id>/amplitude")
def api_recordings_amplitude(recording_id: int):
    """Return amplitude envelope as raw float32 binary (500 points)."""
    require_auth()
    con = get_con()
    row = con.execute(
        "SELECT raw_path, sample_rate_hz FROM recordings WHERE id = ?",
        (recording_id,),
    ).fetchone()
    if not row or not row["raw_path"] or not os.path.exists(row["raw_path"]):
        abort(404, description="Raw file not found")
    try:
        import numpy as np
        cf32 = np.fromfile(row["raw_path"], dtype=np.complex64)
        mag = np.abs(cf32)
        target = 500
        step = max(1, len(mag) // target)
        downsampled = mag[::step].astype(np.float32)
        mx = float(np.max(downsampled))
        if mx > 0:
            downsampled = (downsampled / mx).astype(np.float32)
        raw_bytes = downsampled.tobytes()
        return Response(
            raw_bytes,
            mimetype="application/octet-stream",
            headers={
                "X-Amplitude-Points": str(len(downsampled)),
                "X-Amplitude-Sample-Rate": str(float(row["sample_rate_hz"] or 2.4e6)),
            },
        )
    except Exception as e:
        abort(500, description=str(e))


# ---------------------------------------------------------------------------
# Queue a signal for recording
# ---------------------------------------------------------------------------


@bp.post("/api/recordings/<detection_id>/queue")
def api_recordings_queue(detection_id: int):
    """Queue a detection for recording on the next recording pass."""
    require_auth()
    body = request.get_json(force=True, silent=True) or {}
    baseline_id = body.get("baseline_id")
    f_center_hz = body.get("f_center_hz")
    bandwidth_hz = body.get("bandwidth_hz", 0)
    if not baseline_id or not f_center_hz:
        abort(400, description="baseline_id and f_center_hz required")
    wcon = _open_write_con()
    try:
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc)
        cur = wcon.execute(
            "INSERT INTO recordings (baseline_id, detection_id, f_center_hz, bandwidth_hz, "
            "started_utc, duration_ms, sample_rate_hz, status) VALUES (?, ?, ?, ?, ?, 0, 0, 'queued')",
            (int(baseline_id), int(detection_id), int(f_center_hz), float(bandwidth_hz),
             now.strftime("%Y-%m-%dT%H:%M:%S")),
        )
        wcon.commit()
        rec_id = cur.lastrowid
    finally:
        wcon.close()
    return jsonify({"ok": True, "recording_id": rec_id, "message": "Signal queued for recording"})


# ---------------------------------------------------------------------------
# Re-run modulation classifier
# ---------------------------------------------------------------------------


@bp.post("/api/recordings/<int:recording_id>/classify")
def api_recordings_classify(recording_id: int):
    """Re-run modulation classification on a raw recording."""
    require_auth()

    con = get_con()
    row = con.execute(
        "SELECT raw_path, sample_rate_hz, f_center_hz, bandwidth_hz FROM recordings WHERE id = ?",
        (recording_id,),
    ).fetchone()
    if not row:
        abort(404)
    if not row["raw_path"] or not os.path.exists(row["raw_path"]):
        abort(400, description="Raw file not found")

    try:
        import numpy as np
        from sdrwatch.recording.classifier import classify_modulation

        samp_rate = float(row["sample_rate_hz"] or 2.4e6)
        f_center = int(row["f_center_hz"] or 0)
        bw = float(row["bandwidth_hz"] or 0)
        cf32 = np.fromfile(row["raw_path"], dtype=np.complex64)
        mod = classify_modulation(cf32, samp_rate, f_center, bw)

        wcon = _open_write_con()
        try:
            wcon.execute(
                "UPDATE recordings SET modulation = ? WHERE id = ?",
                (mod, recording_id),
            )
            wcon.commit()
        finally:
            wcon.close()

        return jsonify({"modulation": mod})
    except Exception as e:
        abort(500, description=str(e))


# ---------------------------------------------------------------------------
# Trigger demodulation
# ---------------------------------------------------------------------------

_DEMOD_FN_MAP: Dict[str, str] = {
    "fm": "demodulate_fm",
    "am": "demodulate_am",
    "cw": "demodulate_cw",
    "lsb": "demodulate_lsb",
    "usb": "demodulate_usb",
}


@bp.post("/api/recordings/<int:recording_id>/demod")
def api_recordings_demod(recording_id: int):
    """Demodulate a raw recording with the specified modulation."""
    require_auth()

    body = request.get_json(force=True, silent=True) or {}
    modulation = str(body.get("modulation", "fm")).lower()

    if modulation not in _DEMOD_FN_MAP:
        abort(400, description=f"Unsupported modulation '{modulation}'")

    con = get_con()
    row = con.execute(
        "SELECT raw_path, sample_rate_hz FROM recordings WHERE id = ?",
        (recording_id,),
    ).fetchone()
    if not row:
        abort(404)
    if not row["raw_path"] or not os.path.exists(row["raw_path"]):
        abort(400, description="Raw file not found")

    try:
        import numpy as np
        from sdrwatch.recording.demod import (
            demodulate_am,
            demodulate_cw,
            demodulate_fm,
            demodulate_lsb,
            demodulate_usb,
        )
        from sdrwatch.recording.compressor import compress_to_ogg

        samp_rate = float(row["sample_rate_hz"] or 2.4e6)
        cf32 = np.fromfile(row["raw_path"], dtype=np.complex64)

        demod_fn_map = {
            "fm": demodulate_fm,
            "am": demodulate_am,
            "cw": demodulate_cw,
            "lsb": demodulate_lsb,
            "usb": demodulate_usb,
        }
        fn = demod_fn_map.get(modulation, demodulate_fm)
        audio = fn(cf32, samp_rate)

        ogg_dir = os.path.join(
            os.path.dirname(row["raw_path"]).replace("/raw", "/ogg")
        )
        os.makedirs(ogg_dir, exist_ok=True)
        ogg_path = os.path.join(ogg_dir, f"{recording_id}_{modulation}.ogg")

        ok = compress_to_ogg(audio, 48000, ogg_path)
        if not ok:
            abort(500, description="OGG compression failed")

        # Return the OGG file directly for client-side playback
        return send_file(ogg_path, mimetype="audio/ogg")
    except NotImplementedError:
        abort(400, description=f"Demodulation '{modulation}' not yet implemented")
    except Exception as e:
        abort(500, description=str(e))


# ---------------------------------------------------------------------------
# Ignore rules: list
# ---------------------------------------------------------------------------


@bp.get("/api/ignore-rules")
def api_ignore_rules_list():
    """List all ignore rules."""
    require_auth()
    from sdrwatch.baseline.store import Store

    store = Store(_db_path())
    rules = store.list_ignore_rules()
    return jsonify({"rules": rules})


# ---------------------------------------------------------------------------
# Ignore rules: create
# ---------------------------------------------------------------------------


@bp.post("/api/ignore-rules")
def api_ignore_rules_create():
    """Create a new ignore rule."""
    require_auth()
    body = request.get_json(force=True, silent=True) or {}
    freq = body.get("f_center_hz") or body.get("freq")
    if not freq:
        abort(400, description="f_center_hz (or freq) is required")

    from sdrwatch.baseline.store import Store

    store = Store(_db_path())
    rule_id = store.add_ignore_rule(
        baseline_id=int(body.get("baseline_id", 0)),
        f_center_hz=int(freq),
        tolerance_hz=int(body.get("tolerance_hz", 50000)),
        label=body.get("label"),
    )
    return jsonify({"id": rule_id, "ok": True})


# ---------------------------------------------------------------------------
# Ignore rules: delete
# ---------------------------------------------------------------------------


@bp.delete("/api/ignore-rules/<int:rule_id>")
def api_ignore_rules_delete(rule_id: int):
    """Delete an ignore rule."""
    require_auth()
    from sdrwatch.baseline.store import Store

    store = Store(_db_path())
    store.remove_ignore_rule(rule_id)
    return jsonify({"ok": True})
