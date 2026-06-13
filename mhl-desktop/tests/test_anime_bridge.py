"""Pytest suite for the anime bridge methods on ``bridge.Bridge``.

We mock ``requests.post`` so the tests never touch the network. The
tests cover the public contract:

* ``anime_search`` POSTs to AniList and returns parsed results.
* ``anime_search`` rejects empty queries with a typed error.
* ``anime_get_themes`` walks the 3-step resolution (id → title →
  animethemes anime id → themes) and returns parsed themes.
* Non-2xx responses, 429s, 500s and timeouts are all surfaced as
  ``{"success": False, "error": "..."}`` — never propagated as
  unhandled exceptions.
"""
from __future__ import annotations

import json
from contextlib import contextmanager
from unittest.mock import MagicMock, patch

import pytest
import requests

from bridge import Bridge


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _anilist_search_payload(media: list[dict]) -> dict:
    return {"data": {"Page": {"media": media}}}


def _anilist_meta_payload(media: dict | None) -> dict:
    return {"data": {"Media": media}}


def _animethemes_search_payload(anime_list: list[dict]) -> dict:
    return {"data": {"search": {"anime": anime_list}}}


def _animethemes_themes_payload(anime_node: dict | None) -> dict:
    return {"data": {"findAnimeById": anime_node}}


def _mock_response(json_body: dict, status_code: int = 200) -> MagicMock:
    """Build a ``requests.Response``-like mock with ``.json()`` and ``.ok``."""
    response = MagicMock(spec=requests.Response)
    response.status_code = status_code
    response.ok = 200 <= status_code < 300
    response.json.return_value = json_body
    response.raise_for_status.side_effect = (
        None if response.ok else requests.HTTPError(f"{status_code} error")
    )
    return response


def _naruto_media() -> dict:
    return {
        "id": 20,
        "title": {
            "romaji": "Naruto",
            "english": "Naruto",
            "native": "ナルト",
        },
        "coverImage": {
            "extraLarge": "https://img.anilist.co/large/naruto.jpg",
            "large": "https://img.anilist.co/large/naruto.jpg",
            "color": "#ff9933",
        },
        "type": "TV",
        "episodes": 220,
        "startDate": {"year": 2002},
        "description": "<p>A young ninja...</p>",
    }


def _bleach_media() -> dict:
    return {
        "id": 269,
        "title": {"romaji": "Bleach", "english": "Bleach", "native": "ブリーチ"},
        "coverImage": {"extraLarge": "https://img.anilist.co/large/bleach.jpg"},
        "type": "TV",
        "episodes": 366,
        "startDate": {"year": 2004},
        "description": None,
    }


# ---------------------------------------------------------------------------
# anime_search
# ---------------------------------------------------------------------------


def test_anime_search_calls_anilist_and_parses_results():
    """``anime_search('naruto', 5)`` should hit AniList GraphQL and return parsed results."""
    response = _mock_response(_anilist_search_payload([_naruto_media()]))
    bridge = Bridge()

    with patch("bridge.requests.post", return_value=response) as mock_post:
        result = bridge.anime_search("naruto", 5)

    # Contract: success + results
    assert result["success"] is True
    assert isinstance(result["results"], list)
    assert len(result["results"]) == 1

    item = result["results"][0]
    # Cross-track contract: the JS AnimeCard consumer (src/types/anime.ts:Anime)
    # reads camelCase keys. The bridge must emit exactly the keys declared in
    # that interface, not the Python dataclass snake_case fields.
    assert set(item.keys()) == {
        "id",
        "titleRomaji",
        "titleEnglish",
        "titleNative",
        "cover",
        "type",
        "episodes",
        "year",
        "synopsis",
    }
    assert item["id"] == 20
    assert item["titleRomaji"] == "Naruto"
    assert item["titleEnglish"] == "Naruto"
    assert item["titleNative"] == "ナルト"
    assert item["cover"] == "https://img.anilist.co/large/naruto.jpg"
    assert item["type"] == "TV"
    assert item["episodes"] == 220
    assert item["year"] == 2002
    assert item["synopsis"] == "A young ninja..."

    # The POST went to AniList with the right payload and timeout
    mock_post.assert_called_once()
    call = mock_post.call_args
    assert call.args[0] == "https://graphql.anilist.co"
    assert call.kwargs["timeout"] == 10
    payload = call.kwargs["json"]
    assert payload["variables"] == {"search": "naruto", "perPage": 5}
    assert "Page" in payload["query"]


