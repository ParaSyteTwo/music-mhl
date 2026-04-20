from typing import Any

from config import DOWNLOAD_SIGNING_SECRET, RESOLVE_CACHE_MAX, SERVICE_API_KEY, YOUTUBE_COOKIES, YOUTUBE_COOKIES_B64
from fastapi import FastAPI
from imageio_ffmpeg import get_ffmpeg_exe

from modules.cache import get_cache_stats
from modules.maintenance import is_maintenance, get_maintenance_until


def register_health_routes(app: FastAPI) -> None:
    """Registra las rutas de salud del servicio."""

    @app.get("/health")
    async def health() -> dict[str, Any]:
        """Endpoint de health check con diagnóstico de problemas."""
        issues: list[str] = []
        if not SERVICE_API_KEY:
            issues.append("SERVICE_API_KEY no configurada")
        if not DOWNLOAD_SIGNING_SECRET:
            issues.append("DOWNLOAD_SIGNING_SECRET no configurada")
        try:
            get_ffmpeg_exe()
        except Exception:
            issues.append("ffmpeg no disponible")
        in_maintenance = is_maintenance()
        cache_stats = get_cache_stats()
        return {
            "ok": len(issues) == 0 and not in_maintenance,
            "service": "ytdlp-service",
            "issues": issues,
            "cookies_configured": bool(YOUTUBE_COOKIES_B64 or YOUTUBE_COOKIES.strip()),
            "resolve_cache_entries": cache_stats["entries"],
            "resolve_cache_max": RESOLVE_CACHE_MAX,
            "maintenance": in_maintenance,
            "maintenance_until": int(get_maintenance_until()) if in_maintenance else None,
        }
