import threading
from typing import Any

from config import DOWNLOAD_SIGNING_SECRET, RESOLVE_CACHE_MAX, SERVICE_API_KEY, YOUTUBE_COOKIES, YOUTUBE_COOKIES_B64
from fastapi import FastAPI
from imageio_ffmpeg import get_ffmpeg_exe
import shutil

from modules.cache import get_cache_stats
from modules.cookies import _ALL_COOKIES_B64, check_all_cookies, _test_cookies_b64
from modules.maintenance import is_maintenance, get_maintenance_until


def register_health_routes(app: FastAPI) -> None:
    """Registra las rutas de salud del servicio."""

    @app.get("/health")
    async def health() -> dict[str, Any]:
        """Endpoint de health check con diagnóstico de problemas."""
        issues: list[str] = []

        # Config básica
        if not SERVICE_API_KEY:
            issues.append("SERVICE_API_KEY no configurada")
        if not DOWNLOAD_SIGNING_SECRET:
            issues.append("DOWNLOAD_SIGNING_SECRET no configurada")

        # FFmpeg (ambos métodos)
        ffmpeg_found = False
        if shutil.which("ffmpeg"):
            ffmpeg_found = True
        else:
            try:
                get_ffmpeg_exe()
                ffmpeg_found = True
            except Exception:
                pass
        if not ffmpeg_found:
            issues.append("ffmpeg no disponible")

        # Cookies: revisar cantidad y validez en background (no bloquear)
        cookies_status = {
            "configured": len(_ALL_COOKIES_B64),
            "valid": 0,
            "expired": 0,
        }

        def _check_cookies_async() -> None:
            if _ALL_COOKIES_B64:
                for b64 in _ALL_COOKIES_B64:
                    if _test_cookies_b64(b64):
                        cookies_status["valid"] += 1
                    else:
                        cookies_status["expired"] += 1

        # Test cookies en thread aparte (timeout 40s)
        t = threading.Thread(target=_check_cookies_async, daemon=True)
        t.start()
        t.join(timeout=40)

        if cookies_status["configured"] > 0 and cookies_status["valid"] == 0:
            issues.append(f"⚠️ Todas las {cookies_status['configured']} cookies están expiradas")

        in_maintenance = is_maintenance()
        cache_stats = get_cache_stats()

        return {
            "ok": len(issues) == 0 and not in_maintenance,
            "service": "ytdlp-service",
            "issues": issues,
            "cookies": cookies_status,
            "resolve_cache_entries": cache_stats["entries"],
            "resolve_cache_max": RESOLVE_CACHE_MAX,
            "maintenance": in_maintenance,
            "maintenance_until": int(get_maintenance_until()) if in_maintenance else None,
        }