def test_anime_search_handles_multiple_results_and_falls_back_through_cover_sizes():
    """Cover sizing should fall through extraLarge → large → medium → color."""
    media = [
        _naruto_media(),
        {**_bleach_media(), "coverImage": {"medium": "https://img/bleach-medium.jpg"}},
    ]
    response = _mock_response(_anilist_search_payload(media))
    bridge = Bridge()

    with patch("bridge.requests.post", return_value=response):
        result = bridge.anime_search("n", 10)

    assert result["success"] is True
    assert [r["titleRomaji"] for r in result["results"]] == ["Naruto", "Bleach"]
    assert result["results"][1]["cover"] == "https://img/bleach-medium.jpg"


def test_anime_search_empty_query_returns_typed_error_without_calling_post():
    """``anime_search('')`` must NOT hit the network — it's a validation error."""
    bridge = Bridge()

    with patch("bridge.requests.post") as mock_post:
        result = bridge.anime_search("", 5)

    assert result == {"success": False, "error": "query must not be empty"}
    mock_post.assert_not_called()


def test_anime_search_whitespace_query_returns_typed_error_without_calling_post():
    """Whitespace-only query is also rejected before the network call."""
    bridge = Bridge()

    with patch("bridge.requests.post") as mock_post:
        result = bridge.anime_search("   ", 5)

    assert result == {"success": False, "error": "query must not be empty"}
    mock_post.assert_not_called()


def test_anime_search_anilist_500_returns_typed_error_not_exception():
    """A 500 from AniList must be wrapped — no unhandled HTTPError propagation."""
    response = _mock_response(
        {"errors": [{"message": "Internal server error"}]}, status_code=500
    )
    bridge = Bridge()

    with patch("bridge.requests.post", return_value=response):
        result = bridge.anime_search("naruto", 5)

    assert result["success"] is False
    assert "error" in result
    assert isinstance(result["error"], str)
    assert result["error"]  # non-empty


def test_anime_search_anilist_429_returns_typed_error():
    """A 429 (rate limit) from AniList must be wrapped — no unhandled exception."""
    response = _mock_response(
        {"errors": [{"message": "Too Many Requests"}]}, status_code=429
    )
    bridge = Bridge()

    with patch("bridge.requests.post", return_value=response):
        result = bridge.anime_search("naruto", 5)

    assert result["success"] is False
    assert "429" in result["error"] or "Too Many" in result["error"]


def test_anime_search_timeout_returns_typed_error():
    """A network timeout must be wrapped — no unhandled ``Timeout`` exception."""
    bridge = Bridge()

    with patch(
        "bridge.requests.post",
        side_effect=requests.Timeout("read timed out after 10s"),
    ):
        result = bridge.anime_search("naruto", 5)

    assert result["success"] is False
    assert "timed out" in result["error"].lower()


def test_anime_search_connection_error_returns_typed_error():
    """A network connection error must be wrapped — no unhandled ``ConnectionError``."""
    bridge = Bridge()

    with patch(
        "bridge.requests.post",
        side_effect=requests.ConnectionError("DNS failure"),
    ):
        result = bridge.anime_search("naruto", 5)

    assert result["success"] is False
    assert "DNS" in result["error"] or "failure" in result["error"].lower()


def test_anime_search_json_decode_error_returns_typed_error():
    """Malformed JSON from AniList must be wrapped — no unhandled ``JSONDecodeError``."""
    response = MagicMock(spec=requests.Response)
    response.status_code = 200
    response.ok = True
    response.raise_for_status.return_value = None
    response.json.side_effect = json.JSONDecodeError("bad", "doc", 0)
    bridge = Bridge()

    with patch("bridge.requests.post", return_value=response):
        result = bridge.anime_search("naruto", 5)

    assert result["success"] is False
    assert "error" in result


