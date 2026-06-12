"""Anime metadata client.

Wraps two public GraphQL sources:

* AniList (`https://graphql.anilist.co`) — anime metadata: cover, type,
  episodes, year, synopsis. No auth, no rate-limit aggressive for personal
  use.
* animethemes.moe (`https://api.animethemes.moe/graphql`) — curated list of
  OP/ED themes with verified YouTube video IDs.

Both are accessed through :mod:`httpx` (already in ``requirements.txt``).
The module exposes pure-async helpers that the FastAPI layer
(``routes/anime.py``) composes. No HTTP server concerns leak here.
"""

from __future__ import annotations

import asyncio
import logging
import re
from dataclasses import dataclass

import httpx


logger = logging.getLogger(__name__)


ANILIST_ENDPOINT = "https://graphql.anilist.co"
ANIMETHEMES_ENDPOINT = "https://api.animethemes.moe/graphql"

# Conservative timeouts — both backends are small GraphQL services.
_DEFAULT_TIMEOUT = 10.0

# Retry policy: back off on 429 (rate limit) and 5xx (server hiccups).
_MAX_RETRIES = 3
_BACKOFF_BASE = 0.5  # seconds; 0.5, 1.0, 2.0
_BACKOFF_STATUS = {429, 500, 502, 503, 504}

_HTML_TAG_RE = re.compile(r"<[^>]+>")


@dataclass(slots=True)
class Anime:
    """Anime metadata snapshot, normalised for the frontend."""

    id: int
    title_romaji: str
    title_english: str | None
    title_native: str | None
    cover: str
    type: str
    episodes: int | None
    year: int | None
    synopsis: str | None


@dataclass(slots=True)
class AnimeTheme:
    """Single OP/ED theme with its YouTube source."""

    anime_id: int
    type: str  # "OP" | "ED"
    sequence: int
    title: str
    artist: str
    episodes_from: int | None
    episodes_to: int | None
    video_id: str
    video_url: str


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _strip_html(text: str | None) -> str | None:
    """Remove HTML tags from a description snippet. AniList sends escaped HTML."""
    if not text:
        return None
    cleaned = _HTML_TAG_RE.sub("", text)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned or None


def _normalise_cover(cover: dict[str, str | None] | None) -> str:
    """Pick the largest available cover URL, falling back to empty string."""
    if not cover:
        return ""
    return (
        cover.get("extraLarge")
        or cover.get("large")
        or cover.get("medium")
        or cover.get("color")
        or ""
    )


def _normalise_title(title: dict[str, str | None] | None) -> tuple[str, str | None, str | None]:
    """Return (romaji, english, native) — romaji is always present."""
    title = title or {}
    romaji = (title.get("romaji") or title.get("english") or title.get("native") or "").strip()
    english = title.get("english") or None
    native = title.get("native") or None
    return romaji, english, native


def _episode_range(entries: list[dict] | None) -> tuple[int | None, int | None]:
    """Flatten an animethemes entry's episodes[] → (first, last)."""
    if not entries:
        return None, None
    numbers: list[int] = []
    for ep in entries:
        if not isinstance(ep, dict):
            continue
        name = ep.get("name")
        if not name:
            continue
        match = re.search(r"\d+", str(name))
        if match:
            try:
                numbers.append(int(match.group(0)))
            except ValueError:
                continue
    if not numbers:
        return None, None
    return min(numbers), max(numbers)


def _youtube_id_from_basename(basename: str | None) -> str | None:
    """animethemes stores YouTube basenames like 'watch?v=ABC123' or 'ABC123'."""
    if not basename:
        return None
    value = str(basename).strip()
    if not value:
        return None
    if "watch?v=" in value:
        value = value.split("watch?v=", 1)[1]
    value = value.split("&", 1)[0]
    return value.strip() or None


