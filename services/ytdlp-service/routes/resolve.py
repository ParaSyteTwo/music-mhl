from typing import Any

from fastapi import FastAPI, Header, HTTPException

from modules.auth import build_token, require_service_key
from modules.cache import cache_get, cache_key, cache_set
from modules.search import score_candidate, search_candidates
from modules.utils import sanitize_filename


def register_resolve_routes(app: FastAPI) -> None:
    """Registra las rutas de resolución de canciones."""

    @app.post("/resolve")
    async def resolve(
        payload: dict[str, Any],
        authorization: str | None = Header(default=None),
    ) -> dict[str, Any]:
        """Resuelve una canción de Deezer a un videoId de YouTube con token firmado."""
        require_service_key(authorization)

        title = str(payload.get("title") or "").strip()
        artist = str(payload.get("artist") or "").strip()
        album = str(payload.get("album") or "").strip()
        format_name = str(payload.get("format") or "mp3").strip().lower()
        duration = int(payload.get("duration") or 0)

        if not title or not artist:
            raise HTTPException(
                status_code=400, detail="title and artist are required"
            )
        if format_name not in {"mp3", "aac"}:
            raise HTTPException(
                status_code=400, detail="format must be mp3 or aac"
            )

        _cache_key = cache_key(title, artist)
        cached = cache_get(_cache_key)

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
            key=lambda item: score_candidate(
                item, title, artist, album, duration
            ),
        )
        cache_set(_cache_key, chosen["videoId"], chosen)

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
