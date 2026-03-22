import base64
import hashlib
import hmac
import json
import os
import re
import shutil
import subprocess
import tempfile
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from threading import BoundedSemaphore, Lock
from typing import Any

from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
import httpx
from starlette.background import BackgroundTask
from imageio_ffmpeg import get_ffmpeg_exe
from yt_dlp import YoutubeDL


SERVICE_API_KEY = os.getenv("SERVICE_API_KEY", "").strip()
DOWNLOAD_SIGNING_SECRET = os.getenv("DOWNLOAD_SIGNING_SECRET", "").strip()
TOKEN_TTL_SECONDS = int(os.getenv("TOKEN_TTL_SECONDS", "120"))
MAX_CONCURRENT_DOWNLOADS = int(os.getenv("MAX_CONCURRENT_DOWNLOADS", "3"))
TEMP_DIR = Path(os.getenv("TEMP_DIR", "/tmp/ytdlp-service"))
RAPIDAPI_KEY = os.getenv("RAPIDAPI_KEY", "").strip()
YTAPI_KEY = os.getenv("YTAPI_KEY", "").strip()  # yt-api.p.rapidapi.com — ÚLTIMO RECURSO (300 req/mes)

# ── Umbrales para activar el último recurso ──────────────────────────────────
# Se necesitan 100 canciones DISTINTAS fallando de forma CONSECUTIVA.
# Cualquier descarga exitosa reinicia el contador a 0.
YTAPI_MIN_YTDLP_FAILURES = int(os.getenv("YTAPI_MIN_YTDLP_FAILURES", "100"))
YTAPI_MAX_DAILY           = int(os.getenv("YTAPI_MAX_DAILY", "10"))

# Anti-abuso: si se detectan N canciones distintas fallando en menos de M segundos
# se interpreta como intento de forzar el umbral artificialmente.
ABUSE_WINDOW_SECONDS = int(os.getenv("ABUSE_WINDOW_SECONDS", "300"))   # 5 minutos
ABUSE_THRESHOLD      = int(os.getenv("ABUSE_THRESHOLD", "20"))         # 20 únicas en 5 min
ABUSE_COOLDOWN_HOURS = int(os.getenv("ABUSE_COOLDOWN_HOURS", "6"))     # cooldown 6 horas

# ── Estado persistente en disco ──────────────────────────────────────────────
_STATS_FILE = Path(os.getenv("TEMP_DIR", "/tmp/ytdlp-service")) / "ytapi_stats.json"
_stats_lock = Lock()

_EMPTY_STATS: dict = {
    # Fallos consecutivos de canciones únicas (se reinicia en éxito)
    "consecutive_unique_ids": [],    # lista de video_ids fallados en la racha actual
    # Ventana deslizante anti-abuso: lista de timestamps (float unix)
    "abuse_window_ts": [],
    # Cooldown activo: timestamp unix hasta el que está bloqueado (0 = sin cooldown)
    "abuse_cooldown_until": 0.0,
    # Uso diario de yt-api
    "ytapi_date": "",
    "ytapi_used_today": 0,
}


def _load_stats() -> dict:
    try:
        if _STATS_FILE.exists():
            data = json.loads(_STATS_FILE.read_text())
            # Rellenar claves nuevas si el archivo es de versión anterior
            for k, v in _EMPTY_STATS.items():
                data.setdefault(k, v)
            return data
    except Exception:
        pass
    return dict(_EMPTY_STATS)


def _save_stats(stats: dict) -> None:
    try:
        _STATS_FILE.parent.mkdir(parents=True, exist_ok=True)
        _STATS_FILE.write_text(json.dumps(stats))
    except Exception:
        pass


