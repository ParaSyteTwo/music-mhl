from typing import Any

from fastapi import FastAPI, Header, HTTPException, Query

from modules.auth import require_service_key
from modules.search import build_candidate_queries, classify_candidate, confidence_from_score, score_candidate, search_candidates


def register_search_routes(app: FastAPI) -> None:
    """Registra las rutas de búsqueda en YouTube."""

    @app.get("/search")
    async def search(
        q: str = Query(..., min_length=2),
        authorization: str | None = Header(default=None),
    ) -> dict[str, Any]:
        """Búsqueda simple en YouTube."""
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
        """Busca múltiples candidatos con scoring basado en datos de Deezer."""
        require_service_key(authorization)

        title = str(payload.get("title") or "").strip()
        artist = str(payload.get("artist") or "").strip()
        album = str(payload.get("album") or "").strip()
        duration = int(payload.get("duration") or 0)

        if not title or not artist:
            raise HTTPException(
                status_code=400, detail="title and artist are required"
            )

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
                    merged.values(),
                    key=lambda x: int(x["score"]),
                    reverse=True,
                )
                if (
                    ranked
                    and ranked[0].get("confidence") == "alta"
                    and len(ranked) >= 2
                ):
                    return {"success": True, "candidates": ranked[:3]}
                if (
                    query_index >= 1
                    and ranked
                    and ranked[0].get("confidence") != "baja"
                ):
                    return {"success": True, "candidates": ranked[:3]}
        except Exception as exc:
            raise HTTPException(
                status_code=502,
                detail=f"Error al buscar candidatos en YouTube: {exc}",
            ) from exc

        scored = sorted(
            merged.values(), key=lambda x: int(x["score"]), reverse=True
        )[:3]

        return {"success": True, "candidates": scored}
