"""Pytest suite for multi-season anime resolution and collection bridge methods."""
from __future__ import annotations

import json
import subprocess
from unittest.mock import MagicMock, patch

import pytest
import requests

from bridge import (
    Bridge,
    _ANILIST_BY_ID_QUERY,
    _anime_collect_seasons,
    _anime_fetch_themes_by_anilist_id,
    _anime_fetch_themes_jikan,
    _anime_search_animethemes,
    _parse_jikan_theme_entry,
)


def _mock_response(
    json_body=None,
    status_code: int = 200,
    text: str = "",
    headers: dict | None = None,
) -> MagicMock:
    response = MagicMock(spec=requests.Response)
    response.status_code = status_code
    response.ok = 200 <= status_code < 400
    response.text = text
    response.headers = headers or {}
    response.json.return_value = json_body
    response.raise_for_status.side_effect = (
        None if 200 <= status_code < 300 else requests.HTTPError(f"{status_code} error")
    )
    return response


# ---------------------------------------------------------------------------
# Jikan theme parser
# ---------------------------------------------------------------------------


def test_parse_jikan_theme_entry_full_with_japanese_duplicate_and_eps():
    parsed = _parse_jikan_theme_entry(
        '1: "Gurenge (紅蓮華)" by LiSA (eps 1-26)',
        "OP",
        default_seq=99,
    )
    assert parsed == {
        "type": "OP",
        "sequence": 1,
        "title": "Gurenge",
        "artist": "LiSA",
        "episodesFrom": 1,
        "episodesTo": 26,
    }


def test_parse_jikan_theme_entry_without_sequence_or_episodes():
    parsed = _parse_jikan_theme_entry(
        '"Idol (アイドル)" by YOASOBI',
        "OP",
        default_seq=1,
    )
    assert parsed == {
        "type": "OP",
        "sequence": 1,
        "title": "Idol",
        "artist": "YOASOBI",
        "episodesFrom": None,
        "episodesTo": None,
    }


def test_parse_jikan_theme_entry_ep_singular_and_ending():
    parsed = _parse_jikan_theme_entry(
        '2: "Kaikai Kitan" by Eve (ep 1-13)',
        "ED",
        default_seq=1,
    )
    assert parsed == {
        "type": "ED",
        "sequence": 2,
        "title": "Kaikai Kitan",
        "artist": "Eve",
        "episodesFrom": 1,
        "episodesTo": 13,
    }


def test_parse_jikan_theme_entry_edge_cases():
    # Preserves Latin parenthetical while stripping Japanese duplicate
    feat = _parse_jikan_theme_entry(
        '1: "Akuma no Ko (feat. Band) (悪魔の子)" by Ai Higuchi (ep 12)',
        "ED",
        default_seq=1,
    )
    assert feat["title"] == "Akuma no Ko (feat. Band)"
    assert feat["artist"] == "Ai Higuchi"
    assert feat["episodesFrom"] == 12
    assert feat["episodesTo"] == 12

    # Preserves pure-Japanese title when there is no Latin prefix
    jp_only = _parse_jikan_theme_entry('"紅蓮華" by LiSA (eps 1-13.5)', "OP", default_seq=1)
    assert jp_only["title"] == "紅蓮華"
    assert jp_only["episodesFrom"] == 1
    assert jp_only["episodesTo"] == 13

    # Open-ended episode range
    ongoing = _parse_jikan_theme_entry('1: "KICK BACK" by Kenshi Yonezu (eps 1-)', "OP", 1)
    assert ongoing["episodesFrom"] == 1
    assert ongoing["episodesTo"] is None

    # Empty / non-string input returns None
    assert _parse_jikan_theme_entry("", "OP", 1) is None
    assert _parse_jikan_theme_entry("   ", "ED", 1) is None
    assert _parse_jikan_theme_entry(None, "OP", 1) is None  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# Multi-season collection & anti-cycle protection
# ---------------------------------------------------------------------------


def _season_node(
    anilist_id: int,
    mal_id: int | None,
    romaji: str,
    english: str | None = None,
    fmt: str = "TV",
    year: int = 2020,
    episodes: int = 12,
    edges: list[dict] | None = None,
) -> dict:
    return {
        "id": anilist_id,
        "idMal": mal_id,
        "title": {"romaji": romaji, "english": english, "native": None},
        "format": fmt,
        "episodes": episodes,
        "startDate": {"year": year},
        "coverImage": {"extraLarge": f"https://img.anilist.co/{anilist_id}.jpg"},
        "relations": {"edges": edges or []},
    }


