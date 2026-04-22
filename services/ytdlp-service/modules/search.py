import re
from typing import Any

from .youtube_search import search_youtube_no_bot
from .utils import classify_candidate, looks_anime_like, normalize_search_term


def search_candidates(query: str, limit: int = 5) -> list[dict[str, Any]]:
    """Busca candidatos en YouTube via Piped/Invidious (sin yt-dlp, sin cookies)."""
    results = search_youtube_no_bot(query, limit)
    return results


def build_candidate_queries(title: str, artist: str, album: str = "") -> list[str]:
    """Construye queries de búsqueda optimizadas para una canción."""
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
    """
    Puntúa un candidato de YouTube basado en coincidencias con datos de Deezer.
    Rango: -100 a 300+
    """
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
        score += 8

    # --- Duración: comparar con la duración conocida de Deezer ---
    if target_duration and target_duration > 0:
        yt_dur = int(candidate.get("duration") or 0)
        if yt_dur > 0:
            diff_pct = abs(yt_dur - target_duration) / target_duration
            if diff_pct <= 0.10:
                score += 25
            elif diff_pct <= 0.20:
                score += 10
            elif diff_pct >= 0.40:
                score -= 30

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
        score += 12
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
            break

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
        score -= 12
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


def confidence_from_score(score: int) -> str:
    """Convierte un score a etiqueta de confianza."""
    if score >= 120:
        return "alta"
    if score >= 90:
        return "media"
    return "baja"
