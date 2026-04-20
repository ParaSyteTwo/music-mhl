import collections
from datetime import datetime, timezone
from threading import Lock
from typing import Any

from config import RESOLVE_CACHE_MAX, RESOLVE_CACHE_TTL
from .utils import normalize_search_term

_resolve_cache: collections.OrderedDict[str, dict[str, Any]] = collections.OrderedDict()
_resolve_cache_lock = Lock()


def cache_key(title: str, artist: str) -> str:
    """Genera clave de caché a partir de título y artista normalizados."""
    return f"{normalize_search_term(title)}|{normalize_search_term(artist)}"


def cache_get(key: str) -> dict[str, Any] | None:
    """Obtiene una entrada del caché si existe y no ha expirado."""
    with _resolve_cache_lock:
        entry = _resolve_cache.get(key)
        if entry is None:
            return None
        if datetime.now(timezone.utc).timestamp() - entry["ts"] > RESOLVE_CACHE_TTL:
            del _resolve_cache[key]
            return None
        _resolve_cache.move_to_end(key)
        return entry


def cache_set(key: str, video_id: str, candidate: dict[str, Any]) -> None:
    """Almacena una entrada en el caché con LRU eviction."""
    with _resolve_cache_lock:
        if key in _resolve_cache:
            _resolve_cache.move_to_end(key)
        else:
            if len(_resolve_cache) >= RESOLVE_CACHE_MAX:
                _resolve_cache.popitem(last=False)
        _resolve_cache[key] = {
            "videoId": video_id,
            "title": candidate.get("title", ""),
            "duration": int(candidate.get("duration") or 0),
            "ts": datetime.now(timezone.utc).timestamp(),
        }


def get_cache_stats() -> dict[str, int]:
    """Retorna estadísticas del caché."""
    with _resolve_cache_lock:
        return {"entries": len(_resolve_cache), "max": RESOLVE_CACHE_MAX}
