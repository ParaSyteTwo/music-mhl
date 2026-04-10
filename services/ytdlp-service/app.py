import base64
import collections
import hashlib
import hmac
import asyncio
import json
import os
import re
import shutil
import subprocess
import tempfile
import threading
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from threading import BoundedSemaphore, Lock
from typing import Any

from fastapi import FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from starlette.background import BackgroundTask
from imageio_ffmpeg import get_ffmpeg_exe
from yt_dlp import YoutubeDL


SERVICE_API_KEY = os.getenv("SERVICE_API_KEY", "").strip()
DOWNLOAD_SIGNING_SECRET = os.getenv("DOWNLOAD_SIGNING_SECRET", "").strip()
TOKEN_TTL_SECONDS = int(os.getenv("TOKEN_TTL_SECONDS", "120"))
MAX_CONCURRENT_DOWNLOADS = int(os.getenv("MAX_CONCURRENT_DOWNLOADS", "3"))
RATE_LIMIT_BURST = int(os.getenv("RATE_LIMIT_BURST", "8"))
RATE_LIMIT_WINDOW_SECONDS = int(os.getenv("RATE_LIMIT_WINDOW_SECONDS", "60"))
RATE_LIMIT_DAILY = int(os.getenv("RATE_LIMIT_DAILY", "250"))
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "").strip()

# ── Rate limit store ──────────────────────────────────────────────────────────
_rate_store: dict[str, dict] = {}
_rate_store_lock = Lock()
TEMP_DIR = Path(os.getenv("TEMP_DIR", "/tmp/ytdlp-service"))
YOUTUBE_COOKIES = os.getenv("YOUTUBE_COOKIES", "")
_ALL_COOKIES_B64 = [
    v for v in [
        os.getenv("YOUTUBE_COOKIES_B64", "").strip(),
        os.getenv("YOUTUBE_COOKIES_B64_2", "").strip(),
        os.getenv("YOUTUBE_COOKIES_B64_3", "").strip(),
    ] if v
]
YOUTUBE_COOKIES_B64 = _ALL_COOKIES_B64[0] if _ALL_COOKIES_B64 else ""
_cookies_index = 0
_cookies_lock = Lock()
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("ALLOWED_ORIGINS", "*").split(",")
    if origin.strip()
]

download_slots = BoundedSemaphore(value=max(1, MAX_CONCURRENT_DOWNLOADS))

_ytdlp_update_lock = Lock()
_ytdlp_last_update_ts: float = 0.0
_YTDLP_UPDATE_COOLDOWN = 3600  # máximo un intento de actualización por hora
_MAX_COOKIE_SLOTS = 4
_COOKIE_CHECK_INTERVAL = 6 * 3600  # chequeo completo cada 6 horas

# ── Modo mantenimiento ───────────────────────────────────────────────────────
_maintenance_lock = Lock()
_maintenance_mode = False
_maintenance_until: float = 0.0


def _set_maintenance(active: bool, minutes: int = 5) -> None:
    global _maintenance_mode, _maintenance_until
    with _maintenance_lock:
        _maintenance_mode = active
        _maintenance_until = (
            datetime.now(timezone.utc).timestamp() + minutes * 60
        ) if active else 0.0


def _is_maintenance() -> bool:
    global _maintenance_mode
    with _maintenance_lock:
        if not _maintenance_mode:
            return False
        if datetime.now(timezone.utc).timestamp() > _maintenance_until:
            _maintenance_mode = False
            return False
        return True


# ── Estadísticas de descargas ────────────────────────────────────────────────
_stats_lock = Lock()
_stats: dict[str, Any] = {"total": 0, "today": 0, "day_key": "", "errors": 0}

# ── Buffer de logs de error recientes ───────────────────────────────────────
_error_log: collections.deque[str] = collections.deque(maxlen=20)
_error_log_lock = Lock()


def _log_error(msg: str) -> None:
    ts = datetime.now(timezone.utc).strftime("%H:%M:%S")
    with _error_log_lock:
        _error_log.append(f"[{ts}] {msg}")


def _increment_downloads() -> None:
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    with _stats_lock:
        if _stats["day_key"] != today:
            _stats["today"] = 0
            _stats["day_key"] = today
        _stats["total"] += 1
        _stats["today"] += 1


def _increment_errors() -> None:
    with _stats_lock:
        _stats["errors"] += 1

# ── Caché de video IDs resueltos ─────────────────────────────────────────────
# Clave: "título normalizado|artista normalizado"
# Valor: {"videoId": str, "ts": float}
_RESOLVE_CACHE_MAX = 100_000
_RESOLVE_CACHE_TTL = 86400  # 24 horas en segundos
_resolve_cache: collections.OrderedDict[str, dict[str, Any]] = collections.OrderedDict()
_resolve_cache_lock = Lock()

# ── Clientes de YouTube en orden de preferencia ───────────────────────────────
# android_music: no requiere PO Token, menos bloqueado en datacenters
# ios: cliente alternativo con rate limits independientes
# android: cliente genérico de Android
# web: último recurso, requiere PO Token en datacenters
_YTDLP_CLIENTS = ["android_music", "ios", "android", "web"]


def utc_now_ts() -> int:
    return int(datetime.now(timezone.utc).timestamp())


def sanitize_filename(value: str) -> str:
    cleaned = re.sub(r'[\\/:*?"<>|]+', "", value).strip()
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned[:140] or "download"


def b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _get_active_cookies_b64() -> str:
    """Devuelve el set de cookies activo según el índice actual."""
    if not _ALL_COOKIES_B64:
        return ""
    with _cookies_lock:
        return _ALL_COOKIES_B64[_cookies_index % len(_ALL_COOKIES_B64)]


def _rotate_cookies() -> None:
    """Rota al siguiente set de cookies disponible."""
    global _cookies_index
    if len(_ALL_COOKIES_B64) <= 1:
        return
    with _cookies_lock:
        _cookies_index = (_cookies_index + 1) % len(_ALL_COOKIES_B64)
        print(f"[cookies] Rotando a cookies #{_cookies_index + 1}/{len(_ALL_COOKIES_B64)}", flush=True)


def _test_single_cookie(b64: str) -> bool:
    """Testa un set de cookies haciendo una petición silenciosa a YouTube."""
    try:
        with tempfile.TemporaryDirectory() as tmp:
            cookies_path = Path(tmp) / "cookies.txt"
            _decode_cookies_to_file(b64, cookies_path)
            result = subprocess.run(
                [
                    "yt-dlp", "--cookies", str(cookies_path),
                    "--skip-download", "--quiet", "--no-warnings",
                    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                ],
                capture_output=True,
                timeout=30,
            )
            return result.returncode == 0
    except Exception:
        return False