async def _graphql_request(
    client: httpx.AsyncClient,
    endpoint: str,
    query: str,
    variables: dict[str, object],
) -> dict:
    """POST a GraphQL payload with exponential-backoff retries on 429/5xx."""
    payload = {"query": query, "variables": variables}
    last_exc: Exception | None = None

    for attempt in range(1, _MAX_RETRIES + 1):
        try:
            response = await client.post(endpoint, json=payload)
        except httpx.HTTPError as exc:
            last_exc = exc
            logger.warning(
                "GraphQL POST to %s failed (attempt %d/%d): %s",
                endpoint,
                attempt,
                _MAX_RETRIES,
                exc,
            )
            await asyncio.sleep(_BACKOFF_BASE * (2 ** (attempt - 1)))
            continue

        if response.status_code in _BACKOFF_STATUS:
            last_exc = httpx.HTTPStatusError(
                f"{response.status_code} from {endpoint}",
                request=response.request,
                response=response,
            )
            logger.warning(
                "GraphQL POST to %s returned %d (attempt %d/%d)",
                endpoint,
                response.status_code,
                attempt,
                _MAX_RETRIES,
            )
            if attempt < _MAX_RETRIES:
                await asyncio.sleep(_BACKOFF_BASE * (2 ** (attempt - 1)))
            continue

        # Non-retriable — surface as exception so callers see a clear error.
        response.raise_for_status()
        data = response.json()
        if "errors" in data and data["errors"]:
            raise RuntimeError(
                f"GraphQL error from {endpoint}: {data['errors'][0].get('message')}"
            )
        return data.get("data") or {}

    # Exhausted retries
    raise RuntimeError(
        f"GraphQL POST to {endpoint} failed after {_MAX_RETRIES} attempts: {last_exc}"
    )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def search_anime(query: str, limit: int = 10) -> list[Anime]:
    """Search AniList by free-text query. Returns up to ``limit`` matches.

    An empty/whitespace query raises ``ValueError`` — routes should validate
    this before calling.
    """
    if not query or not query.strip():
        raise ValueError("query must not be empty")

    per_page = max(1, min(int(limit), 25))  # AniList caps perPage reasonably
    graphql_query = """
    query ($search: String!, $perPage: Int!) {
      Page(perPage: $perPage) {
        media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
          id
          title { romaji english native }
          coverImage { extraLarge large color }
          type
          episodes
          startDate { year }
          description
        }
      }
    }
    """

    async with httpx.AsyncClient(timeout=_DEFAULT_TIMEOUT) as client:
        data = await _graphql_request(
            client, ANILIST_ENDPOINT, graphql_query, {"search": query, "perPage": per_page}
        )

    media = ((data.get("Page") or {}).get("media")) or []
    results: list[Anime] = []
    for item in media:
        if not isinstance(item, dict):
            continue
        romaji, english, native = _normalise_title(item.get("title"))
        if not romaji:
            # AniList guarantees at least one title variant, but stay defensive.
            continue
        start_date = item.get("startDate") or {}
        year_raw = start_date.get("year")
        year = int(year_raw) if isinstance(year_raw, int) else None
        episodes_raw = item.get("episodes")
        episodes = int(episodes_raw) if isinstance(episodes_raw, int) else None
        results.append(
            Anime(
                id=int(item.get("id") or 0),
                title_romaji=romaji,
                title_english=english,
                title_native=native,
                cover=_normalise_cover(item.get("coverImage")),
                type=str(item.get("type") or "TV"),
                episodes=episodes,
                year=year,
                synopsis=_strip_html(item.get("description")),
            )
        )
    return results


