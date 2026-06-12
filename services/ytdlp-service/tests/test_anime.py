"""Tests for the anime metadata client + FastAPI routes.

We mock the outbound HTTP via ``unittest.mock.AsyncMock`` patching
``httpx.AsyncClient.post`` — this keeps the test surface zero-dependency
and matches the project's existing test style (see test_costly_routes.py).
"""

from __future__ import annotations

import asyncio
import json
from contextlib import asynccontextmanager
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient

import modules.anime_client as anime_client
import routes.anime as anime_routes
from modules.anime_client import (
    Anime,
    AnimeTheme,
    get_anime_themes,
    search_anime,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def allow_request(monkeypatch):
    """Bypass auth + rate-limit in route tests (same as test_costly_routes)."""
    monkeypatch.setattr(anime_routes, "require_service_key", lambda _: None)
    monkeypatch.setattr(
        anime_routes,
        "check_rate_limit",
        lambda ip, scope: (True, "", None),
    )


@pytest.fixture
def app():
    return FastAPI()


def _make_response(status_code: int, json_payload: Any) -> MagicMock:
    """Build a minimal httpx.Response-shaped mock for AsyncMock return."""
    response = MagicMock()
    response.status_code = status_code
    response.json = MagicMock(return_value=json_payload)
    response.raise_for_status = MagicMock()
    if status_code >= 400:
        # Configure raise_for_status to actually raise when status is bad.
        from httpx import HTTPStatusError, Request, Response

        request = Request("POST", "https://example.invalid/")
        response.raise_for_status = MagicMock(
            side_effect=HTTPStatusError(
                "boom", request=request, response=Response(status_code)
            )
        )
    return response


def _patch_client_post(responses: list[Any]):
    """Return a context manager that swaps httpx.AsyncClient.post with a
    queue of pre-canned responses. Use as:
        with _patch_client_post([resp1, resp2]) as post_mock:
            ...
    """
    queue = list(responses)
    post_mock = AsyncMock(side_effect=queue)

    @asynccontextmanager
    async def fake_client(*_args, **_kwargs):
        yield MagicMock(post=post_mock)

    return patch.object(anime_client.httpx, "AsyncClient", fake_client), post_mock


# ---------------------------------------------------------------------------
# search_anime — parsing tests
# ---------------------------------------------------------------------------


_ANILIST_PAYLOAD = {
    "data": {
        "Page": {
            "media": [
                {
                    "id": 20,
                    "title": {
                        "romaji": "Naruto",
                        "english": "Naruto",
                        "native": "ナルト",
                    },
                    "coverImage": {
                        "extraLarge": "https://img.example/naruto-xl.jpg",
                        "large": "https://img.example/naruto-l.jpg",
                        "color": "#ff8800",
                    },
                    "type": "TV",
                    "episodes": 220,
                    "startDate": {"year": 2002},
                    "description": "<p><i>Naruto Uzumaki</i>, a <b>hyperactive</b> ninja.</p>",
                },
                {
                    "id": 21,
                    "title": {
                        "romaji": "One Piece",
                        "english": None,
                        "native": "ワンピース",
                    },
                    "coverImage": {
                        "extraLarge": "https://img.example/onepiece.jpg",
                        "large": None,
                        "color": None,
                    },
                    "type": "TV",
                    "episodes": None,
                    "startDate": {"year": 1999},
                    "description": "Monkey D. Luffy explores <b>Grand Line</b>.",
                },
            ]
        }
    }
}


def test_search_anime_parses_anilist_response():
    response = _make_response(200, _ANILIST_PAYLOAD)
    ctx, _ = _patch_client_post([response])

    with ctx:
        results = asyncio.run(search_anime("naruto", 5))

    assert len(results) == 2
    first = results[0]
    assert isinstance(first, Anime)
    assert first.id == 20
    assert first.title_romaji == "Naruto"
    assert first.title_english == "Naruto"
    assert first.title_native == "ナルト"
    assert first.cover == "https://img.example/naruto-xl.jpg"
    assert first.type == "TV"
    assert first.episodes == 220
    assert first.year == 2002
    assert first.synopsis is not None
    assert "<" not in first.synopsis and ">" not in first.synopsis
    assert "Naruto Uzumaki" in first.synopsis
    assert "hyperactive" in first.synopsis


def test_search_anime_prefers_extraLarge_cover():
    response = _make_response(200, _ANILIST_PAYLOAD)
    ctx, _ = _patch_client_post([response])

    with ctx:
        results = asyncio.run(search_anime("one piece", 5))

    # Second entry has extraLarge set, large/color null — extraLarge wins.
    second = results[1]
    assert second.cover == "https://img.example/onepiece.jpg"
    assert second.title_romaji == "One Piece"
    assert second.title_english is None
    assert second.title_native == "ワンピース"
    assert second.episodes is None
    assert second.year == 1999


def test_search_anime_falls_back_to_large_when_extraLarge_missing():
    payload = {
        "data": {
            "Page": {
                "media": [
                    {
                        "id": 999,
                        "title": {"romaji": "X", "english": None, "native": None},
                        "coverImage": {
                            "extraLarge": None,
                            "large": "https://img.example/x-l.jpg",
                            "color": None,
                        },
                        "type": "TV",
                        "episodes": 12,
                        "startDate": {"year": 2020},
                        "description": "Story",
                    }
                ]
            }
        }
    }
    response = _make_response(200, payload)
    ctx, _ = _patch_client_post([response])

    with ctx:
        results = asyncio.run(search_anime("x", 1))

    assert len(results) == 1
    assert results[0].cover == "https://img.example/x-l.jpg"


def test_search_anime_empty_query_raises():
    with pytest.raises(ValueError):
        asyncio.run(search_anime("", 5))
    with pytest.raises(ValueError):
        asyncio.run(search_anime("   ", 5))


def test_search_anime_returns_empty_list_when_page_missing():
    payload = {"data": {"Page": None}}
    response = _make_response(200, payload)
    ctx, _ = _patch_client_post([response])

    with ctx:
        results = asyncio.run(search_anime("zzz", 5))

    assert results == []


# ---------------------------------------------------------------------------
# get_anime_themes — parsing tests
# ---------------------------------------------------------------------------


_ANILIST_MEDIA_LOOKUP = {
    "data": {
        "Media": {
            "id": 20,
            "title": {
                "romaji": "Naruto",
                "english": "Naruto",
                "native": "ナルト",
            },
        }
    }
}

_ANIMETHEMES_SEARCH_HIT = {
    "data": {
        "search": {
            "anime": [
                {"id": 100, "name": "Naruto", "slug": "naruto"},
            ]
        }
    }
}

_ANIMETHEMES_THEMES_PAYLOAD = {
    "data": {
        "findAnimeById": {
            "id": 100,
            "slug": "naruto",
            "name": "Naruto",
            "themes": [
                {
                    "id": 1,
                    "type": "OP",
                    "sequence": 1,
                    "entries": [
                        {
                            "id": 11,
                            "version": None,
                            "episodes": [{"name": "1"}, {"name": "25"}],
                            "videos": [
                                {
                                    "id": 111,
                                    "basename": "watch?v=AAAA111",
                                    "audio": {"id": 211, "basename": "watch?v=AAAA111"},
                                }
                            ],
                        }
                    ],
                },
                {
                    "id": 2,
                    "type": "ED",
                    "sequence": 1,
                    "entries": [
                        {
                            "id": 12,
                            "version": "v1",
                            "episodes": [{"name": "1"}],
                            "videos": [
                                {
                                    "id": 112,
                                    "basename": "BBBB222",
                                    "audio": {"id": 212, "basename": "BBBB222"},
                                }
                            ],
                        },
                        {
                            # entry with no video at all — must be dropped
                            "id": 13,
                            "version": "v2",
                            "episodes": [{"name": "26"}],
                            "videos": [],
                        },
                        {
                            # entry with video but no audio — must be dropped
                            "id": 14,
                            "version": "v3",
                            "episodes": [{"name": "27"}],
                            "videos": [{"id": 114, "basename": "ZZZZ", "audio": None}],
                        },
                    ],
                },
            ],
        }
    }
}


def test_get_anime_themes_parses_payload():
    ctx, _ = _patch_client_post([
        _make_response(200, _ANILIST_MEDIA_LOOKUP),
        _make_response(200, _ANIMETHEMES_SEARCH_HIT),
        _make_response(200, _ANIMETHEMES_THEMES_PAYLOAD),
    ])

    with ctx:
        themes = asyncio.run(get_anime_themes(20))

    assert isinstance(themes, list)
    # OP1 + ED1 (v1) only — the entry without video and the entry without
    # audio are excluded by the filter.
    assert len(themes) == 2
    assert all(isinstance(t, AnimeTheme) for t in themes)

    op = next(t for t in themes if t.type == "OP")
    assert op.sequence == 1
    assert op.anime_id == 20
    assert op.video_id == "AAAA111"
    assert op.video_url == "https://www.youtube.com/watch?v=AAAA111"
    assert op.episodes_from == 1
    assert op.episodes_to == 25
    assert op.artist == ""  # version was None

    ed = next(t for t in themes if t.type == "ED")
    assert ed.sequence == 1
    assert ed.video_id == "BBBB222"
    assert ed.episodes_from == 1
    assert ed.episodes_to == 1
    assert ed.artist == "v1"


def test_get_anime_themes_returns_empty_when_animethemes_has_no_match():
    no_match = {"data": {"search": {"anime": []}}}
    ctx, _ = _patch_client_post([
        _make_response(200, _ANILIST_MEDIA_LOOKUP),
        _make_response(200, no_match),
    ])

    with ctx:
        themes = asyncio.run(get_anime_themes(20))

    assert themes == []


def test_get_anime_themes_rejects_invalid_id():
    with pytest.raises(ValueError):
        asyncio.run(get_anime_themes(0))
    with pytest.raises(ValueError):
        asyncio.run(get_anime_themes(-1))


def test_get_anime_themes_handles_no_themes_field():
    ctx, _ = _patch_client_post([
        _make_response(200, _ANILIST_MEDIA_LOOKUP),
        _make_response(200, _ANIMETHEMES_SEARCH_HIT),
        _make_response(200, {"data": {"findAnimeById": None}}),
    ])

    with ctx:
        themes = asyncio.run(get_anime_themes(20))

    assert themes == []


# ---------------------------------------------------------------------------
# Retry behavior
# ---------------------------------------------------------------------------


def test_search_anime_retries_on_429_up_to_three_attempts():
    rate_limited = _make_response(429, {"errors": [{"message": "rate limit"}]})
    ok = _make_response(200, _ANILIST_PAYLOAD)
    ctx, post_mock = _patch_client_post([rate_limited, rate_limited, ok])

    with ctx:
        with patch.object(anime_client.asyncio, "sleep", new=AsyncMock()):
            results = asyncio.run(search_anime("naruto", 5))

    assert len(results) == 2
    assert post_mock.call_count == 3


def test_search_anime_raises_after_three_429_responses():
    rate_limited = _make_response(429, {"errors": [{"message": "rate limit"}]})
    ctx, post_mock = _patch_client_post([rate_limited, rate_limited, rate_limited])

    with ctx:
        with patch.object(anime_client.asyncio, "sleep", new=AsyncMock()):
            with pytest.raises(RuntimeError):
                asyncio.run(search_anime("naruto", 5))

    assert post_mock.call_count == 3


def test_search_anime_retries_on_5xx():
    server_err = _make_response(503, {"errors": [{"message": "down"}]})
    ok = _make_response(200, _ANILIST_PAYLOAD)
    ctx, post_mock = _patch_client_post([server_err, ok])

    with ctx:
        with patch.object(anime_client.asyncio, "sleep", new=AsyncMock()):
            results = asyncio.run(search_anime("naruto", 5))

    assert len(results) == 2
    assert post_mock.call_count == 2


# ---------------------------------------------------------------------------
# Route tests
# ---------------------------------------------------------------------------


def _register_routes(client_app: FastAPI) -> None:
    """Register anime routes + the project-standard error envelope so test
    responses match the shape the real app produces."""

    @client_app.exception_handler(HTTPException)
    async def _http_error_handler(_, exc: HTTPException) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"success": False, "error": exc.detail},
        )

    anime_routes.register_anime_routes(client_app)