def _check_all_cookies() -> dict[str, int]:
    """
    Testa todos los slots en paralelo.
    Elimina los que fallan y ajusta el índice activo.
    Retorna informe {total, ok, removed}.
    """
    global _cookies_index
    with _cookies_lock:
        slots = list(enumerate(_ALL_COOKIES_B64))

    if not slots:
        return {"total": 0, "ok": 0, "removed": 0}

    # Testar en paralelo usando threads
    results: list[tuple[int, bool]] = []
    threads = []

    def _test(idx: int, b64: str) -> None:
        ok = _test_single_cookie(b64)
        results.append((idx, ok))
        print(f"[cookie-check] slot #{idx + 1} ok={ok}", flush=True)

    for i, b64 in slots:
        t = threading.Thread(target=_test, args=(i, b64), daemon=True)
        threads.append(t)
        t.start()
    for t in threads:
        t.join(timeout=40)

    bad_indices = {i for i, ok in results if not ok}

    if bad_indices:
        with _cookies_lock:
            # Eliminar en orden inverso para no alterar índices
            for i in sorted(bad_indices, reverse=True):
                if i < len(_ALL_COOKIES_B64):
                    _ALL_COOKIES_B64.pop(i)
            _cookies_index = _cookies_index % max(1, len(_ALL_COOKIES_B64))

    return {
        "total": len(slots),
        "ok": len(slots) - len(bad_indices),
        "removed": len(bad_indices),
    }


def _add_cookie_smart(b64: str) -> dict[str, Any]:
    """
    Añade una cookie de forma inteligente:
    - Si hay slots rotos → reemplaza el primero roto
    - Si todos OK y hay espacio (< _MAX_COOKIE_SLOTS) → añade nuevo slot
    - Si todos OK y slots llenos → reemplaza el más antiguo (índice 0)
    Retorna informe con la acción tomada.
    """
    global _cookies_index
    with _cookies_lock:
        slots = list(enumerate(_ALL_COOKIES_B64))

    if not slots:
        with _cookies_lock:
            _ALL_COOKIES_B64.append(b64)
        return {"action": "added", "slot": 1, "total": 1}

    # Testar todos en paralelo
    results: list[tuple[int, bool]] = []
    threads = []

    def _test(idx: int, b64_slot: str) -> None:
        ok = _test_single_cookie(b64_slot)
        results.append((idx, ok))

    for i, b64_slot in slots:
        t = threading.Thread(target=_test, args=(i, b64_slot), daemon=True)
        threads.append(t)
        t.start()
    for t in threads:
        t.join(timeout=40)

    bad = [i for i, ok in sorted(results) if not ok]
    total_ok = len(slots) - len(bad)

    with _cookies_lock:
        if bad:
            # Reemplazar primer slot roto
            target = bad[0]
            _ALL_COOKIES_B64[target] = b64
            _cookies_index = target
            action = "replaced_broken"
            slot = target + 1
        elif len(_ALL_COOKIES_B64) < _MAX_COOKIE_SLOTS:
            # Añadir nuevo slot
            _ALL_COOKIES_B64.append(b64)
            slot = len(_ALL_COOKIES_B64)
            _cookies_index = slot - 1
            action = "added"
        else:
            # Slots llenos y todos OK → reemplazar el slot activo actual
            target = _cookies_index % len(_ALL_COOKIES_B64)
            _ALL_COOKIES_B64[target] = b64
            slot = target + 1
            action = "replaced_active"

    return {
        "action": action,
        "slot": slot,
        "total": len(_ALL_COOKIES_B64),
        "previously_ok": total_ok,
        "previously_broken": len(bad),
    }


def _cookie_checker_loop() -> None:
    """Thread de fondo que chequea todas las cookies cada 6 horas."""
    import time as _time
    _time.sleep(60)  # esperar arranque completo
    while True:
        _time.sleep(_COOKIE_CHECK_INTERVAL)
        if not _ALL_COOKIES_B64:
            continue
        print("[cookie-check] Iniciando chequeo periódico...", flush=True)
        report = _check_all_cookies()
        total, ok, removed = report["total"], report["ok"], report["removed"]
        bar = "🟢" * ok + "❌" * removed
        msg = f"🍪 Chequeo periódico de cookies\n{bar}\n✅ {ok}/{total} activas"
        if removed:
            msg += f"\n❌ {removed} eliminadas por inválidas"
            if ok == 0:
                msg += "\n\n⚠️ ¡Sin cookies válidas! Usa /login para renovarlas."
        threading.Thread(target=lambda m=msg: asyncio.run(_send_telegram(m)), daemon=True).start()


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
        raise HTTPException(
            status_code=500, detail="DOWNLOAD_SIGNING_SECRET not configured"
        )
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
                "webpageUrl": entry.get("url")
                or f"https://www.youtube.com/watch?v={video_id}",
            }
        )
    return results


def normalize_search_term(value: str) -> str:
    cleaned = value.lower()
    cleaned = re.sub(r"\([^)]*\)", " ", cleaned)
    cleaned = re.sub(r"\[[^\]]*\]", " ", cleaned)
    cleaned = re.sub(r"\b(feat|ft|featuring)\.?\s+[^,;\-]+", " ", cleaned)
    cleaned = re.sub(
        r"\b(remaster(?:ed)?|radio edit|radio version|version|ost|soundtrack)\b",
        " ",
        cleaned,
    )
    cleaned = re.sub(r"[^\w\s]", " ", cleaned, flags=re.UNICODE)
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned.strip()


def looks_anime_like(title: str, artist: str, album: str = "") -> bool:
    source = f"{title} {artist} {album}".lower()
    return bool(
        re.search(
            r"(anime|opening|ending|\bop\b|\bed\b|theme|ost|project|isekai)", source
        )
    )


def build_candidate_queries(title: str, artist: str, album: str = "") -> list[str]:
    clean_title = normalize_search_term(title)
    clean_artist = normalize_search_term(artist)
    return [
        f"{clean_title} {clean_artist} official audio",
    ]


def score_candidate(
    candidate: dict[str, Any],
    target_title: str,
    target_artist: str,
    target_album: str = "",
    target_duration: int = 0,
    query_index: int = 0,
) -> int:
    title = candidate.get("title", "").lower()
    normalized_title = normalize_search_term(candidate.get("title", ""))
    channel = candidate.get("channel", "").lower()
    wanted_title = normalize_search_term(target_title)
    wanted_artist = normalize_search_term(target_artist)
    wanted_album = normalize_search_term(target_album)

    score = 100 - query_index * 8

    # --- Coincidencias básicas ---
    if wanted_title and normalized_title == wanted_title:
        score += 40
    elif wanted_title and wanted_title in title:
        score += 30
    if wanted_artist and wanted_artist in title:
        score += 20
    if wanted_artist and wanted_artist in channel:
        score += 18
    if wanted_album and wanted_album in title:
        score += 8  # Álbum correcto ayuda a desambiguar

    # --- Duración: comparar con la duración conocida de Deezer ---
    if target_duration and target_duration > 0:
        yt_dur = int(candidate.get("duration") or 0)
        if yt_dur > 0:
            diff_pct = abs(yt_dur - target_duration) / target_duration
            if diff_pct <= 0.10:
                score += 25  # diferencia ≤10% → fuerte coincidencia
            elif diff_pct <= 0.20:
                score += 10  # diferencia ≤20% → coincidencia razonable
            elif diff_pct >= 0.40:
                score -= 30  # diferencia ≥40% → probable canción equivocada

    # --- Bonus: versiones de audio limpio ---
    if "official audio" in title:
        score += 25
    if "official video" in title:
        score += 14
    if "audio only" in title:
        score += 20
    if "radio edit" in title or "radio version" in title:
        score += 18
    if "topic" in channel:
        score += 12  # Canal oficial de YouTube Music
    if "official" in channel:
        score += 8
    if looks_anime_like(target_title, target_artist, target_album) and (
        "opening" in title
        or "ending" in title
        or re.search(r"\bop\b|\bed\b", title)
        or "full version" in title
    ):
        score += 15

    # --- PENALIZACIONES: music videos y clips ---
    MV_KEYWORDS = [
        "music video",
        "official video",
        "official music video",
        "mv",
        "videoclip",
        "video clip",
        "official clip",
        "video oficial",
    ]
    for kw in MV_KEYWORDS:
        if kw in title:
            score -= 25
            break  # Una penalización por candidato

    # --- PENALIZACIONES: contenido no deseado ---
    if (
        "lyrics" in title
        or "lyric video" in title
        or "sub esp" in title
        or "sub english" in title
        or "subbed" in title
    ):
        score -= 12
    if "karaoke" in title:
        score -= 30
    if "reaction" in title:
        score -= 15
    if "nightcore" in title or "sped up" in title or "slowed" in title or "8d" in title:
        score -= 20
    if "cover" in title and wanted_artist not in channel:
        score -= 12  # Cover de otro artista
    if "dub cover" in title or "english dub cover" in title or "fan dub" in title:
        score -= 24
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

    label = classify_candidate(candidate)
    if label == "original probable":
        score += 10
    elif label == "cover":
        score -= 10
    elif label == "live":
        score -= 8

    return score