def test_anime_search_clips_limit_to_anilist_reasonable_max():
    """Internal helper must cap the perPage so a malicious limit doesn't crash AniList."""
    response = _mock_response(_anilist_search_payload([_naruto_media()]))
    bridge = Bridge()

    with patch("bridge.requests.post", return_value=response) as mock_post:
        bridge.anime_search("naruto", 9999)

    payload = mock_post.call_args.kwargs["json"]
    assert payload["variables"]["perPage"] == 25  # clipped to 25


def test_anime_search_skips_media_without_any_title():
    """Items with empty title object must be filtered out, not produce a broken entry."""
    media = [
        {"id": 1, "title": {}, "coverImage": {}, "type": "TV", "episodes": None,
         "startDate": {}, "description": None},
        _naruto_media(),
    ]
    response = _mock_response(_anilist_search_payload(media))
    bridge = Bridge()

    with patch("bridge.requests.post", return_value=response):
        result = bridge.anime_search("n", 5)

    # Only Naruto has a title; the empty-title entry is dropped
    assert [r["id"] for r in result["results"]] == [20]


# ---------------------------------------------------------------------------
# anime_get_themes
# ---------------------------------------------------------------------------


def _rest_themes_payload(themes_node):
    if not themes_node:
        return {"anime": {"animethemes": []}}
    themes = []
    for theme in themes_node.get("themes", []):
        entries = []
        for entry in theme.get("entries", []):
            videos = []
            for video in entry.get("videos", []):
                basename = video.get("basename") or "theme.webm"
                audio = video.get("audio")
                videos.append({
                    "link": f"https://v.animethemes.moe/{basename}",
                    "audio": (
                        {"link": f"https://a.animethemes.moe/{audio.get('basename')}"}
                        if isinstance(audio, dict) and audio.get("basename")
                        else None
                    ),
                })
            entries.append({
                "episodes": entry.get("episodes"),
                "videos": videos,
            })
        themes.append({
            "type": theme.get("type"),
            "sequence": theme.get("sequence"),
            "song": {
                "title": theme.get("title") or f"{theme.get('type')} {theme.get('sequence')}",
                "artists": theme.get("artists") or [],
            },
            "animethemeentries": entries,
        })
    return {"anime": {"animethemes": themes}}


@contextmanager
def _mock_theme_requests(anilist_meta, animethemes_anime_list, themes_node):
    def get_side_effect(url, **_kwargs):
        if url == "https://api.animethemes.moe/anime":
            return _mock_response({"anime": animethemes_anime_list})
        if url.startswith("https://api.animethemes.moe/anime/"):
            return _mock_response(_rest_themes_payload(themes_node))
        raise AssertionError(f"Unexpected URL: {url}")

    with (
        patch(
            "bridge.requests.post",
            return_value=_mock_response(_anilist_meta_payload(anilist_meta)),
        ),
        patch("bridge.requests.get", side_effect=get_side_effect),
    ):
        yield


