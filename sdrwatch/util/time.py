"""Time utilities shared across SDRwatch components."""

from __future__ import annotations

from datetime import UTC, datetime


def utc_now_str() -> str:
    """Return the current UTC timestamp as an ISO-8601 string."""
    return datetime.now(UTC).isoformat()