def record_ytdlp_failure(video_id: str) -> None:
    """
    Registra que video_id falló en yt-dlp.
    - Solo cuenta si el video_id es nuevo en la racha actual.
    - Actualiza la ventana anti-abuso.
    - Si se detecta abuso, activa cooldown y reinicia el contador.
    """
    with _stats_lock:
        stats = _load_stats()
        now = datetime.now(timezone.utc).timestamp()

        # ── Ventana anti-abuso (últimos ABUSE_WINDOW_SECONDS) ─────────────
        window_start = now - ABUSE_WINDOW_SECONDS
        recent = [t for t in stats["abuse_window_ts"] if t >= window_start]

        # Contar IDs únicos recientes en la ventana
        # (Para esto necesitaríamos guardar (ts, id) pero simplificamos:
        #  si hay demasiados fallos en poco tiempo es abuso independientemente del ID)
        recent.append(now)
        stats["abuse_window_ts"] = recent

        if len(recent) >= ABUSE_THRESHOLD:
            # Abuso detectado: activar cooldown y REINICIAR contador
            cooldown_until = now + ABUSE_COOLDOWN_HOURS * 3600
            stats["abuse_cooldown_until"] = cooldown_until
            stats["consecutive_unique_ids"] = []
            stats["abuse_window_ts"] = []
            _save_stats(stats)
            return  # No contar este fallo

        # ── Contador de fallos consecutivos únicos ─────────────────────────
        unique_ids: list = stats["consecutive_unique_ids"]
        if video_id not in unique_ids:
            unique_ids.append(video_id)
            stats["consecutive_unique_ids"] = unique_ids

        _save_stats(stats)


def record_ytdlp_success() -> None:
    """Cualquier descarga exitosa reinicia el contador de fallos consecutivos."""
    with _stats_lock:
        stats = _load_stats()
        stats["consecutive_unique_ids"] = []
        _save_stats(stats)


def can_use_ytapi() -> tuple[bool, str]:
    """
    Devuelve (permitido, motivo).
    Condiciones:
      1. YTAPI_KEY configurada
      2. Sin cooldown de abuso activo
      3. >= 100 canciones DISTINTAS fallando de forma CONSECUTIVA (sin éxito entre medias)
      4. Usos de yt-api hoy < YTAPI_MAX_DAILY
    """
    if not YTAPI_KEY:
        return False, "YTAPI_KEY no configurada"

    with _stats_lock:
        stats = _load_stats()
        now = datetime.now(timezone.utc).timestamp()

        # Comprobar cooldown de abuso
        cooldown_until = stats.get("abuse_cooldown_until", 0.0)
        if cooldown_until > now:
            remaining_h = (cooldown_until - now) / 3600
            return False, f"Cooldown por abuso activo — se libera en {remaining_h:.1f}h"

        unique_failures = len(stats.get("consecutive_unique_ids", []))
        if unique_failures < YTAPI_MIN_YTDLP_FAILURES:
            remaining = YTAPI_MIN_YTDLP_FAILURES - unique_failures
            return False, (
                f"yt-dlp lleva {unique_failures} canciones únicas fallando consecutivamente "
                f"— faltan {remaining} para activar yt-api"
            )

        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        if stats.get("ytapi_date") != today:
            stats["ytapi_date"] = today
            stats["ytapi_used_today"] = 0
            _save_stats(stats)

        used_today = stats.get("ytapi_used_today", 0)
        if used_today >= YTAPI_MAX_DAILY:
            return False, f"Límite diario de yt-api alcanzado ({used_today}/{YTAPI_MAX_DAILY})"

        return True, (
            f"yt-api disponible ({used_today}/{YTAPI_MAX_DAILY} hoy, "
            f"{unique_failures} únicas fallando consecutivamente)"
        )


def record_ytapi_use() -> None:
    """Registra un uso exitoso de yt-api."""
    with _stats_lock:
        stats = _load_stats()
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        if stats.get("ytapi_date") != today:
            stats["ytapi_date"] = today
            stats["ytapi_used_today"] = 0
        stats["ytapi_used_today"] = stats.get("ytapi_used_today", 0) + 1
        _save_stats(stats)
YOUTUBE_COOKIES = os.getenv("YOUTUBE_COOKIES", "")
YOUTUBE_COOKIES_B64 = os.getenv("YOUTUBE_COOKIES_B64", "").strip()
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("ALLOWED_ORIGINS", "*").split(",")
    if origin.strip()
]

download_slots = BoundedSemaphore(value=max(1, MAX_CONCURRENT_DOWNLOADS))


def utc_now_ts() -> int:
    return int(datetime.now(timezone.utc).timestamp())


def sanitize_filename(value: str) -> str:
    cleaned = re.sub(r'[\\/:*?"<>|]+', "", value).strip()
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned[:140] or "download"