def test_anilist_by_id_query_requests_relations_and_mal_id():
    assert "idMal" in _ANILIST_BY_ID_QUERY
    assert "relations" in _ANILIST_BY_ID_QUERY
    assert "relationType" in _ANILIST_BY_ID_QUERY
    assert "coverImage" in _ANILIST_BY_ID_QUERY


def test_anime_collect_seasons_walks_prequel_and_sequel_ignoring_non_tv():
    s1 = _season_node(
        101, 1001, "Kimetsu no Yaiba", "Demon Slayer", year=2019, episodes=26,
        edges=[
            {"relationType": "SEQUEL", "node": {"id": 102, "idMal": 1002, "format": "TV", "title": {"romaji": "S2"}}},
            {"relationType": "SIDE_STORY", "node": {"id": 999, "idMal": 9999, "format": "OVA", "title": {"romaji": "OVA"}}},
        ],
    )
    s2 = _season_node(
        102, 1002, "Kimetsu no Yaiba: Yuukaku-hen", "Demon Slayer S2", year=2021, episodes=11,
        edges=[
            {"relationType": "PREQUEL", "node": {"id": 101, "idMal": 1001, "format": "TV", "title": {"romaji": "S1"}}},
            {"relationType": "SEQUEL", "node": {"id": 900, "idMal": 9000, "format": "MOVIE", "title": {"romaji": "Movie"}}},
            {"relationType": "SEQUEL", "node": {"id": 103, "idMal": 1003, "format": "TV", "title": {"romaji": "S3"}}},
        ],
    )
    s3 = _season_node(
        103, 1003, "Kimetsu no Yaiba: Katanakaji no Sato-hen", "Demon Slayer S3", year=2023, episodes=11,
        edges=[
            {"relationType": "PREQUEL", "node": {"id": 102, "idMal": 1002, "format": "TV", "title": {"romaji": "S2"}}},
        ],
    )
    nodes = {101: s1, 102: s2, 103: s3}

    def fake_post(_url, **kwargs):
        aid = kwargs["json"]["variables"]["id"]
        return _mock_response({"data": {"Media": nodes.get(aid)}})

    with patch("bridge.requests.post", side_effect=fake_post):
        seasons = _anime_collect_seasons(102)

    assert [s["anilistId"] for s in seasons] == [101, 102, 103]
    assert [s["seasonNumber"] for s in seasons] == [1, 2, 3]
    assert [s["malId"] for s in seasons] == [1001, 1002, 1003]
    assert [s["year"] for s in seasons] == [2019, 2021, 2023]
    assert set(seasons[0].keys()) == {
        "anilistId", "malId", "seasonNumber", "titleRomaji",
        "titleEnglish", "year", "episodes", "cover", "themes",
    }


def test_anime_collect_seasons_prevents_cycles_and_caps_at_8():
    # Cycle: 1 -> 2 -> 1
    c1 = _season_node(
        1, 10, "Cycle S1",
        edges=[{"relationType": "SEQUEL", "node": {"id": 2, "format": "TV", "title": {"romaji": "Cycle S2"}}}],
    )
    c2 = _season_node(
        2, 20, "Cycle S2",
        edges=[
            {"relationType": "PREQUEL", "node": {"id": 1, "format": "TV", "title": {"romaji": "Cycle S1"}}},
            {"relationType": "SEQUEL", "node": {"id": 1, "format": "TV", "title": {"romaji": "Cycle S1"}}},
        ],
    )
    cycle_nodes = {1: c1, 2: c2}

    with patch(
        "bridge.requests.post",
        side_effect=lambda _u, **kw: _mock_response({"data": {"Media": cycle_nodes[kw["json"]["variables"]["id"]]}}),
    ):
        seasons = _anime_collect_seasons(1)
    assert [s["anilistId"] for s in seasons] == [1, 2]

    # Long chain of 12 TV seasons must cap at 8
    long_nodes = {}
    for i in range(1, 13):
        edges = []
        if i > 1:
            edges.append({"relationType": "PREQUEL", "node": {"id": i - 1, "format": "TV", "title": {"romaji": f"S{i-1}"}}})
        if i < 12:
            edges.append({"relationType": "SEQUEL", "node": {"id": i + 1, "format": "TV", "title": {"romaji": f"S{i+1}"}}})
        long_nodes[i] = _season_node(i, 100 + i, f"Long S{i}", edges=edges)

    with patch(
        "bridge.requests.post",
        side_effect=lambda _u, **kw: _mock_response({"data": {"Media": long_nodes[kw["json"]["variables"]["id"]]}}),
    ):
        capped = _anime_collect_seasons(1)
    assert len(capped) == 8
    assert [s["seasonNumber"] for s in capped] == list(range(1, 9))


