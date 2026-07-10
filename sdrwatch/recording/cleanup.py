"""Recording lifecycle: retention TTL and disk quota enforcement."""

from __future__ import annotations

import os
from datetime import UTC, datetime, timedelta

from sdrwatch.util.logging import get_logger

_log = get_logger(__name__)


def enforce_retention(
    store, capture_dir: str, ttl_days: int = 7, quota_gb: int = 1
) -> dict:
    """Delete recordings older than ttl_days; if disk exceeds quota_gb, delete oldest.

    Args:
        store: Store instance with recordings table access.
        capture_dir: Root capture directory (raw/ and ogg/ subdirs).
        ttl_days: Maximum age in days before deletion.
        quota_gb: Maximum disk usage in GB for recordings.

    Returns:
        Dict with: deleted_count, freed_bytes, kept_count.
    """
    result = {"deleted_count": 0, "freed_bytes": 0, "kept_count": 0}

    # TTL: delete recordings older than ttl_days
    cutoff = datetime.now(UTC) - timedelta(days=ttl_days)
    cutoff_str = cutoff.strftime("%Y-%m-%dT%H:%M:%S")
    old_recordings = store.get_recordings_older_than(cutoff_str)

    for rec in old_recordings:
        _delete_recording(store, rec, capture_dir)
        result["deleted_count"] += 1
        result["freed_bytes"] += (rec.get("raw_bytes", 0) or 0) + (
            rec.get("ogg_bytes", 0) or 0
        )

    # Quota: sum active recording bytes, delete oldest if over limit
    active = store.get_active_recordings()
    total_bytes = sum(
        (r.get("raw_bytes", 0) or 0) + (r.get("ogg_bytes", 0) or 0)
        for r in active
    )
    quota_bytes = quota_gb * (1024**3)

    # Sort oldest first for quota enforcement
    active.sort(key=lambda r: r.get("created_utc", ""))

    while total_bytes > quota_bytes and active:
        rec = active.pop(0)
        _delete_recording(store, rec, capture_dir)
        freed = (rec.get("raw_bytes", 0) or 0) + (rec.get("ogg_bytes", 0) or 0)
        total_bytes -= freed
        result["deleted_count"] += 1
        result["freed_bytes"] += freed

    result["kept_count"] = len(active)
    return result


def _delete_recording(store, rec: dict, capture_dir: str) -> None:
    """Delete recording files and DB record."""
    recording_id = rec.get("id")
    raw_path = rec.get("raw_path")
    ogg_path = rec.get("ogg_path")

    if raw_path and os.path.exists(raw_path):
        try:
            os.remove(raw_path)
            _log.debug("deleted raw: %s", raw_path)
        except OSError as e:
            _log.warning("failed to delete raw %s: %s", raw_path, e)

    if ogg_path and os.path.exists(ogg_path):
        try:
            os.remove(ogg_path)
            _log.debug("deleted ogg: %s", ogg_path)
        except OSError as e:
            _log.warning("failed to delete ogg %s: %s", ogg_path, e)

    try:
        store.delete_recording(recording_id)
    except Exception as e:
        _log.warning("failed to delete recording #%s: %s", recording_id, e)


def compute_recording_stats(store, capture_dir: str) -> dict:
    """Compute summary stats about recordings."""
    active = store.get_active_recordings()
    total_bytes = sum(
        (r.get("raw_bytes", 0) or 0) + (r.get("ogg_bytes", 0) or 0)
        for r in active
    )
    return {
        "total_count": len(active),
        "total_bytes": total_bytes,
        "total_gb": total_bytes / (1024**3),
        "oldest": active[0]["created_utc"] if active else None,
        "newest": active[-1]["created_utc"] if active else None,
    }