def test_search_endpoint_rejects_unauthenticated(monkeypatch, app):
    def reject_auth(_):
        from fastapi import HTTPException

        raise HTTPException(status_code=401, detail="Unauthorized")

    monkeypatch.setattr(anime_routes, "require_service_key", reject_auth)
    _register_routes(app)

    response = TestClient(app).post("/anime/search", json={"query": "naruto"})

    assert response.status_code == 401
    assert response.json()["success"] is False


def test_search_endpoint_rejects_empty_query(allow_request, app):
    _register_routes(app)

    response = TestClient(app).post("/anime/search", json={"query": ""})

    assert response.status_code == 400
    body = response.json()
    assert body["success"] is False
    assert "query" in body["error"].lower()


def test_search_endpoint_returns_results(allow_request, app, monkeypatch):
    async def fake_search_anime(query: str, limit: int = 10):
        return [
            Anime(
                id=20,
                title_romaji="Naruto",
                title_english="Naruto",
                title_native="ナルト",
                cover="https://img/n.jpg",
                type="TV",
                episodes=220,
                year=2002,
                synopsis="Synopsis",
            )
        ]

    monkeypatch.setattr(anime_routes, "search_anime", fake_search_anime)
    _register_routes(app)

    response = TestClient(app).post(
        "/anime/search", json={"query": "naruto", "limit": 5}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert len(body["results"]) == 1
    assert body["results"][0]["id"] == 20
    assert body["results"][0]["title_romaji"] == "Naruto"


def test_search_endpoint_returns_502_when_upstream_fails(
    allow_request, app, monkeypatch
):
    async def boom(query: str, limit: int = 10):
        raise RuntimeError("upstream down")

    monkeypatch.setattr(anime_routes, "search_anime", boom)
    _register_routes(app)

    response = TestClient(app).post("/anime/search", json={"query": "naruto"})

    assert response.status_code == 502
    body = response.json()
    assert body["success"] is False
    assert "upstream down" in body["error"]


def test_themes_endpoint_rejects_unauthenticated(monkeypatch, app):
    def reject_auth(_):
        from fastapi import HTTPException

        raise HTTPException(status_code=401, detail="Unauthorized")

    monkeypatch.setattr(anime_routes, "require_service_key", reject_auth)
    _register_routes(app)

    response = TestClient(app).post("/anime/themes", json={"anilist_id": 20})

    assert response.status_code == 401
    assert response.json()["success"] is False


def test_themes_endpoint_rejects_non_positive_id(allow_request, app):
    _register_routes(app)

    response = TestClient(app).post("/anime/themes", json={"anilist_id": 0})

    # Pydantic field constraint (ge=1) — FastAPI returns 422 before we get
    # to the manual check. Either way it's a clean rejection.
    assert response.status_code in (400, 422)


def test_themes_endpoint_returns_themes(allow_request, app, monkeypatch):
    async def fake_get_themes(anilist_id: int):
        return [
            AnimeTheme(
                anime_id=anilist_id,
                type="OP",
                sequence=1,
                title="Rocks",
                artist="Hound Dog",
                episodes_from=1,
                episodes_to=25,
                video_id="AAAA111",
                video_url="https://www.youtube.com/watch?v=AAAA111",
            )
        ]

    monkeypatch.setattr(anime_routes, "get_anime_themes", fake_get_themes)
    _register_routes(app)

    response = TestClient(app).post("/anime/themes", json={"anilist_id": 20})

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert len(body["themes"]) == 1
    assert body["themes"][0]["video_id"] == "AAAA111"
    assert body["themes"][0]["type"] == "OP"
    assert body["themes"][0]["sequence"] == 1


def test_themes_endpoint_returns_502_when_upstream_fails(
    allow_request, app, monkeypatch
):
    async def boom(anilist_id: int):
        raise RuntimeError("animethemes 500")

    monkeypatch.setattr(anime_routes, "get_anime_themes", boom)
    _register_routes(app)

    response = TestClient(app).post("/anime/themes", json={"anilist_id": 20})

    assert response.status_code == 502
    body = response.json()
    assert body["success"] is False
    assert "animethemes 500" in body["error"]