def test_anime_collect_seasons_without_relations_makes_no_extra_calls():
    minimal = {"id": 55, "title": {"romaji": "Standalone"}}
    with patch("bridge.requests.post", return_value=_mock_response({"data": {"Media": minimal}})) as mock_post:
        seasons = _anime_collect_seasons(55)
    assert mock_post.call_count == 1
    assert len(seasons) == 1
    assert seasons[0]["anilistId"] == 55
    assert seasons[0]["seasonNumber"] == 1


# ---------------------------------------------------------------------------
# Jikan → AnimeThemes by AniList ID → AnimeThemes by name fallback
# ---------------------------------------------------------------------------


def test_anime_get_themes_jikan_primary_and_animethemes_anilist_id_fallback():
    s1 = _season_node(
        201, 38000, "Kimetsu no Yaiba", "Demon Slayer", year=2019, episodes=26,
        edges=[{"relationType": "SEQUEL", "node": {"id": 202, "idMal": 47778, "format": "TV", "title": {"romaji": "Demon Slayer S2"}}}],
    )
    s2 = _season_node(
        202, 47778, "Kimetsu no Yaiba: Yuukaku-hen", "Demon Slayer: Entertainment District", year=2021, episodes=11,
        edges=[{"relationType": "PREQUEL", "node": {"id": 201, "idMal": 38000, "format": "TV", "title": {"romaji": "Demon Slayer"}}}],
    )
    nodes = {201: s1, 202: s2}

    def fake_post(_url, **kwargs):
        aid = kwargs["json"]["variables"]["id"]
        return _mock_response({"data": {"Media": nodes[aid]}})

    def fake_get(url, **kwargs):
        params = kwargs.get("params") or {}
        if url == "https://api.jikan.moe/v4/anime/38000/themes":
            return _mock_response({
                "data": {
                    "openings": ['1: "Gurenge (紅蓮華)" by LiSA (eps 1-26)'],
                    "endings": ['1: "from the edge" by FictionJunction feat. LiSA (eps 2-18)'],
                }
            })
        if url == "https://api.jikan.moe/v4/anime/47778/themes":
            # Simulate Jikan 429 rate limit → triggers fallback to AnimeThemes by AniList ID
            return _mock_response({"status": 429}, status_code=429)
        if url == "https://api.animethemes.moe/anime" and params.get("filter[site]") == "AniList":
            assert params.get("filter[external_id]") == "202"
            return _mock_response({
                "anime": [
                    {
                        "id": 999,
                        "name": "Kimetsu no Yaiba: Yuukaku-hen",
                        "animethemes": [
                            {
                                "type": "OP",
                                "sequence": 1,
                                "song": {
                                    "title": "Zankyou Sanka",
                                    "artists": [{"name": "Aimer"}],
                                },
                                "animethemeentries": [
                                    {
                                        "episodes": "1-11",
                                        "videos": [
                                            {
                                                "link": "https://v.animethemes.moe/zankyou.webm",
                                                "audio": {"link": "https://a.animethemes.moe/zankyou.ogg"},
                                            }
                                        ],
                                    }
                                ],
                            }
                        ],
                    }
                ]
            })
        raise AssertionError(f"Unexpected GET {url} params={params}")

    bridge = Bridge()
    with (
        patch("bridge.requests.post", side_effect=fake_post),
        patch("bridge.requests.get", side_effect=fake_get),
        patch("bridge.time.sleep") as mock_sleep,
    ):
        result = bridge.anime_get_themes(201)

    mock_sleep.assert_called_once_with(0.5)

    assert result["success"] is True
    assert len(result["seasons"]) == 2
    assert len(result["themes"]) == 3

    # Season 1 from Jikan
    s1_themes = result["seasons"][0]["themes"]
    assert len(s1_themes) == 2
    assert s1_themes[0]["title"] == "Gurenge"
    assert s1_themes[0]["artist"] == "LiSA"
    assert s1_themes[0]["seasonNumber"] == 1
    assert s1_themes[0]["seasonTitle"] == "Demon Slayer"
    assert s1_themes[0]["malId"] == 38000
    assert s1_themes[0]["episodesFrom"] == 1
    assert s1_themes[0]["episodesTo"] == 26

    # Season 2 from AnimeThemes fallback by AniList ID
    s2_themes = result["seasons"][1]["themes"]
    assert len(s2_themes) == 1
    assert s2_themes[0]["title"] == "Zankyou Sanka"
    assert s2_themes[0]["artist"] == "Aimer"
    assert s2_themes[0]["audioUrl"] == "https://a.animethemes.moe/zankyou.ogg"
    assert s2_themes[0]["seasonNumber"] == 2
    assert s2_themes[0]["seasonTitle"] == "Demon Slayer: Entertainment District"
    assert s2_themes[0]["malId"] == 47778


