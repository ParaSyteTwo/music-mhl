import asyncio
import shutil
import subprocess
import threading
from datetime import datetime, timezone
from pathlib import Path
from threading import BoundedSemaphore, Lock
from typing import Any

from config import (
    MAX_CONCURRENT_DOWNLOADS,
    TEMP_DIR,
    YOUTUBE_COOKIES,
    YTDLP_CLIENTS,
    YTDLP_UPDATE_COOLDOWN,
)
from imageio_ffmpeg import get_ffmpeg_exe
from yt_dlp import YoutubeDL

from .cookies import get_active_cookies_b64
from .telegram import send_telegram

download_slots = BoundedSemaphore(value=max(1, MAX_CONCURRENT_DOWNLOADS))

_ytdlp_update_lock = Lock()
_ytdlp_last_update_ts: float = 0.0


def ytdlp_version_info() -> dict[str, Any]:
    """Devuelve versión de yt-dlp y días desde su fecha de release."""
    try:
        result = subprocess.run(
            ["yt-dlp", "--version"], capture_output=True, text=True, timeout=10
        )
        version = result.stdout.strip()  # formato: YYYY.MM.DD
        parts = version.split(".")
        if len(parts) == 3:
            release_date = datetime(
                int(parts[0]), int(parts[1]), int(parts[2]), tzinfo=timezone.utc
            )
            age_days = (datetime.now(timezone.utc) - release_date).days
        else:
            age_days = -1
        return {"version": version, "age_days": age_days}
    except Exception:
        return {"version": "unknown", "age_days": -1}


def build_download_options(
    video_id: str, format_name: str, workdir: Path, client: str = "android_music"
) -> dict[str, Any]:
    """Construye opciones para yt-dlp con cookies y configuración de FFmpeg."""
    ext = "m4a" if format_name == "aac" else "mp3"
    ffmpeg_location = shutil.which("ffmpeg") or get_ffmpeg_exe()

    cookies_path = None
    active_b64 = get_active_cookies_b64()
    if active_b64:
        from .cookies import _decode_cookies_to_file

        cookies_path = workdir / "youtube-cookies.txt"
        _decode_cookies_to_file(active_b64, cookies_path)
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
        "extractor_args": {"youtube": {"player_client": [client]}},
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


def classify_ytdlp_error(err: Exception) -> str:
    """Clasifica el error de yt-dlp para dar mensajes claros y decidir si auto-actualizar."""
    msg = str(err).lower()
    if any(
        k in msg
        for k in (
            "sign in",
            "confirm your age",
            "login required",
            "private video",
            "members-only",
        )
    ):
        return "ytdlp_auth"
    if any(
        k in msg
        for k in (
            "http error 403",
            "403 forbidden",
            "video unavailable",
            "this video is not available",
            "has been removed",
        )
    ):
        return "ytdlp_blocked"
    if any(
        k in msg
        for k in (
            "unable to extract",
            "unsupported url",
            "no video formats found",
            "requested format",
            "could not find",
        )
    ):
        return "ytdlp_extractor"
    if any(
        k in msg
        for k in (
            "timed out",
            "timeout",
            "connectionerror",
            "network",
            "read error",
            "ssl",
            "connection reset",
        )
    ):
        return "ytdlp_network"
    return "ytdlp_unknown"


YTDLP_ERROR_LABELS: dict[str, str] = {
    "ytdlp_auth": "El video requiere autenticación (privado, restringido por edad o solo para miembros)",
    "ytdlp_blocked": "YouTube bloqueó la descarga — posible detección de bot o IP de datacenter",
    "ytdlp_extractor": "yt-dlp no pudo extraer el audio — versión posiblemente desactualizada (actualización automática iniciada)",
    "ytdlp_network": "Error de red al conectar con YouTube — reintenta en unos segundos",
    "ytdlp_unknown": "yt-dlp falló con un error inesperado",
}


def try_auto_update_ytdlp() -> bool:
    """
    Intenta actualizar yt-dlp vía pip. Máximo una vez por hora.
    Retorna True si la actualización se ejecutó sin errores.
    """
    global _ytdlp_last_update_ts
    with _ytdlp_update_lock:
        now = datetime.now(timezone.utc).timestamp()
        if now - _ytdlp_last_update_ts < YTDLP_UPDATE_COOLDOWN:
            return False
        _ytdlp_last_update_ts = now

    try:
        result = subprocess.run(
            ["pip", "install", "--upgrade", "--quiet", "yt-dlp"],
            capture_output=True,
            text=True,
            timeout=120,
        )
        ok = result.returncode == 0
        if ok:
            info = ytdlp_version_info()
            threading.Thread(
                target=lambda: asyncio.run(
                    send_telegram(f"⬆️ yt-dlp actualizado automáticamente a <b>{info['version']}</b>")
                ),
                daemon=True,
            ).start()
        return ok
    except Exception:
        return False


def convert_audio(source_path: Path, target_path: Path, format_name: str) -> None:
    """Convierte audio usando FFmpeg a mp3 o aac."""
    ffmpeg_bin = shutil.which("ffmpeg") or get_ffmpeg_exe()
    codec_args = (
        ["-c:a", "libmp3lame", "-b:a", "192k"]
        if format_name == "mp3"
        else ["-c:a", "aac", "-b:a", "192k"]
    )
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


def cleanup_job(workdir: Path) -> None:
    """Limpia directorio temporal y libera slot de descarga."""
    shutil.rmtree(workdir, ignore_errors=True)
    download_slots.release()