def test_anime_get_themes_walks_three_step_resolution_and_parses_themes():
    """Happy path: id → title → animethemes anime id → themes."""
    naruto_meta = {
        "id": 20,
        "title": {"romaji": "Naruto", "english": "Naruto", "native": "ナルト"},
    }
    animethemes_anime = [{"id": 1, "name": "Naruto", "slug": "naruto"}]
    themes_node = {
        "id": 1,
        "slug": "naruto",
        "name": "Naruto",
        "themes": [
            {
                "id": 100,
                "type": "OP",
                "sequence": 1,
                "entries": [
                    {
                        "id": 1000,
                        "version": None,
                        "episodes": [{"name": "1"}, {"name": "2"}, {"name": "25"}],
                        "videos": [
                            {
                                "id": 1,
                                "basename": "watch?v=AAAA1111",
                                "audio": {"id": 1, "basename": "watch?v=AAAA1111"},
                            }
                        ],
                    }
                ],
            },
            {
                "id": 200,
                "type": "ED",
                "sequence": 1,
                "entries": [
                    {
                        "id": 2000,
                        "version": "v2",
                        "episodes": [{"name": "1"}],
                        "videos": [
                            {
                                "id": 2,
                                "basename": "BBBB2222",
                                "audio": {"id": 2, "basename": "BBBB2222"},
                            }
                        ],
                    }
                ],
            },
        ],
    }

    bridge = Bridge()
    with _mock_theme_requests(naruto_meta, animethemes_anime, themes_node):
        result = bridge.anime_get_themes(20)

    assert result["success"] is True
    assert isinstance(result["themes"], list)
    assert len(result["themes"]) == 2

    op1, ed1 = result["themes"]
    # Cross-track contract: the JS ThemeRow consumer (src/types/anime.ts:AnimeTheme)
    # reads camelCase keys. The bridge must emit exactly the keys declared in
    # that interface, not the Python dataclass snake_case fields.
    assert set(op1.keys()) == {
        "animeId",
        "type",
        "sequence",
        "title",
        "artist",
        "episodesFrom",
        "episodesTo",
        "audioUrl",
        "videoUrl",
    }
    assert op1["animeId"] == 20
    assert op1["type"] == "OP"
    assert op1["sequence"] == 1
    assert op1["title"] == "OP 1"  # default fallback when theme.title is None
    assert op1["audioUrl"] == "https://a.animethemes.moe/watch?v=AAAA1111"
    assert op1["videoUrl"] == "https://v.animethemes.moe/watch?v=AAAA1111"
    assert op1["episodesFrom"] == 1
    assert op1["episodesTo"] == 25

    assert ed1["type"] == "ED"
    assert ed1["artist"] == ""
    assert ed1["audioUrl"] == "https://a.animethemes.moe/BBBB2222"


def test_anime_get_themes_drops_videos_without_audio():
    """animethemes lists some videos as video-only (no audio mirror); skip them."""
    naruto_meta = {"id": 20, "title": {"romaji": "Naruto", "english": "Naruto"}}
    animethemes_anime = [{"id": 1, "name": "Naruto", "slug": "naruto"}]
    themes_node = {
        "id": 1,
        "themes": [
            {
                "id": 100,
                "type": "OP",
                "sequence": 1,
                "entries": [
                    {
                        "version": None,
                        "episodes": [{"name": "1"}],
                        "videos": [
                            {
                                "basename": "DEAD1111",
                                # No audio → video-only entry, must be skipped
                                "audio": None,
                            },
                            {
                                "basename": "LIVE1111",
                                "audio": {"basename": "LIVE1111"},
                            },
                        ],
                    }
                ],
            }
        ],
    }

    bridge = Bridge()
    with _mock_theme_requests(naruto_meta, animethemes_anime, themes_node):
        result = bridge.anime_get_themes(20)

    assert result["success"] is True
    assert len(result["themes"]) == 1
    assert result["themes"][0]["audioUrl"] == "https://a.animethemes.moe/LIVE1111"


def test_anime_get_themes_returns_empty_list_when_anilist_id_unknown():
    """If AniList returns no Media for the id, return [] (not an error)."""
    bridge = Bridge()
    with _mock_theme_requests(None, [], None):
        result = bridge.anime_get_themes(99999999)

    assert result == {"success": True, "themes": []}


def test_anime_get_themes_returns_empty_list_when_animethemes_lacks_match():
    """If animethemes search returns no anime, return []."""
    naruto_meta = {"id": 20, "title": {"romaji": "Obscure Anime", "english": None}}
    bridge = Bridge()
    with _mock_theme_requests(naruto_meta, [], None):
        result = bridge.anime_get_themes(20)

    assert result == {"success": True, "themes": []}