def test_anime_search_animethemes_prefix_containment_fallback():
    payload = {
        "anime": [
            {"id": 1, "name": "Shingeki no Kyojin: The Final Season", "slug": "snk-final"},
            {"id": 2, "name": "Other Unrelated Anime", "slug": "other"},
        ]
    }
    with patch("bridge.requests.get", return_value=_mock_response(payload)):
        match = _anime_search_animethemes("Shingeki no Kyojin")
    assert match is not None
    assert match["slug"] == "snk-final"


def test_anime_fetch_themes_jikan_handles_network_error_gracefully():
    with patch("bridge.requests.get", side_effect=requests.Timeout("jikan timed out")):
        assert _anime_fetch_themes_jikan(38000, 201) == []


def test_anime_fetch_themes_by_anilist_id_handles_network_error_gracefully():
    with patch("bridge.requests.get", side_effect=requests.ConnectionError("down")):
        assert _anime_fetch_themes_by_anilist_id(201) == []


# ---------------------------------------------------------------------------
# Collections: deezer_playlist
# ---------------------------------------------------------------------------


def test_deezer_playlist_fetches_valid_numeric_id():
    payload = {"id": 908622995, "title": "Top Hits", "tracks": {"data": [{"id": 1, "title": "Song"}]}}
    with patch("bridge.requests.get", return_value=_mock_response(payload)) as mock_get:
        res = Bridge().deezer_playlist("908622995")

    assert res == payload
    mock_get.assert_called_once_with(
        "https://api.deezer.com/playlist/908622995",
        timeout=10,
        allow_redirects=False,
    )


@pytest.mark.parametrize(
    "bad_id",
    ["", "   ", "abc", "123/../../track/1", "123?foo=bar", "-5", True, None],
)
def test_deezer_playlist_rejects_invalid_ids_without_network(bad_id):
    with patch("bridge.requests.get") as mock_get:
        res = Bridge().deezer_playlist(bad_id)  # type: ignore[arg-type]

    assert "error" in res
    mock_get.assert_not_called()


# ---------------------------------------------------------------------------
# Collections: get_playlist_items (YouTube / YouTube Music + OWASP)
# ---------------------------------------------------------------------------