async def get_anime_themes(anilist_id: int) -> list[AnimeTheme]:
    """Fetch OP/ED themes for an AniList id via the animethemes.moe mirror.

    Resolves the AniList id → animethemes slug by matching the canonical
    title. When the mirror has no entry for that anime, returns ``[]``.
    """
    if not isinstance(anilist_id, int) or anilist_id <= 0:
        raise ValueError("anilist_id must be a positive integer")

    async with httpx.AsyncClient(timeout=_DEFAULT_TIMEOUT) as client:
        # Step 1: resolve the AniList id into a title we can search animethemes with.
        anilist_meta = await _fetch_anilist_meta(client, anilist_id)
        if anilist_meta is None:
            return []
        romaji, english, _native = _normalise_title(anilist_meta.get("title"))
        search_name = english or romaji
        if not search_name:
            return []

        # Step 2: ask animethemes for the anime by name (best match).
        anime_node = await _search_animethemes_anime(client, search_name)
        if anime_node is None:
            return []

        anime_id = anime_node.get("id")
        if not isinstance(anime_id, int):
            return []

        # Step 3: pull the themes for that anime node.
        themes = await _fetch_animethemes_themes(client, anime_id)
        return _shape_themes(themes, anilist_id)


async def _fetch_anilist_meta(
    client: httpx.AsyncClient, anilist_id: int
) -> dict | None:
    """Single-anime lookup by AniList id (used to seed the slug search)."""
    graphql_query = """
    query ($id: Int!) {
      Media(id: $id, type: ANIME) {
        id
        title { romaji english native }
      }
    }
    """
    data = await _graphql_request(
        client, ANILIST_ENDPOINT, graphql_query, {"id": anilist_id}
    )
    return data.get("Media") or None


async def _search_animethemes_anime(
    client: httpx.AsyncClient, name: str
) -> dict | None:
    """Search animethemes for an anime by name; return the best match or None."""
    graphql_query = """
    query ($search: String!) {
      search(limit: 1, page: 1, search: { name: $search }) {
        anime { id name slug }
      }
    }
    """
    data = await _graphql_request(
        client, ANIMETHEMES_ENDPOINT, graphql_query, {"search": name}
    )
    results = ((data.get("search") or {}).get("anime")) or []
    if not results:
        return None
    first = results[0]
    if not isinstance(first, dict):
        return None
    return first


async def _fetch_animethemes_themes(
    client: httpx.AsyncClient, anime_id: int
) -> list[dict]:
    """Pull the full theme list for an animethemes anime id."""
    graphql_query = """
    query ($id: Int!) {
      findAnimeById(id: $id) {
        id
        slug
        name
        themes {
          id
          type
          sequence
          entries {
            id
            version
            episodes { name }
            videos {
              id
              basename
              audio { id basename }
            }
          }
        }
      }
    }
    """
    data = await _graphql_request(
        client, ANIMETHEMES_ENDPOINT, graphql_query, {"id": anime_id}
    )
    anime = data.get("findAnimeById") or {}
    themes = anime.get("themes") or []
    return [t for t in themes if isinstance(t, dict)]


def _shape_themes(raw_themes: list[dict], anilist_id: int) -> list[AnimeTheme]:
    """Normalise the animethemes theme list into ``AnimeTheme`` dataclasses."""
    shaped: list[AnimeTheme] = []
    for theme in raw_themes:
        theme_type = str(theme.get("type") or "").upper()
        if theme_type not in {"OP", "ED"}:
            continue
        try:
            sequence = int(theme.get("sequence") or 0)
        except (TypeError, ValueError):
            sequence = 0

        entries = theme.get("entries") or []
        for entry in entries:
            if not isinstance(entry, dict):
                continue
            videos = entry.get("videos") or []
            for video in videos:
                if not isinstance(video, dict):
                    continue
                # Must have both video and audio links (audio = YouTube mirror).
                if not video.get("audio"):
                    continue
                video_id = _youtube_id_from_basename(video.get("basename"))
                if not video_id:
                    continue
                eps_from, eps_to = _episode_range(entry.get("episodes"))
                shaped.append(
                    AnimeTheme(
                        anime_id=anilist_id,
                        type=theme_type,
                        sequence=sequence,
                        title=theme.get("title") or f"{theme_type} {sequence}",
                        artist=entry.get("version") or "",
                        episodes_from=eps_from,
                        episodes_to=eps_to,
                        video_id=video_id,
                        video_url=f"https://www.youtube.com/watch?v={video_id}",
                    )
                )
    return shaped
