"""
Búsqueda de YouTube via Piped/Invidious API — sin cookies, sin bot detection.
"""
import urllib.parse
import urllib.request
import json
import re
from typing import Any


# Instancias Piped verificadas
PIPED_INSTANCES = [
    "https://pipedapi.kavin.rocks",
    "https://pipedapi-libre.kavin.rocks",
    "https://pipedapi.mooncatventure.net",
    "https://pipedapi.tokhmi.xyz",
]

INVIDIOUS_INSTANCES = [
    "https://invidious.jingalala.org",
    "https://inv.nadersi.dev",
    "https://invidious.fdn.fr",
]


def search_piped(query: str, limit: int = 5) -> list[dict[str, Any]]:
    """Busca via Piped API — sin cookies ni yt-dlp."""
    for base_url in PIPED_INSTANCES:
        try:
            encoded_q = urllib.parse.quote(query)
            url = f"{base_url}/search?q={encoded_q}&filter=music_songs"
            req = urllib.request.Request(
                url,
                headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
                    "Accept": "application/json",
                    "Accept-Language": "en-US,en;q=0.9",
                },
            )
            with urllib.request.urlopen(req, timeout=15) as resp:
                if resp.status != 200:
                    continue
                data = json.loads(resp.read().decode())

            items = data.get("items", []) or []
            results = []
            for item in items[:limit]:
                video_id = item.get("id", "")
                if not video_id:
                    continue
                results.append({
                    "videoId": video_id,
                    "title": item.get("title", ""),
                    "channel": item.get("uploader", ""),
                    "duration": _parse_duration(item.get("duration", "")),
                    "webpageUrl": f"https://www.youtube.com/watch?v={video_id}",
                })
            if results:
                print(f"[piped-search] OK {base_url} -> {query}", flush=True)
                return results
        except Exception as e:
            print(f"[piped-search] {base_url} failed: {e}", flush=True)
            continue
    return []


def search_invidious(query: str, limit: int = 5) -> list[dict[str, Any]]:
    """Busca via Invidious API — fallback si Piped falla."""
    for base_url in INVIDIOUS_INSTANCES:
        try:
            encoded_q = urllib.parse.quote(query)
            url = f"{base_url}/api/v1/search?q={encoded_q}&filter=music"
            req = urllib.request.Request(
                url,
                headers={
                    "User-Agent": "Mozilla/5.0",
                    "Accept": "application/json",
                },
            )
            with urllib.request.urlopen(req, timeout=15) as resp:
                if resp.status != 200:
                    continue
                data = json.loads(resp.read().decode())

            results = []
            for item in (data or [])[:limit]:
                if item.get("type") != "video":
                    continue
                video_id = item.get("videoId", "")
                if not video_id:
                    continue
                results.append({
                    "videoId": video_id,
                    "title": item.get("title", ""),
                    "channel": item.get("author", ""),
                    "duration": int(item.get("lengthSeconds") or 0),
                    "webpageUrl": f"https://www.youtube.com/watch?v={video_id}",
                })
            if results:
                print(f"[invidious-search] OK {base_url} -> {query}", flush=True)
                return results
        except Exception as e:
            print(f"[invidious-search] {base_url} failed: {e}", flush=True)
            continue
    return []


def _parse_duration(duration_str: str) -> int:
    """Convierte string de duración (PT4M30S) a segundos."""
    if isinstance(duration_str, int):
        return duration_str
    match = re.match(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", duration_str or "")
    if not match:
        return 0
    h = int(match.group(1) or 0)
    m = int(match.group(2) or 0)
    s = int(match.group(3) or 0)
    return h * 3600 + m * 60 + s


def search_youtube_no_bot(query: str, limit: int = 5) -> list[dict[str, Any]]:
    """
    Estrategia sin cookies: 1) Piped -> 2) Invidious -> None.
    Retorna lista de candidatos con {videoId, title, channel, duration}.
    """
    # 1) Piped
    results = search_piped(query, limit)
    if results:
        return results

    # 2) Invidious
    results = search_invidious(query, limit)
    if results:
        return results

    return []