def test_get_playlist_items_valid_youtube_and_music_hosts_uses_canonical_url():
    jsonl = "\n".join([
        json.dumps({
            "id": "dQw4w9WgXcQ",
            "title": "Track One",
            "channel": "Artist One",
            "duration": 212,
            "playlist_title": "My Awesome Mix",
            "thumbnails": [
                {"url": "https://i.ytimg.com/vi/dQw4w9WgXcQ/default.jpg"},
                {"url": "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg"},
            ],
        }),
        json.dumps({
            "id": "abcDEF12345",
            "title": "Track Two",
            "uploader": "Artist Two",
            "duration": 185,
            "playlist_title": "My Awesome Mix",
        }),
    ])
    proc = MagicMock(returncode=0, stdout=jsonl, stderr="")

    with patch("bridge.subprocess.run", return_value=proc) as mock_run:
        res = Bridge().get_playlist_items(
            "https://music.youtube.com/playlist?list=PL1234567890abcdef&si=trackingparam",
            limit=200,
        )

    assert res["success"] is True
    assert res["title"] == "My Awesome Mix"
    assert len(res["items"]) == 2
    assert res["items"][0] == {
        "videoId": "dQw4w9WgXcQ",
        "title": "Track One",
        "channel": "Artist One",
        "duration": 212,
        "thumbnail": "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    }
    assert res["items"][1]["thumbnail"] == "https://i.ytimg.com/vi/abcDEF12345/hqdefault.jpg"

    called_args = mock_run.call_args.args[0]
    # Canonical URL strips extra query params and prevents argument injection
    assert called_args[1] == "https://www.youtube.com/playlist?list=PL1234567890abcdef"
    assert "--flat-playlist" in called_args
    assert "--dump-json" in called_args
    assert called_args[called_args.index("--playlist-end") + 1] == "50"  # clamped to max 50
    assert mock_run.call_args.kwargs["timeout"] == 25


@pytest.mark.parametrize(
    "malicious_url",
    [
        "",
        "http://www.youtube.com/playlist?list=PL1234567890abcdef",
        "https://evil.com/playlist?list=PL1234567890abcdef",
        "https://youtube.com.evil.com/playlist?list=PL1234567890abcdef",
        "https://127.0.0.1/playlist?list=PL1234567890abcdef",
        "https://localhost/playlist?list=PL1234567890abcdef",
        "https://www.youtube.com@evil.com/playlist?list=PL1234567890abcdef",
        "https://www.youtube.com:8443/playlist?list=PL1234567890abcdef",
        "https://www.youtube.com/playlist",
        "https://www.youtube.com/playlist?list=short",
        "https://www.youtube.com/playlist?list=PL1234567890;rm%20-rf%20/",
        "https://www.youtube.com/playlist?list=--exec=calc.exe",
        "file:///etc/passwd?list=PL1234567890abcdef",
    ],
)
def test_get_playlist_items_rejects_ssrf_and_invalid_list_without_running_ytdlp(malicious_url):
    with patch("bridge.subprocess.run") as mock_run:
        res = Bridge().get_playlist_items(malicious_url)

    assert res["success"] is False
    assert res["error"]
    mock_run.assert_not_called()


def test_get_playlist_items_handles_timeout():
    with patch(
        "bridge.subprocess.run",
        side_effect=subprocess.TimeoutExpired(cmd="yt-dlp", timeout=25),
    ):
        res = Bridge().get_playlist_items("https://www.youtube.com/playlist?list=PL1234567890abcdef")

    assert res == {"success": False, "error": "Playlist fetch timeout"}


# ---------------------------------------------------------------------------
# Collections: spotify_embed_fetch (OWASP)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "valid_url",
    [
        "https://open.spotify.com/embed/album/4aawyAB9vmqN3uQ7FjRGTy",
        "https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M",
    ],
)
def test_spotify_embed_fetch_accepts_album_and_playlist_embeds(valid_url):
    resp = _mock_response(status_code=200, text="<html><script id='__NEXT_DATA__'>{}</script></html>")
    with patch("bridge.requests.get", return_value=resp) as mock_get:
        res = Bridge().spotify_embed_fetch(valid_url)

    assert res == {"success": True, "html": "<html><script id='__NEXT_DATA__'>{}</script></html>"}
    assert mock_get.call_args.args[0] == valid_url
    assert mock_get.call_args.kwargs["timeout"] == 12
    assert mock_get.call_args.kwargs["allow_redirects"] is False
    assert "Mozilla/5.0" in mock_get.call_args.kwargs["headers"]["User-Agent"]


@pytest.mark.parametrize(
    "bad_url",
    [
        "",
        "http://open.spotify.com/embed/album/4aawyAB9vmqN3uQ7FjRGTy",
        "https://open.spotify.com/album/4aawyAB9vmqN3uQ7FjRGTy",
        "https://open.spotify.com/embed/track/4aawyAB9vmqN3uQ7FjRGTy",
        "https://open.spotify.com/embed/artist/4aawyAB9vmqN3uQ7FjRGTy",
        "https://open.spotify.com/embed/album/4aawyAB9vmqN3uQ7FjRGTy?utm=1",
        "https://open.spotify.com/embed/album/4aawyAB9vmqN3uQ7FjRGTy/extra",
        "https://open.spotify.com/embed/album/short",
        "https://open.spotify.com.evil.com/embed/album/4aawyAB9vmqN3uQ7FjRGTy",
        "https://127.0.0.1/embed/album/4aawyAB9vmqN3uQ7FjRGTy",
    ],
)
def test_spotify_embed_fetch_rejects_disallowed_urls_without_network(bad_url):
    with patch("bridge.requests.get") as mock_get:
        res = Bridge().spotify_embed_fetch(bad_url)

    assert res["success"] is False
    mock_get.assert_not_called()