def b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def b64url_decode(raw: str) -> bytes:
    padding = "=" * (-len(raw) % 4)
    return base64.urlsafe_b64decode(raw + padding)


def require_service_key(authorization: str | None) -> None:
    if not SERVICE_API_KEY:
        raise HTTPException(status_code=500, detail="SERVICE_API_KEY not configured")
    if authorization != f"Bearer {SERVICE_API_KEY}":
        raise HTTPException(status_code=401, detail="Unauthorized")


def sign_payload(payload: dict[str, Any]) -> str:
    body = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    signature = hmac.new(
        DOWNLOAD_SIGNING_SECRET.encode("utf-8"),
        body,
        hashlib.sha256,
    ).digest()
    return f"{b64url_encode(body)}.{b64url_encode(signature)}"


def verify_token(token: str) -> dict[str, Any]:
    if not DOWNLOAD_SIGNING_SECRET:
        raise HTTPException(status_code=500, detail="DOWNLOAD_SIGNING_SECRET not configured")
    try:
        encoded_body, encoded_sig = token.split(".", 1)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Malformed token") from exc

    body = b64url_decode(encoded_body)
    provided_sig = b64url_decode(encoded_sig)
    expected_sig = hmac.new(
        DOWNLOAD_SIGNING_SECRET.encode("utf-8"),
        body,
        hashlib.sha256,
    ).digest()
    if not hmac.compare_digest(provided_sig, expected_sig):
        raise HTTPException(status_code=401, detail="Invalid token")

    payload = json.loads(body.decode("utf-8"))
    expires_at = int(payload.get("expiresAt", 0))
    if expires_at <= utc_now_ts():
        raise HTTPException(status_code=401, detail="Expired token")
    return payload


def search_candidates(query: str, limit: int = 5) -> list[dict[str, Any]]:
    opts = {
        "quiet": True,
        "skip_download": True,
        "extract_flat": True,
        "noplaylist": True,
    }
    with YoutubeDL(opts) as ydl:
        info = ydl.extract_info(f"ytsearch{limit}:{query}", download=False)

    results: list[dict[str, Any]] = []
    for entry in info.get("entries") or []:
        if not entry:
            continue
        video_id = entry.get("id")
        title = entry.get("title") or ""
        if not video_id or not title:
            continue
        results.append(
            {
                "videoId": video_id,
                "title": title,
                "duration": int(entry.get("duration") or 0),
                "channel": entry.get("channel") or entry.get("uploader") or "",
                "webpageUrl": entry.get("url") or f"https://www.youtube.com/watch?v={video_id}",
            }
        )
    return results


def score_candidate(
    candidate: dict[str, Any],
    target_title: str,
    target_artist: str,
    target_album: str = "",
) -> int:
    title = candidate.get("title", "").lower()
    channel = candidate.get("channel", "").lower()
    wanted_title = target_title.lower()
    wanted_artist = target_artist.lower()
    wanted_album = target_album.lower()

    score = 0

    # --- Coincidencias básicas ---
    if wanted_title and wanted_title in title:
        score += 30
    if wanted_artist and wanted_artist in title:
        score += 20
    if wanted_artist and wanted_artist in channel:
        score += 18
    if wanted_album and wanted_album in title:
        score += 8  # Álbum correcto ayuda a desambiguar

    # --- Bonus: versiones de audio limpio ---
    if "official audio" in title:
        score += 25
    if "audio only" in title:
        score += 20
    if "radio edit" in title or "radio version" in title:
        score += 18
    if "topic" in channel:
        score += 12  # Canal oficial de YouTube Music
    if "lyrics" in title:
        score += 5

    # --- PENALIZACIONES: music videos y clips ---
    MV_KEYWORDS = [
        "music video", "official video", "official music video",
        "mv", "videoclip", "video clip", "official clip",
        "video oficial",
    ]
    for kw in MV_KEYWORDS:
        if kw in title:
            score -= 25
            break  # Una penalización por candidato

    # --- PENALIZACIONES: contenido no deseado ---
    if "karaoke" in title:
        score -= 30
    if "reaction" in title:
        score -= 15
    if "cover" in title and wanted_artist not in channel:
        score -= 12  # Cover de otro artista
    if "live" in title or "en vivo" in title or "concert" in title:
        score -= 10
    if "remix" in title and "official" not in title:
        score -= 8
    if "instrumental" in title:
        score -= 8
    if "extended" in title or "extended mix" in title:
        score -= 5

    # --- Duración: 90-600 segundos (1:30-10 min) ---
    duration = int(candidate.get("duration") or 0)
    if 90 <= duration <= 600:
        score += 10

    return score


