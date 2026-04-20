import asyncio
import threading
from typing import Any

from fastapi import FastAPI, Header, HTTPException

from modules.auth import require_service_key
from modules.cookies import (
    _ALL_COOKIES_B64,
    _test_cookies_b64,
    add_cookie_smart,
    check_all_cookies,
    get_active_cookies_b64,
    get_cookies_index,
    rotate_cookies,
)
from modules.download import ytdlp_version_info
from modules.telegram import send_telegram


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

    @app.post("/internal/add-cookie")
    async def add_cookie(
        payload: dict[str, Any],
        authorization: str | None = Header(default=None),
    ) -> dict[str, Any]:
        """Agrega una nueva cookie de YouTube (base64) inteligentemente.
        Reemplaza las rotas o expande hasta 4 slots máximo."""
        require_service_key(authorization)

        b64 = str(payload.get("cookie_b64") or "").strip()
        if not b64:
            raise HTTPException(status_code=400, detail="cookie_b64 requerido")

        # Valida que sea b64 válido
        try:
            import base64
            _b64_clean = b64.rstrip("=")
            _b64_clean += "=" * (-len(_b64_clean) % 4)
            base64.b64decode(_b64_clean)
        except Exception as e:
            raise HTTPException(
                status_code=400, detail=f"cookie_b64 no es válido base64: {e}"
            )

        # Prueba antes de añadir
        works = _test_cookies_b64(b64)

        # Añade inteligentemente
        result = add_cookie_smart(b64)

        # Notifica por Telegram
        action_text = {
            "added": "✅ Agregada",
            "replaced_broken": "🔧 Reemplazó rota",
            "replaced_active": "🔄 Reemplazó activa",
        }.get(result.get("action"), "?")

        msg = (
            f"{action_text} cookie #{result.get('slot')}/{result.get('total')}\n"
            f"Funciona: {'✅ Sí' if works else '❌ No (expirada?)'}"
        )
        threading.Thread(
            target=lambda m=msg: asyncio.run(send_telegram(m)),
            daemon=True,
        ).start()

        print(
            f"[add-cookie] {result.get('action')} #{result.get('slot')} "
            f"total={result.get('total')} works={works}",
            flush=True,
        )

        return {
            "success": True,
            "works": works,
            **result,
        }

    @app.get("/internal/check-cookies")
    async def check_cookies_endpoint(
        authorization: str | None = Header(default=None),
    ) -> dict[str, Any]:
        """Chequea todas las cookies en paralelo. Tarea costosa (40s timeout)."""
        require_service_key(authorization)

        if not _ALL_COOKIES_B64:
            return {
                "total": 0,
                "ok": 0,
                "removed": 0,
                "message": "No hay cookies configuradas",
            }

        report = check_all_cookies()
        total, ok, removed = report["total"], report["ok"], report["removed"]

        msg = (
            f"🍪 Chequeo manual de cookies\n"
            f"{'🟢' * ok + '❌' * removed}\n"
            f"✅ {ok}/{total} activas"
        )
        if removed:
            msg += f"\n❌ {removed} eliminadas"

        threading.Thread(
            target=lambda m=msg: asyncio.run(send_telegram(m)),
            daemon=True,
        ).start()

        return {
            **report,
            "message": f"{ok}/{total} cookies válidas",
        }