def test_anime_get_themes_invalid_id_zero_returns_typed_error():
    """``anime_get_themes(0)`` is a validation error — don't even try the network."""
    bridge = Bridge()
    with patch("bridge.requests.post") as mock_post:
        result = bridge.anime_get_themes(0)

    assert result == {"success": False, "error": "anilist_id must be a positive integer"}
    mock_post.assert_not_called()


def test_anime_get_themes_invalid_id_negative_returns_typed_error():
    """Negative ids are rejected before the network call."""
    bridge = Bridge()
    with patch("bridge.requests.post") as mock_post:
        result = bridge.anime_get_themes(-5)

    assert result == {"success": False, "error": "anilist_id must be a positive integer"}
    mock_post.assert_not_called()


def test_anime_get_themes_animethemes_500_returns_typed_error():
    """A 500 from animethemes must be wrapped."""
    response = _mock_response(
        {"errors": [{"message": "boom"}]}, status_code=500
    )
    bridge = Bridge()

    with patch("bridge.requests.post", return_value=response):
        result = bridge.anime_get_themes(20)

    assert result["success"] is False
    assert "error" in result


def test_anime_get_themes_animethemes_429_returns_typed_error():
    """A 429 from animethemes must be wrapped (rate-limit is a typed error)."""
    response = _mock_response(
        {"errors": [{"message": "rate limited"}]}, status_code=429
    )
    bridge = Bridge()

    with patch("bridge.requests.post", return_value=response):
        result = bridge.anime_get_themes(20)

    assert result["success"] is False
    assert "429" in result["error"] or "rate" in result["error"].lower()


def test_anime_get_themes_timeout_returns_typed_error():
    """A network timeout during themes resolution must be wrapped."""
    bridge = Bridge()

    with patch(
        "bridge.requests.post",
        side_effect=requests.Timeout("animethemes timeout"),
    ):
        result = bridge.anime_get_themes(20)

    assert result["success"] is False
    assert "timed out" in result["error"].lower() or "timeout" in result["error"].lower()


def test_anime_get_themes_connection_error_returns_typed_error():
    """A network ConnectionError must be wrapped."""
    bridge = Bridge()

    with patch(
        "bridge.requests.post",
        side_effect=requests.ConnectionError("animethemes unreachable"),
    ):
        result = bridge.anime_get_themes(20)

    assert result["success"] is False
    assert "unreachable" in result["error"].lower() or "connection" in result["error"].lower()


# ---------------------------------------------------------------------------
# Headers + timeout — defence-in-depth so a future refactor can't drop them
# ---------------------------------------------------------------------------


def test_anime_requests_carry_user_agent_and_json_content_type_headers():
    """Both endpoints must receive Content-Type and User-Agent headers."""
    captured_headers = {}

    def capture(url, **kwargs):
        captured_headers.update(kwargs.get("headers") or {})
        return _mock_response(_anilist_search_payload([_naruto_media()]))

    bridge = Bridge()
    with patch("bridge.requests.post", side_effect=capture):
        bridge.anime_search("naruto", 5)

    assert captured_headers.get("Content-Type") == "application/json"
    assert captured_headers.get("User-Agent") == "MHLMusic/1.4.3"


def test_anime_requests_always_have_timeout():
    """A missing ``timeout`` would block the bridge forever — guard against that."""
    bridge = Bridge()
    with patch("bridge.requests.post", return_value=_mock_response(
        _anilist_search_payload([_naruto_media()])
    )) as mock_post:
        bridge.anime_search("naruto", 5)

    assert mock_post.call_args.kwargs.get("timeout") == 10


# ---------------------------------------------------------------------------
# Cross-track contract regression tests
#
# These pin the public Anime / AnimeTheme response shape to the keys declared
# in src/types/anime.ts. If anyone re-introduces snake_case keys (or drops a
# field) on the Python side, the JS AnimeCard / ThemeRow consumers will render
# ``undefined`` and the bug will be silently visible to the user. These tests
# fail loudly the moment a key drifts.
#
# Why this is the E2E guarantee:
#   * The slice-level unit tests in this file mock the public dict shape, so a
#     snake_case regression in the underlying ``_anime_search`` /
#     ``_anime_shape_themes`` helpers would slip through them.
#   * The TS animeApi.test.ts mocks fetch with hand-built fixtures, so a wire
#     drift between Python and TS would not surface there either.
#   * The test below calls the real ``Bridge.anime_search`` and
#     ``Bridge.anime_get_themes`` against mocked AniList/animethemes responses
#     and asserts the EXACT key set returned to JS. A regression in either
#     helper fails these tests before the change ships.
# ---------------------------------------------------------------------------