def build_token(video_id: str, file_name: str, format_name: str) -> dict[str, Any]:
    expires_at = utc_now_ts() + TOKEN_TTL_SECONDS
    payload = {
        "videoId": video_id,
        "fileName": file_name,
        "format": format_name,
        "expiresAt": expires_at,
    }
    return {
        "token": sign_payload(payload),
        "expiresAt": datetime.fromtimestamp(expires_at, tz=timezone.utc).isoformat(),
    }


def build_download_options(video_id: str, format_name: str, workdir: Path) -> dict[str, Any]:
    ext = "m4a" if format_name == "aac" else "mp3"
    try:
        ffmpeg_location = get_ffmpeg_exe()
    except Exception:
        ffmpeg_location = None

    cookies_path = None
    if YOUTUBE_COOKIES_B64:
        cookies_path = workdir / "youtube-cookies.txt"
        cookies_path.write_bytes(base64.b64decode(YOUTUBE_COOKIES_B64))
    elif YOUTUBE_COOKIES.strip():
        cookies_path = workdir / "youtube-cookies.txt"
        cookies_path.write_text(YOUTUBE_COOKIES, encoding="utf-8")

    return {
        "quiet": True,
        "noplaylist": True,
        "restrictfilenames": True,
        "paths": {"home": str(workdir)},
        "outtmpl": {"default": "audio.%(ext)s"},
        "format": "bestaudio/best",
        "postprocessors": [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": ext,
                "preferredquality": "192",
            }
        ],
        "postprocessor_args": ["-vn"],
        **({"cookiefile": str(cookies_path)} if cookies_path else {}),
        **({"ffmpeg_location": ffmpeg_location} if ffmpeg_location else {}),
    }


def get_rapidapi_audio_url(video_id: str) -> str | None:
    if not RAPIDAPI_KEY:
        return None

    endpoints = [
        (
            "youtube-search-and-download.p.rapidapi.com",
            f"https://youtube-search-and-download.p.rapidapi.com/video/download?id={video_id}",
        ),
        (
            "youtube-mp36.p.rapidapi.com",
            f"https://youtube-mp36.p.rapidapi.com/dl?id={video_id}",
        ),
    ]

    for host, url in endpoints:
        try:
            response = httpx.get(
                url,
                headers={
                    "x-rapidapi-key": RAPIDAPI_KEY,
                    "x-rapidapi-host": host,
                },
                timeout=30,
            )
            response.raise_for_status()
            payload = response.json()

            if isinstance(payload.get("link"), str) and payload["link"].startswith("http"):
                return payload["link"]

            medias = payload.get("medias") or []
            audios = [m for m in medias if m.get("type") == "audio" and isinstance(m.get("url"), str)]
            if audios:
                audios.sort(key=lambda item: int(item.get("label") or 0), reverse=True)
                return audios[0]["url"]
        except Exception:
            continue

    return None


def convert_audio(source_path: Path, target_path: Path, format_name: str) -> None:
    ffmpeg_bin = get_ffmpeg_exe()
    codec_args = ["-c:a", "libmp3lame", "-b:a", "192k"] if format_name == "mp3" else ["-c:a", "aac", "-b:a", "192k"]
    cmd = [
        ffmpeg_bin,
        "-y",
        "-i",
        str(source_path),
        "-vn",
        *codec_args,
        str(target_path),
    ]
    subprocess.run(cmd, check=True, capture_output=True)


