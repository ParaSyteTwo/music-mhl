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
from threading import BoundedSemaphore
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
        except Exception:
            output = download_via_rapidapi(video_id, format_name, workdir)

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
