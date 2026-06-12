"""Routes for anime metadata: search (AniList) + themes (animethemes.moe).

Two thin POST endpoints that proxy the public GraphQL services through the
backend. Frontend prefers these over direct calls so we can:

* Cache results centrally (added in a later slice).
* Keep a single point of failure / credential rotation.
* Hide the upstream API shape from the UI.
"""

from __future__ import annotations

from dataclasses import asdict
from typing import Any

from fastapi import FastAPI, Header, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

from modules.anime_client import Anime, AnimeTheme, get_anime_themes, search_anime
from modules.auth import require_service_key
from modules.rate_limit import check_rate_limit, get_client_ip


class AnimeSearchRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    query: str = Field(default="", max_length=200)
    limit: int = Field(default=10, ge=1, le=25)


class AnimeThemesRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    anilist_id: int = Field(ge=1, le=2_000_000_000)


def _anime_to_dict(anime: Anime) -> dict[str, Any]:
    return asdict(anime)


def _theme_to_dict(theme: AnimeTheme) -> dict[str, Any]:
    return asdict(theme)


def register_anime_routes(app: FastAPI) -> None:
    """Registra las rutas de anime en el app de FastAPI."""

    @app.post("/anime/search")
    async def anime_search(
        payload: AnimeSearchRequest,
        request: Request,
        authorization: str | None = Header(default=None),
    ) -> dict[str, Any]:
        """Search anime metadata on AniList."""
        require_service_key(authorization)
        ok, message, retry_after = check_rate_limit(get_client_ip(request))
        if not ok:
            headers = {"Retry-After": str(retry_after)} if retry_after else None
            raise HTTPException(status_code=429, detail=message, headers=headers)

        query = payload.query.strip()
        if not query:
            raise HTTPException(status_code=400, detail="query is required")

        try:
            results = await search_anime(query, payload.limit)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(
                status_code=502, detail=f"AniList search failed: {exc}"
            ) from exc

        return {
            "success": True,
            "results": [_anime_to_dict(a) for a in results],
        }

    @app.post("/anime/themes")
    async def anime_themes(
        payload: AnimeThemesRequest,
        request: Request,
        authorization: str | None = Header(default=None),
    ) -> dict[str, Any]:
        """Fetch OP/ED themes (with YouTube videoId) for an AniList anime."""
        require_service_key(authorization)
        ok, message, retry_after = check_rate_limit(get_client_ip(request))
        if not ok:
            headers = {"Retry-After": str(retry_after)} if retry_after else None
            raise HTTPException(status_code=429, detail=message, headers=headers)

        anilist_id = payload.anilist_id
        if anilist_id <= 0:
            raise HTTPException(
                status_code=400, detail="anilist_id must be positive"
            )

        try:
            themes = await get_anime_themes(anilist_id)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(
                status_code=502,
                detail=f"animethemes.moe lookup failed: {exc}",
            ) from exc

        return {
            "success": True,
            "themes": [_theme_to_dict(t) for t in themes],
        }
