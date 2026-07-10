"""
Spectrum PSD data API endpoint — reads from baseline_noise.power_ema.

Returns frequency-mapped power spectral density with optional frequency
bounds and configurable downsampling for the React UI spectrum viewer.
"""
from __future__ import annotations

from typing import Any

from flask import Blueprint, jsonify, request

from sdrwatch_web.db import get_con, q1, qa

bp = Blueprint("api_spectrum", __name__)


@bp.get("/api/spectrum")
def api_spectrum() -> Any:
    """Return PSD spectrum data with frequency mapping from baseline_noise.

    Query params:
        baseline_id (int, required): Baseline to query.
        f_min_hz (float, optional): Lower frequency bound.
        f_max_hz (float, optional): Upper frequency bound.
        points (int, optional): Number of output points (default 1000, max 5000).
    """
    baseline_id = request.args.get("baseline_id", type=int)
    if not baseline_id:
        return jsonify({"error": "baseline_id is required"}), 400

    f_min = request.args.get("f_min_hz", type=float)
    f_max = request.args.get("f_max_hz", type=float)
    points = min(request.args.get("points", 1000, type=int), 5000)

    con = get_con()

    # Get baseline frequency bounds
    bl = q1(
        con,
        "SELECT freq_start_hz, freq_stop_hz, bin_hz FROM baselines WHERE id = ?",
        (baseline_id,),
    )
    if not bl:
        return jsonify({"error": "Baseline not found"}), 404

    freq_start: float = bl["freq_start_hz"]
    bin_hz: float = bl["bin_hz"] if bl["bin_hz"] and bl["bin_hz"] > 0 else 585.9

    # Build query with optional freq bounds
    where = ["baseline_id = ?"]
    params: list[Any] = [baseline_id]
    if f_min is not None:
        bin_min = max(0, int((f_min - freq_start) / bin_hz))
        where.append("bin_index >= ?")
        params.append(bin_min)
    if f_max is not None:
        bin_max = int((f_max - freq_start) / bin_hz)
        where.append("bin_index <= ?")
        params.append(bin_max)

    rows = qa(
        con,
        f"SELECT bin_index, noise_floor_ema, power_ema FROM baseline_noise WHERE {' AND '.join(where)} ORDER BY bin_index",
        params,
    )

    if not rows:
        return jsonify({"freqs": [], "power_db": [], "noise_db": []})

    # Build arrays
    freqs: list[float] = [freq_start + r["bin_index"] * bin_hz for r in rows]
    power_db: list[float] = [r["power_ema"] if r["power_ema"] is not None else -999.0 for r in rows]
    noise_db: list[float] = [r["noise_floor_ema"] if r["noise_floor_ema"] is not None else -999.0 for r in rows]

    # Downsample to requested points (uniform decimation)
    n = len(freqs)
    if n > points:
        step = n // points
        freqs = freqs[::step][:points]
        power_db = power_db[::step][:points]
        noise_db = noise_db[::step][:points]

    return jsonify({"freqs": freqs, "power_db": power_db, "noise_db": noise_db})