def download_via_rapidapi(video_id: str, format_name: str, workdir: Path) -> Path:
    audio_url = get_rapidapi_audio_url(video_id)
    if not audio_url:
        raise RuntimeError("RapidAPI audio URL not available")

    source_path = workdir / "rapid-source"
    with httpx.stream("GET", audio_url, follow_redirects=True, timeout=60) as response:
        response.raise_for_status()
        with source_path.open("wb") as handle:
            for chunk in response.iter_bytes():
                handle.write(chunk)

    target_ext = "m4a" if format_name == "aac" else "mp3"
    target_path = workdir / f"audio.{target_ext}"
    convert_audio(source_path, target_path, format_name)
    return target_path


def download_via_ytapi(video_id: str, format_name: str, workdir: Path) -> Path:
    """
    ÚLTIMO RECURSO — yt-api.p.rapidapi.com
    Solo llamar cuando yt-dlp Y RapidAPI han fallado completamente.
    Límite: 300 req/mes. No usar para errores leves.
    """
    if not YTAPI_KEY:
        raise RuntimeError("YTAPI_KEY no configurada — último recurso no disponible")

    response = httpx.get(
        f"https://yt-api.p.rapidapi.com/dl?id={video_id}&cgeo=DE",
        headers={
            "x-rapidapi-key": YTAPI_KEY,
            "x-rapidapi-host": "yt-api.p.rapidapi.com",
        },
        timeout=30,
    )
    response.raise_for_status()
    payload = response.json()

    audio_url: str | None = None

    # Formato principal: {"link": "https://..."}
    if isinstance(payload.get("link"), str) and payload["link"].startswith("http"):
        audio_url = payload["link"]

    # Formato alternativo: {"formats": [{"url": "...", "mimeType": "audio/..."}]}
    if not audio_url:
        formats = payload.get("formats") or []
        audio_formats = [f for f in formats if "audio" in str(f.get("mimeType", "")) and f.get("url")]
        if audio_formats:
            audio_url = audio_formats[0]["url"]

    if not audio_url:
        raise RuntimeError(f"yt-api no devolvió URL de audio. Respuesta: {list(payload.keys())}")

    source_path = workdir / "ytapi-source"
    with httpx.stream("GET", audio_url, follow_redirects=True, timeout=60) as r:
        r.raise_for_status()
        with source_path.open("wb") as handle:
            for chunk in r.iter_bytes():
                handle.write(chunk)

    target_ext = "m4a" if format_name == "aac" else "mp3"
    target_path = workdir / f"audio.{target_ext}"
    convert_audio(source_path, target_path, format_name)
    return target_path


def cleanup_job(workdir: Path) -> None:
    shutil.rmtree(workdir, ignore_errors=True)
    download_slots.release()


@asynccontextmanager
async def lifespan(_: FastAPI):
    TEMP_DIR.mkdir(parents=True, exist_ok=True)
    yield


app = FastAPI(title="MHL ytdlp service", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS or ["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition", "Content-Length", "Content-Type"],
)


@app.get("/health")
async def health() -> dict[str, Any]:
    return {"ok": True, "service": "ytdlp-service"}


@app.get("/ytapi-stats")
async def ytapi_stats(x_api_key: str = Header(default="")) -> dict[str, Any]:
    if SERVICE_API_KEY and x_api_key != SERVICE_API_KEY:
        raise HTTPException(status_code=401, detail="Unauthorized")
    stats = _load_stats()
    allowed, reason = can_use_ytapi()
    now = datetime.now(timezone.utc)
    today = now.strftime("%Y-%m-%d")
    if stats.get("ytapi_date") != today:
        stats["ytapi_used_today"] = 0
    unique_failures = len(stats.get("consecutive_unique_ids", []))
    cooldown_until = stats.get("abuse_cooldown_until", 0.0)
    return {
        "consecutive_unique_failures": unique_failures,
        "failures_needed_to_unlock": YTAPI_MIN_YTDLP_FAILURES,
        "ytapi_unlocked": unique_failures >= YTAPI_MIN_YTDLP_FAILURES,
        "ytapi_used_today": stats.get("ytapi_used_today", 0),
        "ytapi_max_daily": YTAPI_MAX_DAILY,
        "ytapi_available": allowed,
        "abuse_cooldown_active": cooldown_until > now.timestamp(),
        "abuse_cooldown_until": datetime.fromtimestamp(cooldown_until, tz=timezone.utc).isoformat() if cooldown_until > 0 else None,
        "status": reason,
    }