def test_spotify_embed_fetch_rejects_redirect_response():
    resp = _mock_response(status_code=302, text="")
    with patch("bridge.requests.get", return_value=resp):
        res = Bridge().spotify_embed_fetch("https://open.spotify.com/embed/album/4aawyAB9vmqN3uQ7FjRGTy")

    assert res["success"] is False
    assert "302" in res["error"]


# ---------------------------------------------------------------------------
# Red Team Hardening (Wave 3)
# ---------------------------------------------------------------------------


def test_parse_jikan_theme_entry_broadcast_suffix_and_japanese_feat():
    # Strips trailing [Broadcast] / [TV] / [BD] before parsing episode ranges
    broadcast = _parse_jikan_theme_entry(
        '1: "Gurenge (紅蓮華)" by LiSA (eps 1-26) [Broadcast]',
        "OP",
        default_seq=1,
    )
    assert broadcast == {
        "type": "OP",
        "sequence": 1,
        "title": "Gurenge",
        "artist": "LiSA",
        "episodesFrom": 1,
        "episodesTo": 26,
    }

    bd_multi = _parse_jikan_theme_entry(
        '2: "Unravel" by TK from Ling tosite sigure [TV] (episodes 2-12) [BD]',
        "OP",
        default_seq=1,
    )
    assert bd_multi["title"] == "Unravel"
    assert bd_multi["artist"] == "TK from Ling tosite sigure"
    assert bd_multi["episodesFrom"] == 2
    assert bd_multi["episodesTo"] == 12

    # Preserves (feat. 日本語) / (ft. 日本語) while still stripping Japanese title duplicates
    jp_feat = _parse_jikan_theme_entry(
        '1: "Yoru ni Kakeru (feat. 誰か) (夜に駆ける)" by YOASOBI (ft. 花澤香菜) (eps 1-12) [Broadcast]',
        "ED",
        default_seq=1,
    )
    assert jp_feat == {
        "type": "ED",
        "sequence": 1,
        "title": "Yoru ni Kakeru (feat. 誰か)",
        "artist": "YOASOBI (ft. 花澤香菜)",
        "episodesFrom": 1,
        "episodesTo": 12,
    }


def test_jikan_429_retries_once_with_bounded_retry_after_and_succeeds():
    rate_limited = _mock_response({"status": 429}, status_code=429, headers={"Retry-After": "10"})
    ok_payload = {
        "data": {
            "openings": ['1: "Gurenge (紅蓮華)" by LiSA (eps 1-26) [Broadcast]'],
            "endings": [],
        }
    }
    ok_resp = _mock_response(ok_payload, status_code=200)

    with (
        patch("bridge.requests.get", side_effect=[rate_limited, ok_resp]) as mock_get,
        patch("bridge.time.sleep") as mock_sleep,
    ):
        themes = _anime_fetch_themes_jikan(38000, 201)

    assert mock_get.call_count == 2
    mock_sleep.assert_called_once_with(1.5)  # capped at 1.5s
    assert len(themes) == 1
    assert themes[0]["title"] == "Gurenge"
    assert themes[0]["episodesFrom"] == 1
    assert themes[0]["episodesTo"] == 26


def test_jikan_429_double_failure_falls_back_to_animethemes_without_crashing():
    single = _season_node(
        501, 50001, "Single Season Show", "Single Season Show", year=2022, episodes=12, edges=[],
    )

    def fake_get(url, **kwargs):
        params = kwargs.get("params") or {}
        if url == "https://api.jikan.moe/v4/anime/50001/themes":
            return _mock_response({"status": 429}, status_code=429, headers={"Retry-After": "0.25"})
        if url == "https://api.animethemes.moe/anime" and params.get("filter[site]") == "AniList":
            return _mock_response({
                "anime": [{
                    "id": 77,
                    "name": "Single Season Show",
                    "animethemes": [{
                        "type": "OP",
                        "sequence": 1,
                        "song": {"title": "Fallback OP", "artists": [{"name": "Band"}]},
                        "animethemeentries": [],
                    }],
                }]
            })
        raise AssertionError(f"Unexpected GET {url}")

    with (
        patch("bridge.requests.post", return_value=_mock_response({"data": {"Media": single}})),
        patch("bridge.requests.get", side_effect=fake_get) as mock_get,
        patch("bridge.time.sleep") as mock_sleep,
    ):
        res = Bridge().anime_get_themes(501)

    assert res["success"] is True
    assert len(res["themes"]) == 1
    assert res["themes"][0]["title"] == "Fallback OP"
    mock_sleep.assert_called_once_with(0.25)
    assert mock_get.call_count == 3  # 2 Jikan attempts + 1 AnimeThemes by AniList ID


