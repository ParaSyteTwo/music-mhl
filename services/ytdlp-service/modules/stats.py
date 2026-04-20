import collections
from datetime import datetime
from threading import Lock
from typing import Any

_stats_lock = Lock()
_stats: dict[str, Any] = {"total": 0, "today": 0, "day_key": "", "errors": 0}

_error_log: collections.deque[str] = collections.deque(maxlen=20)
_error_log_lock = Lock()


def _increment_downloads() -> None:
    global _stats
    with _stats_lock:
        today_key = datetime.now().strftime("%Y-%m-%d")
        if _stats["day_key"] != today_key:
            _stats = {"total": 0, "today": 0, "day_key": today_key, "errors": 0}
        _stats["total"] += 1
        _stats["today"] += 1


def _increment_errors() -> None:
    with _stats_lock:
        _stats["errors"] = _stats.get("errors", 0) + 1


def _log_error(msg: str) -> None:
    with _error_log_lock:
        _error_log.append(msg)


def get_stats() -> dict[str, Any]:
    with _stats_lock:
        return _stats.copy()


def get_error_log() -> list[str]:
    with _error_log_lock:
        return list(_error_log)