_TS_ANIME_KEYS = {
    "id",
    "titleRomaji",
    "titleEnglish",
    "titleNative",
    "cover",
    "type",
    "episodes",
    "year",
    "synopsis",
}

_TS_THEME_KEYS = {
    "animeId",
    "type",
    "sequence",
    "title",
    "artist",
    "episodesFrom",
    "episodesTo",
    "audioUrl",
    "videoUrl",
}


def test_anime_search_response_shape_matches_ts_anime_interface():
    """``Bridge.anime_search`` must return results whose keys match
    ``src/types/anime.ts:Anime`` exactly (camelCase, no snake_case leakage).

    Regression guard for the cross-track contract: the JS AnimeCard component
    reads ``item.titleRomaji`` / ``item.titleEnglish`` directly. If the bridge
    ever emits ``title_romaji`` (Python dataclass field name), AnimeCard
    renders with empty title strings and the user sees blank cards. This test
    fails the moment a snake_case key sneaks back into the dict literal in
    ``_anime_search``.
    """
    response = _mock_response(_anilist_search_payload([_naruto_media()]))
    bridge = Bridge()

    with patch("bridge.requests.post", return_value=response):
        result = bridge.anime_search("naruto", 5)

    assert result["success"] is True
    assert len(result["results"]) == 1
    assert set(result["results"][0].keys()) == _TS_ANIME_KEYS


def test_anime_get_themes_response_shape_matches_ts_animetheme_interface():
    """``Bridge.anime_get_themes`` must return themes whose keys match
    ``src/types/anime.ts:AnimeTheme`` exactly.

    Regression guard for the cross-track contract: the JS ThemeRow component
    reads ``theme.animeId`` / ``theme.episodesFrom`` / ``theme.audioUrl``
    directly. If the bridge ever emits ``anime_id`` / ``episodes_from`` /
    ``video_id`` (Python dataclass field names), the download button is
    broken. This test fails the moment a snake_case key sneaks back into the
    dict literal in ``_anime_shape_themes``.
    """
    naruto_meta = {
        "id": 20,
        "title": {"romaji": "Naruto", "english": "Naruto", "native": "ナルト"},
    }
    animethemes_anime = [{"id": 1, "name": "Naruto", "slug": "naruto"}]
    themes_node = {
        "id": 1,
        "slug": "naruto",
        "name": "Naruto",
        "themes": [
            {
                "id": 100,
                "type": "OP",
                "sequence": 1,
                "entries": [
                    {
                        "id": 1000,
                        "version": None,
                        "episodes": [{"name": "1"}],
                        "videos": [
                            {
                                "id": 1,
                                "basename": "watch?v=AAAA1111",
                                "audio": {"id": 1, "basename": "watch?v=AAAA1111"},
                            }
                        ],
                    }
                ],
            }
        ],
    }

    bridge = Bridge()
    with _mock_theme_requests(naruto_meta, animethemes_anime, themes_node):
        result = bridge.anime_get_themes(20)

    assert result["success"] is True
    assert len(result["themes"]) == 1
    assert set(result["themes"][0].keys()) == _TS_THEME_KEYS


def test_get_raw_audio_rejects_untrusted_source_url():
    bridge = Bridge()

    result = bridge.get_raw_audio(
        None,
        "Haruka Kanata",
        "Asian Kung-Fu Generation",
        ["Haruka Kanata Asian Kung-Fu Generation"],
        source_url="https://example.com/audio.ogg",
    )

    assert result == {"success": False, "error": "Unsupported source URL"}


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