def test_single_season_transient_animethemes_error_does_not_crash_anime_get_themes():
    single = _season_node(
        601, None, "Transient Failure Show", "Transient Failure Show", year=2023, episodes=12, edges=[],
    )

    def fake_get(url, **kwargs):
        params = kwargs.get("params") or {}
        if url == "https://api.animethemes.moe/anime" and params.get("filter[site]") == "AniList":
            return _mock_response({"anime": []})
        # Transient 500 on name search must be swallowed by _safe_resolve
        return _mock_response({"error": "upstream 500"}, status_code=500)

    with (
        patch("bridge.requests.post", return_value=_mock_response({"data": {"Media": single}})),
        patch("bridge.requests.get", side_effect=fake_get),
    ):
        res = Bridge().anime_get_themes(601)

    assert res["success"] is True
    assert res["themes"] == []
    assert len(res["seasons"]) == 1


def test_anime_collect_seasons_bfs_traverses_movie_bridge_tv_movie_tv():
    s1 = _season_node(
        101, 1001, "Kimetsu no Yaiba", "Demon Slayer S1", fmt="TV", year=2019, episodes=26,
        edges=[
            {"relationType": "SEQUEL", "node": {"id": 150, "idMal": 1500, "format": "MOVIE", "title": {"romaji": "Mugen Train Movie"}}},
        ],
    )
    movie = _season_node(
        150, 1500, "Kimetsu no Yaiba: Mugen Ressha-hen", "Mugen Train", fmt="MOVIE", year=2020, episodes=1,
        edges=[
            {"relationType": "PREQUEL", "node": {"id": 101, "idMal": 1001, "format": "TV", "title": {"romaji": "S1"}}},
            {"relationType": "SEQUEL", "node": {"id": 102, "idMal": 1002, "format": "TV", "title": {"romaji": "S2"}}},
        ],
    )
    s2 = _season_node(
        102, 1002, "Kimetsu no Yaiba: Yuukaku-hen", "Demon Slayer S2", fmt="TV", year=2021, episodes=11,
        edges=[
            {"relationType": "PREQUEL", "node": {"id": 150, "idMal": 1500, "format": "MOVIE", "title": {"romaji": "Mugen Train Movie"}}},
            {"relationType": "SEQUEL", "node": {"id": 160, "idMal": 1600, "format": "ONA", "episodes": 1, "title": {"romaji": "Promo ONA"}}},
            {"relationType": "SEQUEL", "node": {"id": 170, "idMal": 1700, "format": "ONA", "episodes": 12, "title": {"romaji": "ONA Season"}}},
        ],
    )
    ona_promo = _season_node(
        160, 1600, "Promo ONA", fmt="ONA", year=2022, episodes=1,
        edges=[
            {"relationType": "PREQUEL", "node": {"id": 102, "format": "TV", "title": {"romaji": "S2"}}},
        ],
    )
    ona_season = _season_node(
        170, 1700, "ONA Season", fmt="ONA", year=2023, episodes=12,
        edges=[
            {"relationType": "PREQUEL", "node": {"id": 102, "format": "TV", "title": {"romaji": "S2"}}},
        ],
    )
    nodes = {101: s1, 150: movie, 102: s2, 160: ona_promo, 170: ona_season}

    def fake_post(_url, **kwargs):
        aid = kwargs["json"]["variables"]["id"]
        return _mock_response({"data": {"Media": nodes.get(aid)}})

    with patch("bridge.requests.post", side_effect=fake_post):
        seasons = _anime_collect_seasons(101)

    # MOVIE (150) and 1-ep ONA (160) are traversed as bridges but excluded from seasons;
    # TV (101, 102) and >1-ep ONA (170) are preserved chronologically.
    assert [s["anilistId"] for s in seasons] == [101, 102, 170]
    assert [s["seasonNumber"] for s in seasons] == [1, 2, 3]
    assert [s["year"] for s in seasons] == [2019, 2021, 2023]


