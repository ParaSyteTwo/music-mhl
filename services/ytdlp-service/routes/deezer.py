from typing import Any

from fastapi import FastAPI, Header, HTTPException

from modules.auth import require_service_key
from modules.deezer import (
    dz_get,
    dz_get_many,
    transform_album,
    transform_artist,
    transform_track,
)


def register_deezer_routes(app: FastAPI) -> None:
    """Registra las rutas del proxy Deezer."""

    @app.post("/deezer")
    async def deezer_proxy(
        payload: dict[str, Any],
        authorization: str | None = Header(default=None),
    ) -> dict[str, Any]:
        """Proxy a la API de Deezer con transformación de datos."""
        require_service_key(authorization)
        action = str(payload.get("action") or "search")

        try:
            if action == "search":
                q = str(payload.get("query") or "").strip()[:200]
                limit = min(int(payload.get("limit") or 25), 50)
                offset = int(payload.get("offset") or 0)
                if not q:
                    raise HTTPException(
                        status_code=400, detail="query is required"
                    )
                data = await dz_get(f"/search?q={q}&limit={limit}&index={offset}")
                return {
                    "success": True,
                    "tracks": [
                        transform_track(t) for t in data.get("data") or []
                    ],
                    "total": data.get("total") or 0,
                }

            if action == "searchAll":
                q = str(payload.get("query") or "").strip()[:200]
                if not q:
                    raise HTTPException(
                        status_code=400, detail="query is required"
                    )
                tracks_d, artists_d, albums_d = await dz_get_many(
                    [
                        f"/search?q={q}&limit=10",
                        f"/search/artist?q={q}&limit=5",
                        f"/search/album?q={q}&limit=5",
                    ]
                )
                return {
                    "success": True,
                    "tracks": [
                        transform_track(t) for t in tracks_d.get("data") or []
                    ],
                    "artists": [
                        transform_artist(a) for a in artists_d.get("data") or []
                    ],
                    "albums": [
                        transform_album(a) for a in albums_d.get("data") or []
                    ],
                }

            if action == "artist":
                artist_id = payload.get("artistId")
                if not artist_id:
                    raise HTTPException(
                        status_code=400, detail="artistId is required"
                    )
                info_d, top_d, albums_d, related_d = await dz_get_many(
                    [
                        f"/artist/{artist_id}",
                        f"/artist/{artist_id}/top?limit=10",
                        f"/artist/{artist_id}/albums?limit=10",
                        f"/artist/{artist_id}/related?limit=8",
                    ]
                )
                return {
                    "success": True,
                    "info": {
                        "id": info_d["id"],
                        "name": info_d["name"],
                        "picture": info_d.get("picture_xl")
                        or info_d.get("picture_big")
                        or "",
                        "fans": info_d.get("nb_fan") or 0,
                    },
                    "topTracks": [
                        transform_track(t) for t in top_d.get("data") or []
                    ],
                    "albums": [
                        transform_album(a) for a in albums_d.get("data") or []
                    ],
                    "related": [
                        transform_artist(a) for a in related_d.get("data") or []
                    ],
                }

            if action == "album":
                album_id = payload.get("albumId")
                if not album_id:
                    raise HTTPException(
                        status_code=400, detail="albumId is required"
                    )
                album_d = await dz_get(f"/album/{album_id}")
                artist_albums_d = await dz_get(
                    f"/artist/{album_d['artist']['id']}/albums?limit=20"
                )
                return {
                    "success": True,
                    "album": {
                        "id": album_d["id"],
                        "title": album_d.get("title") or "",
                        "cover": album_d.get("cover_xl")
                        or album_d.get("cover_big")
                        or album_d.get("cover_medium")
                        or "",
                        "artist": {
                            "id": album_d["artist"]["id"],
                            "name": album_d["artist"]["name"],
                        },
                        "releaseDate": album_d.get("release_date"),
                        "trackCount": album_d.get("nb_tracks") or 0,
                        "tracks": [
                            transform_track(t)
                            for t in (album_d.get("tracks") or {}).get(
                                "data"
                            )
                            or []
                        ],
                        "genre": (
                            (
                                (album_d.get("genres") or {}).get("data")
                                or [{}]
                            )[0].get("name")
                            if (album_d.get("genres") or {}).get("data")
                            else None
                        ),
                    },
                    "moreByArtist": [
                        transform_album(a)
                        for a in (artist_albums_d.get("data") or [])
                        if a["id"] != album_id
                    ][:4],
                }

            if action == "trackMeta":
                track_id = payload.get("trackId")
                if not track_id:
                    raise HTTPException(
                        status_code=400, detail="trackId is required"
                    )
                track_d = await dz_get(f"/track/{track_id}")
                album_id = (track_d.get("album") or {}).get("id")
                track_number = track_d.get("track_position")
                release_date: str | None = track_d.get("release_date")
                year = (
                    int(release_date.split("-")[0]) if release_date else None
                )
                genre = None
                if album_id:
                    try:
                        album_d = await dz_get(f"/album/{album_id}")
                        genre = (
                            (
                                (album_d.get("genres") or {}).get("data")
                                or [{}]
                            )[0].get("name")
                            if (album_d.get("genres") or {}).get("data")
                            else None
                        )
                    except Exception:
                        pass
                return {
                    "success": True,
                    "genre": genre,
                    "year": year,
                    "trackNumber": track_number,
                }

            if action == "home":
                genre_ids = [132, 116, 152, 106, 165, 197]
                genre_names = {
                    132: "Pop",
                    116: "Rap",
                    152: "Rock",
                    106: "Electronic",
                    165: "R&B",
                    197: "Latin",
                }
                paths = [
                    "/chart/0/tracks?limit=20",
                    "/genre",
                    "/chart/0/artists?limit=12",
                    "/chart/0/albums?limit=12",
                    *[
                        f"/chart/{gid}/tracks?limit=10" for gid in genre_ids
                    ],
                ]
                results = await dz_get_many(paths)
                (
                    top_tracks_d,
                    genres_d,
                    artists_d,
                    albums_d,
                    *genre_tracks,
                ) = results
                by_genre = {
                    genre_names[gid]: {
                        "genreId": gid,
                        "tracks": [
                            transform_track(t)
                            for t in (
                                genre_tracks[i].get("data") or []
                            )
                        ],
                    }
                    for i, gid in enumerate(genre_ids)
                }
                return {
                    "success": True,
                    "topTracks": [
                        transform_track(t)
                        for t in top_tracks_d.get("data") or []
                    ],
                    "genres": [
                        {
                            "id": g["id"],
                            "name": g["name"],
                            "picture": g.get("picture_xl")
                            or g.get("picture_big")
                            or g.get("picture_medium")
                            or "",
                        }
                        for g in (genres_d.get("data") or [])[:50]
                    ],
                    "byGenre": by_genre,
                    "trendingArtists": [
                        transform_artist(a)
                        for a in artists_d.get("data") or []
                    ],
                    "newAlbums": [
                        transform_album(a) for a in albums_d.get("data") or []
                    ],
                }

            if action == "genre":
                genre_id = payload.get("genreId")
                if not genre_id:
                    raise HTTPException(
                        status_code=400, detail="genreId is required"
                    )
                data = await dz_get(f"/chart/{genre_id}/tracks?limit=25")
                tracks = [transform_track(t) for t in data.get("data") or []]
                return {
                    "success": True,
                    "tracks": tracks,
                    "total": data.get("total") or len(tracks),
                }

            raise HTTPException(
                status_code=400, detail=f"Unknown action: {action}"
            )

        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(
                status_code=502, detail=f"Deezer error: {exc}"
            ) from exc
