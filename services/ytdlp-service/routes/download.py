import asyncio
import json
import tempfile
import threading
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Header, HTTPException, Query, Request
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask
from yt_dlp import YoutubeDL

from config import RAILWAY_PUBLIC_DOMAIN, TEMP_DIR, YTDLP_CLIENTS
from modules.auth import build_token, require_service_key, verify_token
from modules.cache import cache_get, cache_key, cache_set
from modules.cookies import (
    _ALL_COOKIES_B64,
    get_active_cookies_b64,
    get_cookies_index,
    rotate_cookies,
)
from modules.download import (
    YTDLP_ERROR_LABELS,
    build_download_options,
    cleanup_job,
    classify_ytdlp_error,
    download_slots,
    try_auto_update_ytdlp,
)
from modules.maintenance import is_maintenance
from modules.rate_limit import check_rate_limit, get_client_ip
from modules.search import score_candidate, search_candidates
from modules.stats import _increment_downloads, _increment_errors, _log_error
from modules.telegram import send_telegram
from modules.utils import sanitize_filename


def register_download_routes(app: FastAPI) -> None:
    """Registra las rutas de descarga."""

    @app.post("/download-ticket")
    async def download_ticket(
        payload: dict[str, Any],
        request: Request,
        authorization: str | None = Header(default=None),
    ) -> dict[str, Any]:
        """Genera un ticket firmado para descargar audio."""
        require_service_key(authorization)

        if is_maintenance():
            raise HTTPException(
                status_code=503,
                detail=json.dumps(
                    {
                        "maintenance": True,
                        "message": "Servicio en mantenimiento (~5 min), vuelve pronto",
                    }
                ),
            )

        title = str(payload.get("title") or "").strip()
        artist = str(payload.get("artist") or "").strip()
        album = str(payload.get("album") or "").strip()
        format_name = "aac" if payload.get("format") == "aac" else "mp3"
        duration = int(payload.get("duration") or 0)
        video_id_override = str(payload.get("videoId") or "").strip() or None

        if not title or not artist:
            raise HTTPException(
                status_code=400, detail="title and artist are required"
            )

        ip = get_client_ip(request)
        ok, message, retry_after = check_rate_limit(ip)
        if not ok:
            raise HTTPException(status_code=429, detail=message)

        if video_id_override:
            resolved_video_id = video_id_override
        else:
            _cache_key = cache_key(title, artist)
            cached = cache_get(_cache_key)
            if cached:
                resolved_video_id = cached["videoId"]
            else:
                try:
                    results = search_candidates(
                        f"{title} {artist} official audio", limit=8
                    )
                except Exception as exc:
                    raise HTTPException(
                        status_code=502, detail=f"Error buscando video: {exc}"
                    ) from exc
                if not results:
                    raise HTTPException(
                        status_code=404,
                        detail="No se encontró ningún video de YouTube",
                    )
                chosen = max(
                    results,
                    key=lambda c: score_candidate(c, title, artist, album, duration),
                )
                cache_set(_cache_key, chosen["videoId"], chosen)
                resolved_video_id = chosen["videoId"]

        safe_name = sanitize_filename(f"{title} - {artist}.{format_name}")
        token_info = build_token(resolved_video_id, safe_name, format_name)

        service_url = RAILWAY_PUBLIC_DOMAIN
        if service_url and not service_url.startswith("http"):
            service_url = f"https://{service_url}"

        download_url = f"{service_url}/download?token={token_info['token']}"
        return {
            "success": True,
            "fileName": safe_name,
            "expiresAt": token_info["expiresAt"],
            "downloadUrl": download_url,
        }

    @app.get("/download")
    async def download(token: str = Query(...)) -> FileResponse:
        """Descarga audio resolviendo desde un token firmado."""
        payload = verify_token(token)
        video_id = str(payload.get("videoId") or "").strip()
        file_name = str(payload.get("fileName") or "download.mp3")
        format_name = str(payload.get("format") or "mp3").strip().lower()

        if is_maintenance():
            raise HTTPException(
                status_code=503,
                detail=json.dumps(
                    {
                        "maintenance": True,
                        "message": "Servicio en mantenimiento (~5 min), vuelve pronto",
                    }
                ),
            )
        if not video_id:
            raise HTTPException(
                status_code=400,
                detail="Token inválido: falta el identificador de video",
            )
        if not download_slots.acquire(blocking=False):
            raise HTTPException(
                status_code=429,
                detail="Servidor ocupado: demasiadas descargas simultáneas. Inténtalo de nuevo en unos segundos.",
            )

        workdir = Path(tempfile.mkdtemp(prefix="mhl-", dir=str(TEMP_DIR)))
        ytdlp_err_msg = "yt-dlp falló"

        try:
            output: Path | None = None
            ytdlp_ok = False

            def _run_ytdlp(client: str) -> Path | None:
                with YoutubeDL(
                    build_download_options(video_id, format_name, workdir, client)
                ) as ydl:
                    ydl.download([f"https://www.youtube.com/watch?v={video_id}"])
                ext = "m4a" if format_name == "aac" else "mp3"
                return next(workdir.glob(f"audio*.{ext}"), None)

            last_ytdlp_err: Exception | None = None
            updated_once = False
            auth_retry_count = 0
            max_auth_retries = len(_ALL_COOKIES_B64)
            tried_without_cookies = False

            for client in YTDLP_CLIENTS:
                try:
                    output = _run_ytdlp(client)
                    ytdlp_ok = True
                    break
                except Exception as ytdlp_err:
                    last_ytdlp_err = ytdlp_err
                    err_type = classify_ytdlp_error(ytdlp_err)
                    print(
                        f"[ytdlp] client={client} type={err_type} error={str(ytdlp_err)[:80]}",
                        flush=True,
                    )

                    # Auto-update yt-dlp una vez si error de extractor
                    if not updated_once and err_type in (
                        "ytdlp_extractor",
                        "ytdlp_unknown",
                    ):
                        updated_once = True
                        if try_auto_update_ytdlp():
                            try:
                                import importlib
                                import yt_dlp as _yt_mod

                                importlib.reload(_yt_mod)
                                output = _run_ytdlp(client)
                                ytdlp_ok = True
                                break
                            except Exception as retry_err:
                                last_ytdlp_err = retry_err

                    # Retry con cookies rotadas si error de auth
                    if err_type == "ytdlp_auth" and auth_retry_count < max_auth_retries:
                        auth_retry_count += 1
                        prev_idx = get_cookies_index() + 1
                        rotate_cookies()
                        new_idx = get_cookies_index() + 1
                        threading.Thread(
                            target=lambda p=prev_idx, n=new_idx, t=len(_ALL_COOKIES_B64): asyncio.run(
                                send_telegram(
                                    f"🔄 Auth fallido, rotando cookies #{p}→#{n}/{t}"
                                )
                            ),
                            daemon=True,
                        ).start()
                        try:
                            output = _run_ytdlp(client)
                            ytdlp_ok = True
                            break
                        except Exception as retry_err:
                            last_ytdlp_err = retry_err
                            # Continue to next cookie/client

                    # Fallback: Retry sin cookies si persiste error de auth
                    if err_type == "ytdlp_auth" and not tried_without_cookies:
                        tried_without_cookies = True
                        print("[ytdlp] Auth falló con todas las cookies, intentando sin cookies...", flush=True)
                        try:
                            # Rebuild options sin cookies
                            opts_no_cookies = build_download_options(
                                video_id, format_name, workdir, client, use_cookies=False
                            )
                            with YoutubeDL(opts_no_cookies) as ydl:
                                ydl.download([f"https://www.youtube.com/watch?v={video_id}"])
                            ext = "m4a" if format_name == "aac" else "mp3"
                            output = next(workdir.glob(f"audio*.{ext}"), None)
                            if output:
                                ytdlp_ok = True
                                threading.Thread(
                                    target=lambda: asyncio.run(
                                        send_telegram("✅ Descarga exitosa SIN cookies (fallback)")
                                    ),
                                    daemon=True,
                                ).start()
                                break
                        except Exception as no_cookie_err:
                            last_ytdlp_err = no_cookie_err
                            print(f"[ytdlp] También falló sin cookies: {str(no_cookie_err)[:80]}", flush=True)

            if not ytdlp_ok and last_ytdlp_err is not None:
                err_type = classify_ytdlp_error(last_ytdlp_err)
                ytdlp_err_msg = YTDLP_ERROR_LABELS.get(
                    err_type, str(last_ytdlp_err)
                )
                _log_error(f"{err_type}: {str(last_ytdlp_err)[:120]}")
                _increment_errors()
                raise HTTPException(status_code=503, detail=ytdlp_err_msg)

            if output is None:
                output = next(iter(workdir.glob("*")), None)
            if output is None or not output.exists():
                raise HTTPException(
                    status_code=502,
                    detail="No se generó el archivo de audio. El video puede no existir o estar eliminado.",
                )

            _increment_downloads()
            return FileResponse(
                path=output,
                media_type="audio/mpeg"
                if format_name == "mp3"
                else "audio/mp4",
                filename=file_name,
                background=BackgroundTask(cleanup_job, workdir),
            )
        except HTTPException:
            cleanup_job(workdir)
            raise
        except Exception as exc:
            cleanup_job(workdir)
            raise HTTPException(
                status_code=502, detail=f"Error inesperado durante la descarga: {exc}"
            ) from exc
