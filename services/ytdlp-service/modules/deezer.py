import asyncio
import re
from typing import Any

import httpx

from config import DEEZER_BASE


async def dz_get(path: str) -> dict[str, Any]:
    """Realiza un GET a la API de Deezer."""
    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.get(f"{DEEZER_BASE}{path}")
        res.raise_for_status()
        return res.json()


async def dz_get_many(paths: list[str]) -> list[dict[str, Any]]:
    """Realiza múltiples GETs a Deezer en paralelo."""
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


def clean_album_title(title: str) -> str:
    """Limpia títulos de álbumes eliminando sufijos innecesarios."""
    normalized = re.sub(r"\s+", " ", title or "")
    normalized = re.sub(
        r"\b(opening|ending)\s+theme\s+song\b", "", normalized, flags=re.I
    )
    normalized = re.sub(r"\b(opening|ending)\s+theme\b", "", normalized, flags=re.I)
    normalized = re.sub(r"\btheme\s+song\b", "", normalized, flags=re.I)
    normalized = re.sub(
        r"\b(ost|original soundtrack|soundtrack)\b", "", normalized, flags=re.I
    )
    normalized = re.sub(r"\s+", " ", normalized).strip()
    parts = re.split(r"\s[-–—:]\s", normalized)
    if len(parts) > 1:
        suffix = " - ".join(parts[1:])
        if re.search(
            r"(opening|ending|theme|ost|soundtrack|season|anime|ver\.?|version)",
            suffix,
            re.I,
        ):
            normalized = parts[0].strip() or normalized
    return normalized or title or "Unknown"


def transform_track(item: dict[str, Any]) -> dict[str, Any]:
    """Transforma un track de Deezer al formato canónico."""
    canonical_title = item.get("title_short") or item.get("title") or "Unknown"
    album = item.get("album") or {}
    artist = item.get("artist") or {}
    return {
        "id": f"dz-{item['id']}",
        "deezerId": item["id"],
        "title": item.get("title") or canonical_title,
        "canonicalTitle": canonical_title,
        "canonicalAlbum": clean_album_title(album.get("title") or "Unknown"),
        "artist": artist.get("name") or "Unknown",
        "album": album.get("title") or "Unknown",
        "duration": item.get("duration") or 0,
        "cover": album.get("cover_big")
        or album.get("cover_medium")
        or album.get("cover_small")
        or "",
        "coverSmall": album.get("cover_medium") or album.get("cover_small") or "",
        "coverXL": album.get("cover_xl") or album.get("cover_big") or "",
        "preview": item.get("preview") or "",
        "artistId": artist.get("id"),
        "albumId": album.get("id"),
        "rank": item.get("rank"),
    }


def transform_artist(item: dict[str, Any]) -> dict[str, Any]:
    """Transforma un artista de Deezer al formato canónico."""
    return {
        "id": f"dz-artist-{item['id']}",
        "deezerId": item["id"],
        "name": item.get("name") or "Unknown",
        "picture": item.get("picture_xl")
        or item.get("picture_big")
        or item.get("picture_medium")
        or "",
        "pictureSmall": item.get("picture_medium") or item.get("picture_small") or "",
        "pictureXL": item.get("picture_xl") or item.get("picture_big") or "",
        "fans": item.get("nb_fan") or 0,
    }


def transform_album(item: dict[str, Any]) -> dict[str, Any]:
    """Transforma un álbum de Deezer al formato canónico."""
    artist = item.get("artist") or {}
    return {
        "id": f"dz-album-{item['id']}",
        "deezerId": item["id"],
        "title": item.get("title") or "Unknown",
        "artist": artist.get("name") or "Unknown",
        "artistId": artist.get("id"),
        "cover": item.get("cover_big")
        or item.get("cover_medium")
        or item.get("cover_small")
        or "",
        "coverSmall": item.get("cover_medium") or item.get("cover_small") or "",
        "coverXL": item.get("cover_xl") or item.get("cover_big") or "",
        "releaseDate": item.get("release_date"),
        "genre": (
            (item.get("genres") or {}).get("data", [{}])[0].get("name")
            if (item.get("genres") or {}).get("data")
            else None
        ),
    }