@app.get("/search")
async def search(
    q: str = Query(..., min_length=2),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    require_service_key(authorization)
    try:
        results = search_candidates(q, limit=5)
        return {"success": True, "results": results}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Search failed: {exc}") from exc


@app.post("/resolve")
async def resolve(
    payload: dict[str, Any],
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    require_service_key(authorization)

    title = str(payload.get("title") or "").strip()
    artist = str(payload.get("artist") or "").strip()
    album = str(payload.get("album") or "").strip()
    format_name = str(payload.get("format") or "mp3").strip().lower()

    if not title or not artist:
        raise HTTPException(status_code=400, detail="title and artist are required")
    if format_name not in {"mp3", "aac"}:
        raise HTTPException(status_code=400, detail="format must be mp3 or aac")

    try:
        candidates = search_candidates(f"{title} {artist} official audio", limit=8)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Resolve failed: {exc}") from exc

    if not candidates:
        raise HTTPException(status_code=404, detail="No YouTube candidates found")

    chosen = max(candidates, key=lambda item: score_candidate(item, title, artist, album))
    safe_name = sanitize_filename(f"{title} - {artist}.{format_name}")
    token_info = build_token(chosen["videoId"], safe_name, format_name)
    return {
        "success": True,
        "videoId": chosen["videoId"],
        "title": chosen["title"],
        "duration": chosen.get("duration") or 0,
        "format": format_name,
        "fileName": safe_name,
        **token_info,
    }


@app.get("/download")
async def download(token: str = Query(...)) -> FileResponse:
    payload = verify_token(token)
    video_id = str(payload.get("videoId") or "").strip()
    file_name = str(payload.get("fileName") or "download.mp3")
    format_name = str(payload.get("format") or "mp3").strip().lower()

    if not video_id:
        raise HTTPException(status_code=400, detail="Token missing videoId")
    if not download_slots.acquire(blocking=False):
        raise HTTPException(status_code=429, detail="Too many concurrent downloads")

    workdir = Path(tempfile.mkdtemp(prefix="mhl-", dir=str(TEMP_DIR)))
    try:
        output: Path | None = None
        try:
            with YoutubeDL(build_download_options(video_id, format_name, workdir)) as ydl:
                ydl.download([f"https://www.youtube.com/watch?v={video_id}"])
            expected_ext = "m4a" if format_name == "aac" else "mp3"
            output = next(workdir.glob(f"audio*.{expected_ext}"), None)
        except Exception as ytdlp_err:
            # yt-dlp murió completamente — registrar fallo único consecutivo
            record_ytdlp_failure(video_id)

            try:
                output = download_via_rapidapi(video_id, format_name, workdir)
            except Exception as rapid_err:
                # RapidAPI también falló — comprobar si yt-api está desbloqueada
                allowed, reason = can_use_ytapi()
                if not allowed:
                    raise RuntimeError(
                        f"yt-dlp falló y yt-api no disponible ({reason}). "
                        f"yt-dlp: {ytdlp_err} | rapidapi: {rapid_err}"
                    ) from rapid_err

                try:
                    output = download_via_ytapi(video_id, format_name, workdir)
                    record_ytapi_use()
                except Exception as ytapi_err:
                    raise RuntimeError(
                        f"Todos los métodos fallaron. "
                        f"yt-dlp: {ytdlp_err} | rapidapi: {rapid_err} | ytapi: {ytapi_err}"
                    ) from ytapi_err
        else:
            # yt-dlp tuvo éxito — reiniciar contador de fallos consecutivos
            record_ytdlp_success()

        if output is None:
            output = next(iter(workdir.glob("*")), None)
        if output is None or not output.exists():
            cleanup_job(workdir)
            raise HTTPException(status_code=502, detail="No output file generated")

        return FileResponse(
            path=output,
            media_type="audio/mpeg" if format_name == "mp3" else "audio/mp4",
            filename=file_name,
            background=BackgroundTask(cleanup_job, workdir),
        )
    except HTTPException:
        raise
    except Exception as exc:
        cleanup_job(workdir)
        raise HTTPException(status_code=502, detail=f"Download failed: {exc}") from exc


@app.exception_handler(HTTPException)
async def http_error_handler(_, exc: HTTPException) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"success": False, "error": exc.detail})
