"""
Proxy de YouTube sin cookies via Invidious/Piped API.
"""
import urllib.request
import json
from typing import Any


# Instancias públicas (verificadas存活)
INVIDIOUS_INSTANCES = [
    "https://invidious.jingalala.org",
    "https://invidious.projectsegfau.lt",
    "https://inv.nadersi.dev",
    "https://invidious.fdn.fr",
]

PIPED_INSTANCES = [
    "https://pipedapi.kavin.rocks",
    "https://pipedapi-libre.kavin.rocks",
    "https://pipedapi.mooncatventure.net",
]


def get_audio_url_piped(video_id: str) -> str | None:
    """Intenta Piped instances en cascada."""
    for base_url in PIPED_INSTANCES:
        try:
            url = f"{base_url}/streams/{video_id}"
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=12) as resp:
                if resp.status != 200:
                    continue
                data = json.loads(resp.read().decode())

            audio_streams = data.get("audioStreams", [])
            if not audio_streams:
                continue

            best = max(audio_streams, key=lambda s: int(s.get("bitrate", 0) or 0))
            audio_url = best.get("url")
            if audio_url:
                print(f"[piped] OK {base_url} -> {video_id}", flush=True)
                return audio_url
        except Exception as e:
            print(f"[piped] {base_url} failed: {e}", flush=True)
            continue
    return None


def get_audio_url_invidious(video_id: str) -> str | None:
    """Intenta Invidious instances en cascada."""
    for base_url in INVIDIOUS_INSTANCES:
        try:
            url = f"{base_url}/api/v1/videos/{video_id}"
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=12) as resp:
                if resp.status != 200:
                    continue
                data = json.loads(resp.read().decode())

            audio_streams = data.get("adaptiveFormats", [])
            if not audio_streams:
                continue

            # Filtrar solo audio y ordenar por bitrate desc
            audio_only = [s for s in audio_streams if s.get("type", "").startswith("audio/")]
            if not audio_only:
                continue

            best = max(audio_only, key=lambda s: int(s.get("bitrate", 0) or 0))
            audio_url = best.get("url")
            if audio_url:
                print(f"[invidious] OK {base_url} -> {video_id}", flush=True)
                return audio_url
        except Exception as e:
            print(f"[invidious] {base_url} failed: {e}", flush=True)
            continue
    return None


def get_audio_url_no_cookie(video_id: str) -> str | None:
    """
    Estrategia sin cookies: 1) Piped → 2) Invidious → 3) yt-dlp sin cookies.
    Retorna URL directa de audio o None si todo falla.
    """
    # 1) Piped
    url = get_audio_url_piped(video_id)
    if url:
        return url

    # 2) Invidious
    url = get_audio_url_invidious(video_id)
    if url:
        return url

    # 3) yt-dlp sin cookies (último recurso)
    try:
        from yt_dlp import YoutubeDL
        opts = {
            "quiet": True,
            "noplaylist": True,
            "skip_download": True,
            "format": "bestaudio/best",
            "extractor_args": {"youtube": {"player_client": ["web"]}},
        }
        with YoutubeDL(opts) as ydl:
            info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)
            audio_url = info.get("url")
            if audio_url:
                print(f"[ytdlp-no-cookie] OK web client -> {video_id}", flush=True)
                return audio_url
    except Exception as e:
        print(f"[ytdlp-no-cookie] web client failed: {e}", flush=True)

    return None
