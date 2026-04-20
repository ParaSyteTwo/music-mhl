from typing import Any

from fastapi import FastAPI, Header, HTTPException

from modules.auth import require_service_key
from modules.cookies import (
    _ALL_COOKIES_B64,
    _test_cookies_b64,
    get_active_cookies_b64,
    get_cookies_index,
    rotate_cookies,
)
from modules.download import ytdlp_version_info


def register_internal_routes(app: FastAPI) -> None:
    """Registra las rutas internas de monitoreo."""

    @app.get("/internal/keepalive-yt")
    async def keepalive_youtube(
        authorization: str | None = Header(default=None),
    ) -> dict[str, Any]:
        """Monitorea la salud de las cookies de YouTube y yt-dlp."""
        require_service_key(authorization)
        active_b64 = get_active_cookies_b64()
        if not active_b64:
            return {
                "ok": False,
                "reason": "no cookies configured",
                "cookies_total": 0,
            }

        cookies_total = len(_ALL_COOKIES_B64)
        initial_index = get_cookies_index()

        ok = _test_cookies_b64(active_b64)
        rotated = False
        if not ok and cookies_total > 1:
            rotate_cookies()
            rotated = True
            next_b64 = get_active_cookies_b64()
            ok = _test_cookies_b64(next_b64)

        ytdlp = ytdlp_version_info()
        ytdlp_old = ytdlp["age_days"] > 30

        print(
            f"[keepalive-yt] cookies #{get_cookies_index() + 1}/{cookies_total} "
            f"ok={ok} rotated={rotated} yt-dlp={ytdlp['version']} ({ytdlp['age_days']}d)",
            flush=True,
        )

        return {
            "ok": ok,
            "cookies_index": get_cookies_index() + 1,
            "cookies_total": cookies_total,
            "rotated": rotated,
            "previous_index": initial_index + 1,
            "ytdlp_version": ytdlp["version"],
            "ytdlp_age_days": ytdlp["age_days"],
            "ytdlp_outdated": ytdlp_old,
        }