def classify_candidate(candidate: dict[str, Any]) -> str:
    haystack = f"{candidate.get('title', '')} {candidate.get('channel', '')}".lower()
    if re.search(r"(opening|ending|\bop\b|\bed\b)", haystack):
        return "anime op/ed"
    if re.search(r"(cover|fan cover|spanish cover)", haystack):
        return "cover"
    if re.search(r"(live|concert|en vivo)", haystack):
        return "live"
    return "original probable"


def confidence_from_score(score: int) -> str:
    if score >= 120:
        return "alta"
    if score >= 90:
        return "media"
    return "baja"


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


def build_download_options(
    video_id: str, format_name: str, workdir: Path, client: str = "android_music"
) -> dict[str, Any]:
    ext = "m4a" if format_name == "aac" else "mp3"
    try:
        ffmpeg_location = get_ffmpeg_exe()
    except Exception:
        ffmpeg_location = None

    cookies_path = None
    active_b64 = _get_active_cookies_b64()
    if active_b64:
        cookies_path = workdir / "youtube-cookies.txt"
        _b64 = active_b64.rstrip("=")
        _b64 += "=" * (-len(_b64) % 4)
        cookies_path.write_bytes(base64.b64decode(_b64))
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


_YTDLP_ERROR_LABELS: dict[str, str] = {
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
        if now - _ytdlp_last_update_ts < _YTDLP_UPDATE_COOLDOWN:
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
            info = _ytdlp_version_info()
            threading.Thread(
                target=lambda: asyncio.run(
                    _send_telegram(f"⬆️ yt-dlp actualizado automáticamente a <b>{info['version']}</b>")
                ),
                daemon=True,
            ).start()
        return ok
    except Exception:
        return False


def convert_audio(source_path: Path, target_path: Path, format_name: str) -> None:
    ffmpeg_bin = get_ffmpeg_exe()
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
    shutil.rmtree(workdir, ignore_errors=True)
    download_slots.release()


@asynccontextmanager
async def lifespan(_: FastAPI):
    TEMP_DIR.mkdir(parents=True, exist_ok=True)
    threading.Thread(target=_cookie_checker_loop, daemon=True).start()
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
    issues: list[str] = []
    if not SERVICE_API_KEY:
        issues.append("SERVICE_API_KEY no configurada")
    if not DOWNLOAD_SIGNING_SECRET:
        issues.append("DOWNLOAD_SIGNING_SECRET no configurada")
    try:
        get_ffmpeg_exe()
    except Exception:
        issues.append("ffmpeg no disponible")
    in_maintenance = _is_maintenance()
    return {
        "ok": len(issues) == 0 and not in_maintenance,
        "service": "ytdlp-service",
        "issues": issues,
        "cookies_configured": bool(YOUTUBE_COOKIES_B64 or YOUTUBE_COOKIES.strip()),
        "resolve_cache_entries": len(_resolve_cache),
        "resolve_cache_max": _RESOLVE_CACHE_MAX,
        "maintenance": in_maintenance,
        "maintenance_until": int(_maintenance_until) if in_maintenance else None,
    }


def _decode_cookies_to_file(b64: str, path: Path) -> None:
    _b64 = b64.rstrip("=")
    _b64 += "=" * (-len(_b64) % 4)
    path.write_bytes(base64.b64decode(_b64))


def _ytdlp_version_info() -> dict[str, Any]:
    """Devuelve versión de yt-dlp y días desde su fecha de release."""
    try:
        result = subprocess.run(
            ["yt-dlp", "--version"], capture_output=True, text=True, timeout=10
        )
        version = result.stdout.strip()  # formato: YYYY.MM.DD
        parts = version.split(".")
        if len(parts) == 3:
            release_date = datetime(int(parts[0]), int(parts[1]), int(parts[2]), tzinfo=timezone.utc)
            age_days = (datetime.now(timezone.utc) - release_date).days
        else:
            age_days = -1
        return {"version": version, "age_days": age_days}
    except Exception:
        return {"version": "unknown", "age_days": -1}


def _ping_youtube_with_cookies(b64: str) -> bool:
    with tempfile.TemporaryDirectory() as tmp:
        cookies_path = Path(tmp) / "cookies.txt"
        _decode_cookies_to_file(b64, cookies_path)
        result = subprocess.run(
            [
                "yt-dlp",
                "--cookies", str(cookies_path),
                "--skip-download",
                "--quiet",
                "--no-warnings",
                "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            ],
            capture_output=True,
            timeout=30,
        )
        return result.returncode == 0


async def _send_telegram(text: str) -> None:
    """Envía mensaje de Telegram de forma no bloqueante. No lanza excepciones."""
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        return
    try:
        import urllib.request
        import urllib.parse
        data = urllib.parse.urlencode({
            "chat_id": TELEGRAM_CHAT_ID,
            "text": text,
            "parse_mode": "HTML",
        }).encode()
        req = urllib.request.Request(
            f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
            data=data,
        )
        urllib.request.urlopen(req, timeout=10)
    except Exception as e:
        print(f"[telegram] Error enviando mensaje: {e}", flush=True)


@app.get("/internal/keepalive-yt")
async def keepalive_youtube(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    require_service_key(authorization)
    active_b64 = _get_active_cookies_b64()
    if not active_b64:
        return {"ok": False, "reason": "no cookies configured", "cookies_total": 0}

    cookies_total = len(_ALL_COOKIES_B64)
    initial_index = _cookies_index

    # Intentar con la cookie activa; si falla y hay más, rotar y reintentar una vez
    ok = _ping_youtube_with_cookies(active_b64)
    rotated = False
    if not ok and cookies_total > 1:
        _rotate_cookies()
        rotated = True
        next_b64 = _get_active_cookies_b64()
        ok = _ping_youtube_with_cookies(next_b64)

    ytdlp = _ytdlp_version_info()
    ytdlp_old = ytdlp["age_days"] > 30

    print(
        f"[keepalive-yt] cookies #{_cookies_index + 1}/{cookies_total} "
        f"ok={ok} rotated={rotated} yt-dlp={ytdlp['version']} ({ytdlp['age_days']}d)",
        flush=True,
    )

    return {
        "ok": ok,
        "cookies_index": _cookies_index + 1,
        "cookies_total": cookies_total,
        "rotated": rotated,
        "previous_index": initial_index + 1,
        "ytdlp_version": ytdlp["version"],
        "ytdlp_age_days": ytdlp["age_days"],
        "ytdlp_outdated": ytdlp_old,
    }


@app.post("/telegram/webhook")
async def telegram_webhook(req: Request) -> dict[str, str]:
    """Recibe comandos del bot de Telegram (/status, /rotate)."""
    if not TELEGRAM_BOT_TOKEN:
        raise HTTPException(status_code=503, detail="Telegram not configured")

    body = await req.json()
    message = body.get("message", {})
    text = message.get("text", "").strip()
    chat_id = str(message.get("chat", {}).get("id", ""))
    document = message.get("document")

    # Solo responder al chat autorizado
    if chat_id != TELEGRAM_CHAT_ID:
        return {"ok": "ignored"}

    # Recepción de archivo cookies.txt
    if document:
        file_name = document.get("file_name", "")
        if not file_name.endswith(".txt"):
            await _send_telegram("❌ Solo acepto archivos <b>.txt</b> de cookies en formato Netscape.")
            return {"ok": "handled"}
        try:
            await _send_telegram("⏳ Recibiendo archivo y comprobando cookies existentes...")
            file_id = document["file_id"]
            info_res = await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: __import__("urllib.request").request.urlopen(
                    f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/getFile?file_id={file_id}",
                    timeout=10,
                ).read(),
            )
            info = json.loads(info_res)
            file_path_tg = info["result"]["file_path"]

            file_bytes = await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: __import__("urllib.request").request.urlopen(
                    f"https://api.telegram.org/file/bot{TELEGRAM_BOT_TOKEN}/{file_path_tg}",
                    timeout=15,
                ).read(),
            )

            if b"Netscape HTTP Cookie File" not in file_bytes[:50]:
                await _send_telegram("❌ El archivo no parece un archivo de cookies Netscape válido.\nExportalo con Cookie Quick Manager en Firefox.")
                return {"ok": "handled"}

            b64 = base64.b64encode(file_bytes).decode("ascii")
            report = await asyncio.get_event_loop().run_in_executor(None, lambda: _add_cookie_smart(b64))
            _set_maintenance(False)

            total = report["total"]
            slot = report["slot"]
            action_labels = {
                "added": f"➕ Nueva cookie añadida como slot #{slot}",
                "replaced_broken": f"🔄 Reemplazó slot roto #{slot}",
                "replaced_active": f"♻️ Reemplazó slot activo #{slot} (todos estaban llenos)",
            }
            action_text = action_labels.get(report["action"], "✅ Cookie aplicada")
            bar = "".join("🟢" if i < slot else "⬜" for i in range(total))
            status_icon = "✅" if report["action"] == "added" else "🔄" if "roto" in report["action"] else "♻️"
            await _send_telegram(
                f"<b>━━━━━━━━━━━━━━━━</b>\n"
                f"{status_icon} <b>cookies.txt Procesado</b>\n"
                f"<b>━━━━━━━━━━━━━━━━</b>\n\n"
                f"{action_text}\n"
                f"{bar}\n"
                f"<b>{total}</b> slots activos\n\n"
                f"🌐 Mantenimiento desactivado\n"
                f"✅ Descargas reanudadas\n\n"
                f"💾 <i>Para hacerlo permanente en Railway:</i>\n"
                f"<code>YOUTUBE_COOKIES_B64_{slot}</code>\n\n"
                f"<b>━━━━━━━━━━━━━━━━</b>"
            )
        except Exception as e:
            await _send_telegram(f"❌ Error procesando el archivo: {e}")
        return {"ok": "handled"}

    if text.startswith("/status"):
        ytdlp = _ytdlp_version_info()
        cookies_total = len(_ALL_COOKIES_B64)
        with _stats_lock:
            dl_today = _stats["today"]
            dl_total = _stats["total"]
            dl_errors = _stats["errors"]
        slots_free = download_slots._value  # type: ignore[attr-defined]

        maint_status = "🔴 MANTENIMIENTO" if _is_maintenance() else "🟢 OPERATIVO"
        cookie_bar = "".join("🟢" if i < _cookies_index + 1 else "⬜" for i in range(cookies_total)) or "❌ sin cookies"
        ytdlp_emoji = "✅" if ytdlp["age_days"] <= 30 else "⚠️"

        lines = [
            f"<b>━━━━━━━━━━━━━━━━</b>",
            f"<b>🎵 MHL Music Status</b>",
            f"<b>━━━━━━━━━━━━━━━━</b>",
            "",
            f"{maint_status}",
            "",
            f"<b>🍪 Cookies activas</b>",
            f"{cookie_bar}",
            f"#{_cookies_index + 1} de {cookies_total} en uso",
            "",
            f"<b>🔧 yt-dlp {ytdlp['version']}</b>",
            f"{ytdlp_emoji} {ytdlp['age_days']} días desde release",
            "",
            f"<b>📥 Descargas</b>",
            f"🌅 Hoy: <b>{dl_today}</b>  |  📊 Total: <b>{dl_total}</b>",
            f"❌ Errores: <b>{dl_errors}</b>",
            "",
            f"<b>⚡ Descargas simultáneas</b>",
            f"{slots_free}/{MAX_CONCURRENT_DOWNLOADS} slots libres",
            f"<b>━━━━━━━━━━━━━━━━</b>",
        ]
        if ytdlp["age_days"] > 30:
            lines.append("\n⚠️ <b>yt-dlp desactualizado</b> — usa /update para actualizar")
        if _is_maintenance():
            lines.append("\n🔧 El servicio está en mantenimiento — /status en 1 min")
        await _send_telegram("\n".join(lines))

    elif text.startswith("/ping"):
        import time
        t0 = time.monotonic()
        _ytdlp_version_info()
        ms = int((time.monotonic() - t0) * 1000)
        if ms < 500:
            emoji, status = "🟢", "Excelente"
        elif ms < 1000:
            emoji, status = "🟡", "Normal"
        else:
            emoji, status = "🔴", "Lento"
        await _send_telegram(
            f"<b>━━━━━━━━━━━━━━━━</b>\n"
            f"🏓 <b>Ping del servidor</b>\n"
            f"<b>━━━━━━━━━━━━━━━━</b>\n\n"
            f"{emoji} <b>{ms}ms</b> — {status}\n\n"
            f"<b>━━━━━━━━━━━━━━━━</b>"
        )

    elif text.startswith("/logs"):
        with _error_log_lock:
            recent = list(_error_log)
        if not recent:
            await _send_telegram(
                "<b>━━━━━━━━━━━━━━━━</b>\n"
                "✅ <b>Sin errores recientes</b>\n"
                "<b>━━━━━━━━━━━━━━━━</b>\n\n"
                "El sistema está funcionando correctamente."
            )
        else:
            lines = [
                "<b>━━━━━━━━━━━━━━━━</b>",
                f"🚨 <b>Últimos {len(recent[-10:])} errores</b>",
                "<b>━━━━━━━━━━━━━━━━</b>",
                "",
            ] + recent[-10:] + ["", "<b>━━━━━━━━━━━━━━━━</b>"]
            await _send_telegram("\n".join(lines))

    elif text.startswith("/update"):
        await _send_telegram("⏳ Actualizando yt-dlp...")
        def _do_update() -> None:
            ok = try_auto_update_ytdlp()
            info = _ytdlp_version_info()
            msg = (
                f"✅ yt-dlp actualizado a <b>{info['version']}</b>"
                if ok
                else f"⚠️ No se pudo actualizar (cooldown activo o error)\nVersión actual: {info['version']}"
            )
            asyncio.run(_send_telegram(msg))
        threading.Thread(target=_do_update, daemon=True).start()

    elif text.startswith("/rotate"):
        if len(_ALL_COOKIES_B64) <= 1:
            await _send_telegram("⚠️ Solo hay 1 set de cookies, no hay a dónde rotar.")
        else:
            prev = _cookies_index + 1
            _rotate_cookies()
            new = _cookies_index + 1
            total = len(_ALL_COOKIES_B64)
            bar = "".join("🟢" if i < new else "⬜" for i in range(total))
            await _send_telegram(
                f"<b>━━━━━━━━━━━━━━━━</b>\n"
                f"🔄 <b>Cookies rotadas</b>\n"
                f"<b>━━━━━━━━━━━━━━━━</b>\n\n"
                f"{bar}\n"
                f"#{prev} ➜ #{new}/{total}\n\n"
                f"<b>━━━━━━━━━━━━━━━━</b>"
            )

    elif text.startswith("/maintenance"):
        parts = text.split()
        if len(parts) < 2 or parts[1] not in ("on", "off"):
            await _send_telegram("Uso: /maintenance on | /maintenance off")
        elif parts[1] == "on":
            _set_maintenance(True, minutes=5)
            await _send_telegram(
                "<b>━━━━━━━━━━━━━━━━</b>\n"
                "🔧 <b>Mantenimiento ACTIVADO</b>\n"
                "<b>━━━━━━━━━━━━━━━━</b>\n\n"
                "⏱️ Duración: 5 minutos\n"
                "🌐 Descargas: pausadas en la web\n\n"
                "<b>━━━━━━━━━━━━━━━━</b>"
            )
        else:
            _set_maintenance(False)
            await _send_telegram(
                "<b>━━━━━━━━━━━━━━━━</b>\n"
                "✅ <b>Mantenimiento DESACTIVADO</b>\n"
                "<b>━━━━━━━━━━━━━━━━</b>\n\n"
                "🌐 Descargas: reanudadas\n\n"
                "<b>━━━━━━━━━━━━━━━━</b>"
            )

    elif text.startswith("/login"):
        if _is_maintenance():
            await _send_telegram("🔧 Ya hay un mantenimiento activo.\nUsa /addcookie &lt;base64&gt; para cargar la cookie.")
        else:
            _set_maintenance(True, minutes=10)
            await _send_telegram(
                "🔧 <b>Mantenimiento activado</b> (10 min)\n"
                "La web ya muestra el aviso a los usuarios.\n\n"
                "Exporta las cookies de YouTube y envíalas con:\n"
                "<code>/addcookie &lt;base64&gt;</code>\n\n"
                "Para convertir el archivo en PC:\n"
                "<code>python -c \"import base64,sys; print(base64.b64encode(open(sys.argv[1],'rb').read()).decode())\" cookies.txt</code>"
            )

    elif text.startswith("/addcookie"):
        parts = text.split(maxsplit=1)
        if len(parts) < 2:
            await _send_telegram("Uso: /addcookie &lt;base64&gt;\n\nO envía el archivo <b>cookies.txt</b> directamente al chat.")
        else:
            b64 = parts[1].strip()
            try:
                _b64c = b64.rstrip("=")
                _b64c += "=" * (-len(_b64c) % 4)
                decoded = base64.b64decode(_b64c)
                if b"Netscape HTTP Cookie File" not in decoded[:50]:
                    raise ValueError("No parece un archivo de cookies Netscape válido")
                await _send_telegram("⏳ Comprobando cookies existentes antes de añadir...")
                report = await asyncio.get_event_loop().run_in_executor(None, lambda: _add_cookie_smart(b64))
                _set_maintenance(False)
                total = report["total"]
                slot = report["slot"]
                action_labels = {
                    "added": f"➕ Nueva cookie añadida como slot #{slot}",
                    "replaced_broken": f"🔄 Reemplazó slot roto #{slot}",
                    "replaced_active": f"♻️ Reemplazó slot activo #{slot}",
                }
                action_text = action_labels.get(report["action"], "✅ Cookie aplicada")
                bar = "🟢" * total
                await _send_telegram(
                    f"✅ <b>Cookie aplicada</b>\n\n"
                    f"{action_text}\n"
                    f"{bar}  {total} slots activos\n\n"
                    "🌐 Mantenimiento desactivado — descargas reanudadas."
                )
            except Exception as e:
                await _send_telegram(f"❌ Error procesando cookie: {e}")

    elif text.startswith("/checkall"):
        if not _ALL_COOKIES_B64:
            await _send_telegram("⚠️ No hay cookies configuradas.")
        else:
            await _send_telegram(f"⏳ Comprobando <b>{len(_ALL_COOKIES_B64)} slots</b> en paralelo...")
            def _do_check() -> None:
                report = _check_all_cookies()
                total, ok, removed = report["total"], report["ok"], report["removed"]
                bar = "".join("🟢" if i < ok else "❌" for i in range(total))
                lines = [
                    "<b>━━━━━━━━━━━━━━━━</b>",
                    "🍪 <b>Chequeo de cookies</b>",
                    "<b>━━━━━━━━━━━━━━━━</b>",
                    "",
                    bar,
                    f"<b>{ok}/{total}</b> válidas",
                ]
                if removed:
                    lines.append("")
                    lines.append(f"❌ <b>{removed} eliminadas</b> automáticamente (inválidas)")
                    if ok == 0:
                        lines.append("")
                        lines.append("⚠️ <b>¡Sin cookies válidas!</b>")
                        lines.append("Usa /login para renovar.")
                lines.append("")
                lines.append("<b>━━━━━━━━━━━━━━━━</b>")
                asyncio.run(_send_telegram("\n".join(lines)))
            threading.Thread(target=_do_check, daemon=True).start()

    elif text.startswith("/help"):
        await _send_telegram(
            "<b>━━━━━━━━━━━━━━━━</b>\n"
            "🎵 <b>MHL Bot — Guía Completa</b>\n"
            "<b>━━━━━━━━━━━━━━━━</b>\n\n"
            "<b>📊 Monitoreo</b>\n"
            "  /status — estado del servicio\n"
            "  🏓 /ping — latencia del servidor\n"
            "  🚨 /logs — últimos errores\n\n"
            "<b>🔧 Mantenimiento</b>\n"
            "  ⬆️ /update — actualizar yt-dlp\n"
            "  🔄 /rotate — rotar cookies\n"
            "  🍪 /checkall — chequear todas ahora\n\n"
            "<b>🔑 Cookies</b>\n"
            "  🔐 /login — renovar cookies\n"
            "  📎 /addcookie &lt;base64&gt; — cargar por texto\n"
            "  📄 <b>Envía cookies.txt directamente</b>\n"
            "  🔧 /maintenance on|off — modo manual\n\n"
            "<b>━━━━━━━━━━━━━━━━</b>\n"
            "💡 <i>El bot testa cada cookie antes de guardar</i>\n"
            "<i>Chequeo automático cada 6 horas</i>\n"
            "<b>━━━━━━━━━━━━━━━━</b>"
        )

    return {"ok": "handled"}


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
        raise HTTPException(
            status_code=502, detail=f"Búsqueda fallida en YouTube: {exc}"
        ) from exc


@app.post("/candidates")
async def candidates(
    payload: dict[str, Any],
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    require_service_key(authorization)

    title = str(payload.get("title") or "").strip()
    artist = str(payload.get("artist") or "").strip()
    album = str(payload.get("album") or "").strip()
    duration = int(payload.get("duration") or 0)

    if not title or not artist:
        raise HTTPException(status_code=400, detail="title and artist are required")

    merged: dict[str, dict[str, Any]] = {}
    queries = build_candidate_queries(title, artist, album)

    try:
        for query_index, query in enumerate(queries):
            for candidate in search_candidates(query, limit=3):
                video_id = str(candidate.get("videoId") or "").strip()
                if not video_id:
                    continue
                score = score_candidate(
                    candidate, title, artist, album, duration, query_index
                )
                normalized = {
                    "videoId": video_id,
                    "title": candidate["title"],
                    "channel": candidate["channel"],
                    "duration": int(candidate.get("duration") or 0),
                    "score": score,
                    "label": classify_candidate(candidate),
                    "confidence": confidence_from_score(score),
                }
                existing = merged.get(video_id)
                if not existing or score > int(existing["score"]):
                    merged[video_id] = normalized
            ranked = sorted(
                merged.values(), key=lambda x: int(x["score"]), reverse=True
            )
            if ranked and ranked[0].get("confidence") == "alta" and len(ranked) >= 2:
                return {"success": True, "candidates": ranked[:3]}
            if query_index >= 1 and ranked and ranked[0].get("confidence") != "baja":
                return {"success": True, "candidates": ranked[:3]}
    except Exception as exc:
        raise HTTPException(
            status_code=502, detail=f"Error al buscar candidatos en YouTube: {exc}"
        ) from exc

    scored = sorted(merged.values(), key=lambda x: int(x["score"]), reverse=True)[:3]

    return {"success": True, "candidates": scored}


def _cache_key(title: str, artist: str) -> str:
    return f"{normalize_search_term(title)}|{normalize_search_term(artist)}"


def _cache_get(key: str) -> dict[str, Any] | None:
    with _resolve_cache_lock:
        entry = _resolve_cache.get(key)
        if entry is None:
            return None
        if datetime.now(timezone.utc).timestamp() - entry["ts"] > _RESOLVE_CACHE_TTL:
            del _resolve_cache[key]
            return None
        # Mover al final para mantener orden LRU
        _resolve_cache.move_to_end(key)
        return entry


def _cache_set(key: str, video_id: str, candidate: dict[str, Any]) -> None:
    with _resolve_cache_lock:
        if key in _resolve_cache:
            _resolve_cache.move_to_end(key)
        else:
            if len(_resolve_cache) >= _RESOLVE_CACHE_MAX:
                _resolve_cache.popitem(last=False)  # Elimina el más antiguo (O(1))
        _resolve_cache[key] = {
            "videoId": video_id,
            "title": candidate.get("title", ""),
            "duration": int(candidate.get("duration") or 0),
            "ts": datetime.now(timezone.utc).timestamp(),
        }


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
    duration = int(payload.get("duration") or 0)

    if not title or not artist:
        raise HTTPException(status_code=400, detail="title and artist are required")
    if format_name not in {"mp3", "aac"}:
        raise HTTPException(status_code=400, detail="format must be mp3 or aac")

    cache_key = _cache_key(title, artist)
    cached = _cache_get(cache_key)

    if cached:
        safe_name = sanitize_filename(f"{title} - {artist}.{format_name}")
        token_info = build_token(cached["videoId"], safe_name, format_name)
        return {
            "success": True,
            "videoId": cached["videoId"],
            "title": cached["title"],
            "duration": cached["duration"],
            "format": format_name,
            "fileName": safe_name,
            "cached": True,
            **token_info,
        }

    try:
        candidates = search_candidates(f"{title} {artist} official audio", limit=8)
    except Exception as exc:
        raise HTTPException(
            status_code=502, detail=f"Error al buscar el video en YouTube: {exc}"
        ) from exc

    if not candidates:
        raise HTTPException(
            status_code=404,
            detail="No se encontró ningún video de YouTube para esta canción",
        )

    chosen = max(
        candidates,
        key=lambda item: score_candidate(item, title, artist, album, duration),
    )
    _cache_set(cache_key, chosen["videoId"], chosen)

    safe_name = sanitize_filename(f"{title} - {artist}.{format_name}")
    token_info = build_token(chosen["videoId"], safe_name, format_name)
    return {
        "success": True,
        "videoId": chosen["videoId"],
        "title": chosen["title"],
        "duration": chosen.get("duration") or 0,
        "format": format_name,
        "fileName": safe_name,
        "cached": False,
        **token_info,
    }


@app.get("/download")
async def download(token: str = Query(...)) -> FileResponse:
    payload = verify_token(token)
    video_id = str(payload.get("videoId") or "").strip()
    file_name = str(payload.get("fileName") or "download.mp3")
    format_name = str(payload.get("format") or "mp3").strip().lower()

    if _is_maintenance():
        raise HTTPException(
            status_code=503,
            detail=json.dumps({"maintenance": True, "message": "Servicio en mantenimiento (~5 min), vuelve pronto"}),
        )
    if not video_id:
        raise HTTPException(
            status_code=400, detail="Token inválido: falta el identificador de video"
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

        # ── Intentos yt-dlp: rotar clientes hasta que uno funcione ───────────
        def _run_ytdlp(client: str) -> Path | None:
            with YoutubeDL(
                build_download_options(video_id, format_name, workdir, client)
            ) as ydl:
                ydl.download([f"https://www.youtube.com/watch?v={video_id}"])
            ext = "m4a" if format_name == "aac" else "mp3"
            return next(workdir.glob(f"audio*.{ext}"), None)

        last_ytdlp_err: Exception | None = None
        updated_once = False
        for client in _YTDLP_CLIENTS:
            try:
                output = _run_ytdlp(client)
                ytdlp_ok = True
                break
            except Exception as ytdlp_err:
                last_ytdlp_err = ytdlp_err
                print(f"[ytdlp] client={client} error={type(ytdlp_err).__name__}: {ytdlp_err}", flush=True)
                err_type = classify_ytdlp_error(ytdlp_err)
                # Si es error de extractor/desconocido, intentar auto-update una sola vez
                # antes de seguir rotando clientes
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
                # Si el error es de auth, rotar cookies y reintentar una vez
                if err_type == "ytdlp_auth" and len(_ALL_COOKIES_B64) > 1:
                    prev_idx = _cookies_index + 1
                    _rotate_cookies()
                    new_idx = _cookies_index + 1
                    threading.Thread(
                        target=lambda p=prev_idx, n=new_idx: asyncio.run(
                            _send_telegram(
                                f"🔄 Cookies rotadas en producción\n"
                                f"#{p} → #{n}/{len(_ALL_COOKIES_B64)}\n"
                                f"{'🟢' * n + '⬜' * (len(_ALL_COOKIES_B64) - n)}"
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
                    break

        if not ytdlp_ok and last_ytdlp_err is not None:
            err_type = classify_ytdlp_error(last_ytdlp_err)
            ytdlp_err_msg = _YTDLP_ERROR_LABELS.get(err_type, str(last_ytdlp_err))
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
            media_type="audio/mpeg" if format_name == "mp3" else "audio/mp4",
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


def check_rate_limit(ip: str) -> tuple[bool, str, int]:
    """Returns (ok, message, retry_after_seconds)."""
    now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    window_ms = RATE_LIMIT_WINDOW_SECONDS * 1000

    with _rate_store_lock:
        state = _rate_store.get(ip, {"burst": [], "day_count": 0, "day_key": today})
        if state["day_key"] != today:
            state = {"burst": [], "day_count": 0, "day_key": today}

        state["burst"] = [ts for ts in state["burst"] if now_ms - ts < window_ms]

        if len(state["burst"]) >= RATE_LIMIT_BURST:
            _rate_store[ip] = state
            return False, "Too many requests in a short period", RATE_LIMIT_WINDOW_SECONDS

        if state["day_count"] >= RATE_LIMIT_DAILY:
            _rate_store[ip] = state
            return False, "Daily quota reached", 3600

        state["burst"].append(now_ms)
        state["day_count"] += 1
        _rate_store[ip] = state
        return True, "", 0


def get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.headers.get("x-real-ip") or request.client.host or "unknown"


# ── Deezer proxy ──────────────────────────────────────────────────────────────

DEEZER_BASE = "https://api.deezer.com"


async def _dz_get(path: str) -> dict[str, Any]:
    import httpx
    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.get(f"{DEEZER_BASE}{path}")
        res.raise_for_status()
        return res.json()


async def _dz_get_many(paths: list[str]) -> list[dict[str, Any]]:
    import httpx
    async with httpx.AsyncClient(timeout=10) as client:
        responses = await asyncio.gather(
            *[client.get(f"{DEEZER_BASE}{p}") for p in paths],
            return_exceptions=True,
        )
    results = []
    for r in responses:
        if isinstance(r, Exception):
            raise r
        r.raise_for_status()
        results.append(r.json())
    return results


def _clean_album_title(title: str) -> str:
    normalized = re.sub(r"\s+", " ", title or "")
    normalized = re.sub(r"\b(opening|ending)\s+theme\s+song\b", "", normalized, flags=re.I)
    normalized = re.sub(r"\b(opening|ending)\s+theme\b", "", normalized, flags=re.I)
    normalized = re.sub(r"\btheme\s+song\b", "", normalized, flags=re.I)
    normalized = re.sub(r"\b(ost|original soundtrack|soundtrack)\b", "", normalized, flags=re.I)
    normalized = re.sub(r"\s+", " ", normalized).strip()
    parts = re.split(r"\s[-–—:]\s", normalized)
    if len(parts) > 1:
        suffix = " - ".join(parts[1:])
        if re.search(r"(opening|ending|theme|ost|soundtrack|season|anime|ver\.?|version)", suffix, re.I):
            normalized = parts[0].strip() or normalized
    return normalized or title or "Unknown"


def _transform_track(item: dict[str, Any]) -> dict[str, Any]:
    canonical_title = item.get("title_short") or item.get("title") or "Unknown"
    album = item.get("album") or {}
    artist = item.get("artist") or {}
    return {
        "id": f"dz-{item['id']}",
        "deezerId": item["id"],
        "title": item.get("title") or canonical_title,
        "canonicalTitle": canonical_title,
        "canonicalAlbum": _clean_album_title(album.get("title") or "Unknown"),
        "artist": artist.get("name") or "Unknown",
        "album": album.get("title") or "Unknown",
        "duration": item.get("duration") or 0,
        "cover": album.get("cover_big") or album.get("cover_medium") or album.get("cover_small") or "",
        "coverSmall": album.get("cover_medium") or album.get("cover_small") or "",
        "coverXL": album.get("cover_xl") or album.get("cover_big") or "",
        "preview": item.get("preview") or "",
        "artistId": artist.get("id"),
        "albumId": album.get("id"),
        "rank": item.get("rank"),
    }


def _transform_artist(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": f"dz-artist-{item['id']}",
        "deezerId": item["id"],
        "name": item.get("name") or "Unknown",
        "picture": item.get("picture_xl") or item.get("picture_big") or item.get("picture_medium") or "",
        "pictureSmall": item.get("picture_medium") or item.get("picture_small") or "",
        "pictureXL": item.get("picture_xl") or item.get("picture_big") or "",
        "fans": item.get("nb_fan") or 0,
    }


def _transform_album(item: dict[str, Any]) -> dict[str, Any]:
    artist = item.get("artist") or {}
    return {
        "id": f"dz-album-{item['id']}",
        "deezerId": item["id"],
        "title": item.get("title") or "Unknown",
        "artist": artist.get("name") or "Unknown",
        "artistId": artist.get("id"),
        "cover": item.get("cover_big") or item.get("cover_medium") or item.get("cover_small") or "",
        "coverSmall": item.get("cover_medium") or item.get("cover_small") or "",
        "coverXL": item.get("cover_xl") or item.get("cover_big") or "",
        "releaseDate": item.get("release_date"),
        "genre": (item.get("genres") or {}).get("data", [{}])[0].get("name") if (item.get("genres") or {}).get("data") else None,
    }



@app.post("/deezer")
async def deezer_proxy(
    payload: dict[str, Any],
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    require_service_key(authorization)
    action = str(payload.get("action") or "search")

    try:
        if action == "search":
            q = str(payload.get("query") or "").strip()[:200]
            limit = min(int(payload.get("limit") or 25), 50)
            offset = int(payload.get("offset") or 0)
            if not q:
                raise HTTPException(status_code=400, detail="query is required")
            data = await _dz_get(f"/search?q={q}&limit={limit}&index={offset}")
            return {"success": True, "tracks": [_transform_track(t) for t in data.get("data") or []], "total": data.get("total") or 0}

        if action == "searchAll":
            q = str(payload.get("query") or "").strip()[:200]
            if not q:
                raise HTTPException(status_code=400, detail="query is required")
            tracks_d, artists_d, albums_d = await _dz_get_many([
                f"/search?q={q}&limit=10",
                f"/search/artist?q={q}&limit=5",
                f"/search/album?q={q}&limit=5",
            ])
            return {
                "success": True,
                "tracks": [_transform_track(t) for t in tracks_d.get("data") or []],
                "artists": [_transform_artist(a) for a in artists_d.get("data") or []],
                "albums": [_transform_album(a) for a in albums_d.get("data") or []],
            }

        if action == "artist":
            artist_id = payload.get("artistId")
            if not artist_id:
                raise HTTPException(status_code=400, detail="artistId is required")
            info_d, top_d, albums_d, related_d = await _dz_get_many([
                f"/artist/{artist_id}",
                f"/artist/{artist_id}/top?limit=10",
                f"/artist/{artist_id}/albums?limit=10",
                f"/artist/{artist_id}/related?limit=8",
            ])
            return {
                "success": True,
                "info": {"id": info_d["id"], "name": info_d["name"], "picture": info_d.get("picture_xl") or info_d.get("picture_big") or "", "fans": info_d.get("nb_fan") or 0},
                "topTracks": [_transform_track(t) for t in top_d.get("data") or []],
                "albums": [_transform_album(a) for a in albums_d.get("data") or []],
                "related": [_transform_artist(a) for a in related_d.get("data") or []],
            }

        if action == "album":
            album_id = payload.get("albumId")
            if not album_id:
                raise HTTPException(status_code=400, detail="albumId is required")
            album_d = await _dz_get(f"/album/{album_id}")
            artist_albums_d = await _dz_get(f"/artist/{album_d['artist']['id']}/albums?limit=20")
            return {
                "success": True,
                "album": {
                    "id": album_d["id"],
                    "title": album_d.get("title") or "",
                    "cover": album_d.get("cover_xl") or album_d.get("cover_big") or album_d.get("cover_medium") or "",
                    "artist": {"id": album_d["artist"]["id"], "name": album_d["artist"]["name"]},
                    "releaseDate": album_d.get("release_date"),
                    "trackCount": album_d.get("nb_tracks") or 0,
                    "tracks": [_transform_track(t) for t in (album_d.get("tracks") or {}).get("data") or []],
                    "genre": ((album_d.get("genres") or {}).get("data") or [{}])[0].get("name") if (album_d.get("genres") or {}).get("data") else None,
                },
                "moreByArtist": [_transform_album(a) for a in (artist_albums_d.get("data") or []) if a["id"] != album_id][:4],
            }

        if action == "trackMeta":
            track_id = payload.get("trackId")
            if not track_id:
                raise HTTPException(status_code=400, detail="trackId is required")
            track_d = await _dz_get(f"/track/{track_id}")
            album_id = (track_d.get("album") or {}).get("id")
            track_number = track_d.get("track_position")
            release_date: str | None = track_d.get("release_date")
            year = int(release_date.split("-")[0]) if release_date else None
            genre = None
            if album_id:
                try:
                    album_d = await _dz_get(f"/album/{album_id}")
                    genre = ((album_d.get("genres") or {}).get("data") or [{}])[0].get("name") if (album_d.get("genres") or {}).get("data") else None
                except Exception:
                    pass
            return {"success": True, "genre": genre, "year": year, "trackNumber": track_number}

        if action == "home":
            genre_ids = [132, 116, 152, 106, 165, 197]
            genre_names = {132: "Pop", 116: "Rap", 152: "Rock", 106: "Electronic", 165: "R&B", 197: "Latin"}
            paths = [
                "/chart/0/tracks?limit=20",
                "/genre",
                "/chart/0/artists?limit=12",
                "/chart/0/albums?limit=12",
                *[f"/chart/{gid}/tracks?limit=10" for gid in genre_ids],
            ]
            results = await _dz_get_many(paths)
            top_tracks_d, genres_d, artists_d, albums_d, *genre_tracks = results
            by_genre = {
                genre_names[gid]: {"genreId": gid, "tracks": [_transform_track(t) for t in (genre_tracks[i].get("data") or [])]}
                for i, gid in enumerate(genre_ids)
            }
            return {
                "success": True,
                "topTracks": [_transform_track(t) for t in top_tracks_d.get("data") or []],
                "genres": [{"id": g["id"], "name": g["name"], "picture": g.get("picture_xl") or g.get("picture_big") or g.get("picture_medium") or ""} for g in (genres_d.get("data") or [])[:50]],
                "byGenre": by_genre,
                "trendingArtists": [_transform_artist(a) for a in artists_d.get("data") or []],
                "newAlbums": [_transform_album(a) for a in albums_d.get("data") or []],
            }

        if action == "genre":
            genre_id = payload.get("genreId")
            if not genre_id:
                raise HTTPException(status_code=400, detail="genreId is required")
            data = await _dz_get(f"/chart/{genre_id}/tracks?limit=25")
            tracks = [_transform_track(t) for t in data.get("data") or []]
            return {"success": True, "tracks": tracks, "total": data.get("total") or len(tracks)}

        raise HTTPException(status_code=400, detail=f"Unknown action: {action}")

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Deezer error: {exc}") from exc


# ── Download ticket (web browser flow) ───────────────────────────────────────

@app.post("/download-ticket")
async def download_ticket(
    payload: dict[str, Any],
    request: Request,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    require_service_key(authorization)

    if _is_maintenance():
        raise HTTPException(
            status_code=503,
            detail=json.dumps({"maintenance": True, "message": "Servicio en mantenimiento (~5 min), vuelve pronto"}),
        )

    title = str(payload.get("title") or "").strip()
    artist = str(payload.get("artist") or "").strip()
    album = str(payload.get("album") or "").strip()
    format_name = "aac" if payload.get("format") == "aac" else "mp3"
    duration = int(payload.get("duration") or 0)
    video_id_override = str(payload.get("videoId") or "").strip() or None

    if not title or not artist:
        raise HTTPException(status_code=400, detail="title and artist are required")

    ip = get_client_ip(request)
    ok, message, retry_after = check_rate_limit(ip)
    if not ok:
        raise HTTPException(status_code=429, detail=message)

    if video_id_override:
        resolved_video_id = video_id_override
    else:
        cache_key = _cache_key(title, artist)
        cached = _cache_get(cache_key)
        if cached:
            resolved_video_id = cached["videoId"]
        else:
            try:
                results = search_candidates(f"{title} {artist} official audio", limit=8)
            except Exception as exc:
                raise HTTPException(status_code=502, detail=f"Error buscando video: {exc}") from exc
            if not results:
                raise HTTPException(status_code=404, detail="No se encontró ningún video de YouTube")
            chosen = max(results, key=lambda c: score_candidate(c, title, artist, album, duration))
            _cache_set(cache_key, chosen["videoId"], chosen)
            resolved_video_id = chosen["videoId"]

    safe_name = sanitize_filename(f"{title} - {artist}.{format_name}")
    token_info = build_token(resolved_video_id, safe_name, format_name)

    service_url = os.getenv("RAILWAY_PUBLIC_DOMAIN", "")
    if service_url and not service_url.startswith("http"):
        service_url = f"https://{service_url}"

    download_url = f"{service_url}/download?token={token_info['token']}"
    return {
        "success": True,
        "fileName": safe_name,
        "expiresAt": token_info["expiresAt"],
        "downloadUrl": download_url,
    }


@app.exception_handler(HTTPException)
async def http_error_handler(_, exc: HTTPException) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code, content={"success": False, "error": exc.detail}
    )