@pytest.mark.parametrize(
    "bad_id",
    ["", "   ", "abc", "123/../../album/1", "123?foo=bar", "-1", True, None],
)
def test_deezer_track_and_album_reject_non_numeric_ids_without_network(bad_id):
    bridge = Bridge()
    with patch("bridge.requests.get") as mock_get:
        track_res = bridge.deezer_track(bad_id)  # type: ignore[arg-type]
        album_res = bridge.deezer_album(bad_id)  # type: ignore[arg-type]

    assert "error" in track_res
    assert "error" in album_res
    mock_get.assert_not_called()


def test_deezer_track_album_and_lrclib_disable_redirects():
    bridge = Bridge()
    with patch("bridge.requests.get", return_value=_mock_response({"id": 42})) as mock_get:
        assert bridge.deezer_track("42") == {"id": 42}
        assert bridge.deezer_album("99") == {"id": 42}
        lrclib_res = bridge.lrclib_fetch("https://lrclib.net/api/get?track_name=A")
        assert lrclib_res["success"] is True

    assert mock_get.call_count == 3
    for call in mock_get.call_args_list:
        assert call.kwargs["allow_redirects"] is False

    # Redirect responses must be rejected
    redirect_resp = _mock_response({}, status_code=302)
    with patch("bridge.requests.get", return_value=redirect_resp):
        assert "error" in bridge.deezer_track("42")
        assert "error" in bridge.deezer_album("99")
        assert "error" in bridge.deezer_playlist("123")
        assert bridge.lrclib_fetch("https://lrclib.net/api/get?track_name=A")["success"] is False


def test_spotify_embed_fetch_accepts_8_char_id():
    resp = _mock_response(status_code=200, text="<html>ok</html>")
    with patch("bridge.requests.get", return_value=resp):
        res = Bridge().spotify_embed_fetch("https://open.spotify.com/embed/album/abcd1234")

    assert res == {"success": True, "html": "<html>ok</html>"}


def test_get_raw_audio_rejects_trailing_newline_in_video_id():
    with patch("bridge.subprocess.run") as mock_run:
        res = Bridge().get_raw_audio(
            "dQw4w9WgXcQ\n",
            "Song",
            "Artist",
            ["Artist Song"],
        )

    assert res == {"success": False, "error": "candidate_invalid: invalid videoId format"}
    mock_run.assert_not_called()


def test_get_playlist_items_reports_has_more_on_truncation():
    # Case 1: yt-dlp returns exactly limit items with no playlist_count -> hasMore=True
    jsonl_truncated = "\n".join([
        json.dumps({"id": "vid00000001", "title": "T1", "playlist_title": "Big List"}),
        json.dumps({"id": "vid00000002", "title": "T2", "playlist_title": "Big List"}),
    ])
    proc_trunc = MagicMock(returncode=0, stdout=jsonl_truncated, stderr="")
    with patch("bridge.subprocess.run", return_value=proc_trunc):
        res_trunc = Bridge().get_playlist_items(
            "https://www.youtube.com/playlist?list=PL1234567890abcdef",
            limit=2,
        )
    assert res_trunc["success"] is True
    assert res_trunc["hasMore"] is True

    # Case 2: playlist_count == len(items) -> hasMore=False
    jsonl_exact = "\n".join([
        json.dumps({"id": "vid00000001", "title": "T1", "playlist_count": 2}),
        json.dumps({"id": "vid00000002", "title": "T2", "playlist_count": 2}),
    ])
    proc_exact = MagicMock(returncode=0, stdout=jsonl_exact, stderr="")
    with patch("bridge.subprocess.run", return_value=proc_exact):
        res_exact = Bridge().get_playlist_items(
            "https://www.youtube.com/playlist?list=PL1234567890abcdef",
            limit=2,
        )
    assert res_exact["success"] is True
    assert res_exact["hasMore"] is False

    # Case 3: playlist_count > len(items) -> hasMore=True
    jsonl_more = json.dumps({"id": "vid00000001", "title": "T1", "playlist_count": 75})
    proc_more = MagicMock(returncode=0, stdout=jsonl_more, stderr="")
    with patch("bridge.subprocess.run", return_value=proc_more):
        res_more = Bridge().get_playlist_items(
            "https://www.youtube.com/playlist?list=PL1234567890abcdef",
            limit=50,
        )
    assert res_more["success"] is True
    assert res_more["hasMore"] is True
