from threading import Lock
from typing import Any

from config import RATE_LIMIT_BURST, RATE_LIMIT_DAILY, RATE_LIMIT_WINDOW_SECONDS
from .utils import utc_now_ts

_rate_store: dict[str, dict[str, Any]] = {}
_rate_store_lock = Lock()


def check_rate_limit(ip: str) -> tuple[bool, str, int | None]:
    """
    Returns: (is_ok, error_message, retry_after_seconds)
    """
    with _rate_store_lock:
        now = utc_now_ts()

        # Initialize IP entry if not exists
        if ip not in _rate_store:
            _rate_store[ip] = {
                "burst_count": 0,
                "burst_window_start": now,
                "daily_count": 0,
                "daily_window_start": now,
            }

        entry = _rate_store[ip]

        # Check burst limit
        if now - entry["burst_window_start"] < RATE_LIMIT_WINDOW_SECONDS:
            if entry["burst_count"] >= RATE_LIMIT_BURST:
                retry_after = RATE_LIMIT_WINDOW_SECONDS - (now - entry["burst_window_start"])
                return False, "Too many requests", max(1, retry_after)
            entry["burst_count"] += 1
        else:
            entry["burst_count"] = 1
            entry["burst_window_start"] = now

        # Check daily limit
        if now - entry["daily_window_start"] < 86400:  # 24 hours
            if entry["daily_count"] >= RATE_LIMIT_DAILY:
                retry_after = 86400 - (now - entry["daily_window_start"])
                return False, "Daily quota exceeded", max(1, retry_after)
            entry["daily_count"] += 1
        else:
            entry["daily_count"] = 1
            entry["daily_window_start"] = now

        return True, "", None


def get_client_ip(request) -> str:
    """Extract client IP from request, handling proxies."""
    if request.headers.get("x-forwarded-for"):
        return request.headers.get("x-forwarded-for").split(",")[0].strip()
    return request.client.host if request.client else "unknown"
