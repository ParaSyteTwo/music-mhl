"""Pytest suite for Desktop performance optimizations in bridge.py (Section 1)."""
from __future__ import annotations

import json
import os
import sys
import threading
import time
import types
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

import bridge
from bridge import Bridge


@pytest.fixture(autouse=True)
def _clear_cover_cache():
    """Ensure every test starts and ends with an empty cover LRU cache."""
    with bridge._cover_cache_lock:
        bridge._cover_cache.clear()
    yield
    with bridge._cover_cache_lock:
        bridge._cover_cache.clear()


# ---------------------------------------------------------------------------
# 1. HTTP Connection Pooling
# ---------------------------------------------------------------------------


def test_http_session_has_pooled_adapters_for_http_and_https():
    https_adapter = bridge._http_session.get_adapter("https://api.deezer.com")
    http_adapter = bridge._http_session.get_adapter("http://example.com")

    assert https_adapter is http_adapter
    assert https_adapter._pool_connections == 16
    assert https_adapter._pool_maxsize == 32


def test_http_get_uses_session_when_requests_get_not_patched():
    fake_resp = MagicMock(ok=True, status_code=200)
    with patch.object(bridge._http_session, "get", return_value=fake_resp) as session_get:
        res = bridge._http_get("https://api.deezer.com/track/123", timeout=10)

    assert res is fake_resp
    session_get.assert_called_once_with("https://api.deezer.com/track/123", timeout=10)


# ---------------------------------------------------------------------------
# 2. Thread-Safe LRU Cover Cache
# ---------------------------------------------------------------------------


def test_cover_cache_hits_on_second_request_with_single_http_call():
    image_bytes = b"\xff\xd8\xff\xe0" + (b"A" * 128)
    mock_resp = MagicMock(ok=True, content=image_bytes)

    with patch.object(bridge._http_session, "get", return_value=mock_resp) as session_get:
        first = bridge._fetch_cover_bytes("https://cdn.example.com/cover1.jpg")
        second = bridge._fetch_cover_bytes("https://cdn.example.com/cover1.jpg")

    assert first == image_bytes
    assert second == image_bytes
    assert session_get.call_count == 1
    assert session_get.call_args.kwargs["timeout"] == 10


def test_cover_cache_enforces_lru_max_entries():
    assert bridge._COVER_CACHE_MAX_ENTRIES == 16

    def fake_get(url, **_kwargs):
        return MagicMock(ok=True, content=(b"\xff\xd8\xff\xe0" + url.encode("utf-8") * 4))

    with patch.object(bridge._http_session, "get", side_effect=fake_get):
        # Fill 16 entries
        for i in range(16):
            assert bridge._fetch_cover_bytes(f"https://cdn.example.com/c{i}.jpg") is not None

        # Touch entry 0 so entry 1 becomes least recently used
        assert bridge._fetch_cover_bytes("https://cdn.example.com/c0.jpg") is not None

        # Insert 17th entry -> should evict c1, keeping c0
        assert bridge._fetch_cover_bytes("https://cdn.example.com/c16.jpg") is not None

    with bridge._cover_cache_lock:
        assert len(bridge._cover_cache) == 16
        assert "https://cdn.example.com/c0.jpg" in bridge._cover_cache
        assert "https://cdn.example.com/c1.jpg" not in bridge._cover_cache
        assert "https://cdn.example.com/c16.jpg" in bridge._cover_cache


def test_cover_cache_rejects_images_over_5mb():
    oversized = b"\xff\xd8\xff\xe0" + (b"x" * (5 * 1024 * 1024 + 10))
    mock_resp = MagicMock(ok=True, content=oversized)

    with patch.object(bridge._http_session, "get", return_value=mock_resp) as session_get:
        res1 = bridge._fetch_cover_bytes("https://cdn.example.com/huge.jpg")
        res2 = bridge._fetch_cover_bytes("https://cdn.example.com/huge.jpg")

    assert res1 is None
    assert res2 is None
    assert session_get.call_count == 2
    with bridge._cover_cache_lock:
        assert "https://cdn.example.com/huge.jpg" not in bridge._cover_cache


def test_cover_cache_streaming_aborts_over_5mb():
    chunks_yielded = 0

    def huge_stream(chunk_size=65536):
        nonlocal chunks_yielded
        yield b"\xff\xd8\xff\xe0" + (b"A" * (1024 * 1024))
        chunks_yielded += 1
        for _ in range(10):
            chunks_yielded += 1
            yield b"B" * (1024 * 1024)

    mock_resp = MagicMock(ok=True, headers={})
    mock_resp.iter_content.side_effect = huge_stream

    with patch.object(bridge._http_session, "get", return_value=mock_resp) as session_get:
        res = bridge._fetch_cover_bytes("https://cdn.example.com/stream-huge.jpg")

    assert res is None
    assert session_get.call_args.kwargs["stream"] is True
    assert chunks_yielded <= 6
    mock_resp.close.assert_called_once()


def test_cover_cache_rejects_ssrf_and_non_https_urls():
    blocked_urls = [
        "http://cdn.example.com/cover.jpg",
        "https://127.0.0.1/cover.jpg",
        "https://localhost/cover.jpg",
        "https://sub.localhost/cover.jpg",
        "https://printer.local/cover.jpg",
        "https://metadata.internal/cover.jpg",
        "https://10.0.0.5/cover.jpg",
        "https://192.168.1.10/cover.jpg",
        "https://169.254.169.254/latest/meta-data/",
        "https://[::1]/cover.jpg",
        "file:///C:/secret.jpg",
        "ftp://example.com/cover.jpg",
        "",
    ]
    with patch.object(bridge._http_session, "get") as session_get:
        for url in blocked_urls:
            assert bridge._fetch_cover_bytes(url) is None, f"Expected SSRF block for {url}"

    session_get.assert_not_called()


def test_cover_cache_blocks_dns_resolving_to_private_ip():
    fake_addrinfo = [(2, 1, 6, "", ("127.0.0.1", 443))]
    with patch("bridge.socket.getaddrinfo", return_value=fake_addrinfo):
        with patch.object(bridge._http_session, "get") as session_get:
            assert bridge._fetch_cover_bytes("https://rebind.example.com/cover.jpg") is None

    session_get.assert_not_called()


def test_cover_cache_blocks_ssrf_redirect():
    redirect_resp = MagicMock(
        ok=False,
        status_code=302,
        headers={"Location": "https://127.0.0.1/internal.jpg"},
    )
    with patch.object(bridge._http_session, "get", return_value=redirect_resp) as session_get:
        assert bridge._fetch_cover_bytes("https://cdn.example.com/redir.jpg") is None

    assert session_get.call_count == 1
    assert session_get.call_args.kwargs["allow_redirects"] is False


def test_cover_cache_rejects_fake_html_and_accepts_png():
    html_bytes = b"<!DOCTYPE html><html><body>403 Forbidden</body></html>"
    png_bytes = b"\x89PNG\r\n\x1a\n" + (b"\x00" * 64)

    with patch.object(bridge._http_session, "get", return_value=MagicMock(ok=True, content=html_bytes)):
        assert bridge._fetch_cover_bytes("https://cdn.example.com/fake.jpg") is None

    with bridge._cover_cache_lock:
        assert "https://cdn.example.com/fake.jpg" not in bridge._cover_cache

    with patch.object(bridge._http_session, "get", return_value=MagicMock(ok=True, content=png_bytes)):
        res = bridge._fetch_cover_bytes("https://cdn.example.com/valid.png")
        assert res == png_bytes

    with bridge._cover_cache_lock:
        assert bridge._cover_cache.get("https://cdn.example.com/valid.png") == png_bytes


def test_tag_and_save_m4a_reuses_cached_cover_across_downloads(tmp_path, monkeypatch):
    download_dir = tmp_path / "downloads"
    download_dir.mkdir()
    monkeypatch.setattr(bridge.settings, "get", lambda key, default=None: str(download_dir) if key == "download_folder" else default)

    temp_root = tmp_path / "mhl_audio_cache"
    monkeypatch.setattr(bridge, "_TEMP_AUDIO_DIR", temp_root)

    class MockMP4(dict):
        def save(self):
            pass

    mock_mutagen = types.ModuleType("mutagen")
    mock_mutagen_mp4 = types.ModuleType("mutagen.mp4")
    mock_mutagen_mp4.MP4 = lambda _p: MockMP4()
    mock_mutagen_mp4.MP4Cover = MagicMock(side_effect=lambda data, imageformat=None: data)
    mock_mutagen_mp4.MP4Cover.FORMAT_JPEG = 13
    mock_mutagen.mp4 = mock_mutagen_mp4

    cover_bytes = b"\xff\xd8\xff\xe0" + (b"J" * 64)
    mock_resp = MagicMock(ok=True, content=cover_bytes)
    b = Bridge()

    with patch.dict(sys.modules, {"mutagen": mock_mutagen, "mutagen.mp4": mock_mutagen_mp4}):
        with patch.object(bridge._http_session, "get", return_value=mock_resp) as session_get:
            for idx in range(2):
                sub = temp_root / f"job_{idx}"
                sub.mkdir(parents=True)
                src = sub / "audio.m4a"
                src.write_bytes(b"fake-m4a-data")
                res = b.tag_and_save_m4a(
                    file_path=str(download_dir / f"track_{idx}.m4a"),
                    audio_b64=None,
                    title=f"Track {idx}",
                    artist="Artist",
                    album="Album",
                    cover_url="https://cdn.example.com/shared-album-cover.jpg",
                    lyrics=None,
                    temp_path=str(src),
                )
                assert res["success"] is True

    assert session_get.call_count == 1


# ---------------------------------------------------------------------------
# 3. Zero-Base64 Temp Audio & Path Traversal Security
# ---------------------------------------------------------------------------


def test_get_raw_audio_return_path_zero_base64_and_flags(tmp_path, monkeypatch):
    temp_root = tmp_path / "mhl_audio_cache"
    monkeypatch.setattr(bridge, "_TEMP_AUDIO_DIR", temp_root)
    b = Bridge()

    payload = b"A" * (20 * 1024)
    created_tmpdir = []

    def fake_run(args, **_kwargs):
        out_path = Path(args[args.index("-o") + 1])
        created_tmpdir.append(out_path.parent)
        out_path.write_bytes(payload)
        return MagicMock(returncode=0, stderr="")

    mock_mutagen = types.ModuleType("mutagen")
    mock_info = MagicMock()
    mock_info.info.length = 200.5
    mock_mutagen.File = MagicMock(return_value=mock_info)

    with patch.dict(sys.modules, {"mutagen": mock_mutagen}):
        with patch("bridge.subprocess.run", side_effect=fake_run) as run_mock:
            res = b.get_raw_audio(
                "dQw4w9WgXcQ",
                "Song",
                "Artist",
                ["Artist Song"],
                expected_duration=200,
                audio_format="m4a",
                return_path=True,
            )

    assert res["success"] is True
    assert "data_b64" not in res
    assert "temp_path" in res
    assert res["duration"] == 200.5
    assert res["size"] == len(payload)
    assert res["ext"] == "m4a"

    # Verify yt-dlp flags
    ytdlp_args = run_mock.call_args_list[0].args[0]
    assert "--no-part" in ytdlp_args
    assert "--concurrent-fragments" in ytdlp_args
    assert ytdlp_args[ytdlp_args.index("--concurrent-fragments") + 1] == "4"

    # Temp file exists inside _TEMP_AUDIO_DIR while intermediate tmpdir was removed
    final_temp = Path(res["temp_path"])
    assert final_temp.exists()
    assert final_temp.read_bytes() == payload
    final_temp.resolve().relative_to(temp_root.resolve())
    assert not created_tmpdir[0].exists()


def test_tag_and_save_m4a_with_valid_temp_path_cleans_up_temp_dir(tmp_path, monkeypatch):
    download_dir = tmp_path / "downloads"
    download_dir.mkdir()
    monkeypatch.setattr(bridge.settings, "get", lambda key, default=None: str(download_dir) if key == "download_folder" else default)

    temp_root = tmp_path / "mhl_audio_cache"
    monkeypatch.setattr(bridge, "_TEMP_AUDIO_DIR", temp_root)

    uuid_dir = temp_root / "abcd1234"
    uuid_dir.mkdir(parents=True)
    temp_file = uuid_dir / "audio.m4a"
    temp_file.write_bytes(b"real-audio-bytes-payload")

    class MockMP4(dict):
        def save(self):
            pass

    mock_mp4 = MockMP4()
    mock_mutagen = types.ModuleType("mutagen")
    mock_mutagen_mp4 = types.ModuleType("mutagen.mp4")
    mock_mutagen_mp4.MP4 = lambda _p: mock_mp4
    mock_mutagen_mp4.MP4Cover = MagicMock()
    mock_mutagen.mp4 = mock_mutagen_mp4

    b = Bridge()
    dest = download_dir / "Artist - Song.m4a"
    with patch.dict(sys.modules, {"mutagen": mock_mutagen, "mutagen.mp4": mock_mutagen_mp4}):
        res = b.tag_and_save_m4a(
            file_path=str(dest),
            audio_b64=None,
            title="Song",
            artist="Artist",
            album="Album",
            cover_url=None,
            lyrics="[00:01.00] Hi",
            temp_path=str(temp_file),
        )

    assert res["success"] is True
    assert dest.exists()
    assert dest.read_bytes() == b"real-audio-bytes-payload"
    assert mock_mp4["\xa9nam"] == "Song"
    assert mock_mp4["\xa9lyr"] == "[00:01.00] Hi"

    # Temp file and its UUID parent folder are cleaned up, root cache dir remains
    assert not temp_file.exists()
    assert not uuid_dir.exists()
    assert temp_root.exists()


def test_tag_and_save_m4a_rejects_path_traversal_temp_path(tmp_path, monkeypatch):
    download_dir = tmp_path / "downloads"
    download_dir.mkdir()
    monkeypatch.setattr(bridge.settings, "get", lambda key, default=None: str(download_dir) if key == "download_folder" else default)

    temp_root = tmp_path / "mhl_audio_cache"
    temp_root.mkdir(parents=True)
    monkeypatch.setattr(bridge, "_TEMP_AUDIO_DIR", temp_root)

    outside_file = tmp_path / "secret.m4a"
    outside_file.write_bytes(b"sensitive-data")

    b = Bridge()
    # Direct outside path
    res1 = b.tag_and_save_m4a(
        file_path=str(download_dir / "out1.m4a"),
        audio_b64=None,
        title="Hack",
        artist="Hacker",
        album="Album",
        cover_url=None,
        lyrics=None,
        temp_path=str(outside_file),
    )
    assert res1 == {"success": False, "error": "Invalid temp_path"}
    assert outside_file.exists()

    # Relative '..' traversal attempt
    traversal_path = str(temp_root / ".." / "secret.m4a")
    res2 = b.tag_and_save_m4a(
        file_path=str(download_dir / "out2.m4a"),
        audio_b64=None,
        title="Hack",
        artist="Hacker",
        album="Album",
        cover_url=None,
        lyrics=None,
        temp_path=traversal_path,
    )
    assert res2 == {"success": False, "error": "Invalid temp_path"}
    assert outside_file.exists()


def test_cleanup_temp_audio_valid_and_rejects_traversal(tmp_path, monkeypatch):
    temp_root = tmp_path / "mhl_audio_cache"
    monkeypatch.setattr(bridge, "_TEMP_AUDIO_DIR", temp_root)

    uuid_dir = temp_root / "job999"
    uuid_dir.mkdir(parents=True)
    valid_file = uuid_dir / "audio.m4a"
    valid_file.write_bytes(b"temp-bytes")

    outside_file = tmp_path / "do_not_delete.txt"
    outside_file.write_text("keep me", encoding="utf-8")

    b = Bridge()

    # Reject outside file
    res_outside = b.cleanup_temp_audio(str(outside_file))
    assert res_outside == {"success": False, "error": "Invalid temp_path"}
    assert outside_file.exists()

    # Reject '..' traversal
    res_traversal = b.cleanup_temp_audio(str(temp_root / ".." / "do_not_delete.txt"))
    assert res_traversal == {"success": False, "error": "Invalid temp_path"}
    assert outside_file.exists()

    # Reject temp root itself
    res_root = b.cleanup_temp_audio(str(temp_root))
    assert res_root == {"success": False, "error": "Invalid temp_path"}
    assert temp_root.exists()

    # Accept valid file inside _TEMP_AUDIO_DIR
    res_ok = b.cleanup_temp_audio(str(valid_file))
    assert res_ok == {"success": True}
    assert not valid_file.exists()
    assert not uuid_dir.exists()
    assert temp_root.exists()


def test_bridge_init_cleans_only_stale_temp_audio_dirs(tmp_path, monkeypatch):
    temp_root = tmp_path / "mhl_audio_cache"
    monkeypatch.setattr(bridge, "_TEMP_AUDIO_DIR", temp_root)

    old_dir = temp_root / "stale_uuid"
    old_dir.mkdir(parents=True)
    (old_dir / "audio.m4a").write_bytes(b"old")
    old_mtime = time.time() - 7200  # 2 hours ago
    os.utime(old_dir, (old_mtime, old_mtime))

    fresh_dir = temp_root / "fresh_uuid"
    fresh_dir.mkdir(parents=True)
    (fresh_dir / "audio.m4a").write_bytes(b"fresh")

    Bridge()

    assert not old_dir.exists()
    assert fresh_dir.exists()


# ---------------------------------------------------------------------------
# 4. Fast Probe with Mutagen (No FFmpeg Invocation) + Fallback
# ---------------------------------------------------------------------------


def test_get_raw_audio_fast_probe_with_mutagen_skips_ffmpeg(tmp_path, monkeypatch):
    temp_root = tmp_path / "mhl_audio_cache"
    monkeypatch.setattr(bridge, "_TEMP_AUDIO_DIR", temp_root)
    b = Bridge()

    def fake_run(args, **_kwargs):
        assert "ffmpeg" not in Path(args[0]).name.lower(), "ffmpeg should NOT be called when mutagen succeeds"
        out_path = Path(args[args.index("-o") + 1])
        out_path.write_bytes(b"B" * (18 * 1024))
        return MagicMock(returncode=0, stderr="")

    mock_mutagen = types.ModuleType("mutagen")
    mock_audio_info = MagicMock()
    mock_audio_info.info.length = 182.25
    mock_mutagen.File = MagicMock(return_value=mock_audio_info)

    with patch.dict(sys.modules, {"mutagen": mock_mutagen}):
        with patch("bridge.subprocess.run", side_effect=fake_run) as run_mock:
            res = b.get_raw_audio(
                "abc123XYZ",
                "Track",
                "Artist",
                ["Artist Track"],
                expected_duration=182,
                return_path=True,
            )

    assert res["success"] is True
    assert res["duration"] == 182.25
    assert run_mock.call_count == 1  # Only yt-dlp, never ffmpeg


def test_get_raw_audio_falls_back_to_fast_ffmpeg_probe_with_t_1_when_mutagen_returns_none(tmp_path, monkeypatch):
    temp_root = tmp_path / "mhl_audio_cache"
    monkeypatch.setattr(bridge, "_TEMP_AUDIO_DIR", temp_root)
    b = Bridge()

    def fake_run(args, **_kwargs):
        if "-o" in args:
            out_path = Path(args[args.index("-o") + 1])
            out_path.write_bytes(b"C" * (18 * 1024))
            return MagicMock(returncode=0, stderr="")
        return MagicMock(returncode=0, stderr="Duration: 00:03:05.50, start: 0.000000")

    mock_mutagen = types.ModuleType("mutagen")
    mock_mutagen.File = MagicMock(return_value=None)

    with patch.dict(sys.modules, {"mutagen": mock_mutagen}):
        with patch("bridge.subprocess.run", side_effect=fake_run) as run_mock:
            res = b.get_raw_audio(
                "abc123XYZ",
                "Track",
                "Artist",
                ["Artist Track"],
                expected_duration=185,
                return_path=False,
            )

    assert res["success"] is True
    assert res["duration"] == pytest.approx(185.5)
    assert "data_b64" in res
    assert run_mock.call_count == 2
    ffmpeg_args = run_mock.call_args_list[1].args[0]
    assert "-t" in ffmpeg_args
    assert ffmpeg_args[ffmpeg_args.index("-t") + 1] == "1"


# ---------------------------------------------------------------------------
# 5. Parallel _enrich_candidate in get_candidates
# ---------------------------------------------------------------------------


def test_get_candidates_deep_enriches_top_2_in_parallel():
    b = Bridge()
    fake_stdout = "\n".join([
        json.dumps({"id": "vid1", "title": "Song 1", "channel": "Chan 1", "duration": 180}),
        json.dumps({"id": "vid2", "title": "Song 2", "channel": "Chan 2", "duration": 181}),
        json.dumps({"id": "vid3", "title": "Song 3", "channel": "Chan 3", "duration": 182}),
    ])
    search_proc = MagicMock(returncode=0, stdout=fake_stdout, stderr="")

    barrier = threading.Barrier(2, timeout=2.0)
    enriched_ids: list[str] = []
    lock = threading.Lock()

    def concurrent_enrich(candidate: dict):
        # Barrier will time out if calls are executed sequentially instead of in parallel.
        barrier.wait()
        with lock:
            enriched_ids.append(candidate["videoId"])
        candidate["isrc"] = f"ISRC-{candidate['videoId']}"

    with patch("bridge.subprocess.run", return_value=search_proc):
        with patch.object(b, "_enrich_candidate", side_effect=concurrent_enrich) as enrich_mock:
            res = b.get_candidates({"title": "Song", "artist": "Artist", "depth": "deep"})

    assert res["success"] is True
    assert len(res["candidates"]) == 3
    assert enrich_mock.call_count == 2
    assert set(enriched_ids) == {"vid1", "vid2"}
    assert res["candidates"][0]["isrc"] == "ISRC-vid1"
    assert res["candidates"][1]["isrc"] == "ISRC-vid2"
    assert res["candidates"][2]["isrc"] == ""


# ---------------------------------------------------------------------------
# 6. Concurrency & Red Team Hardening
# ---------------------------------------------------------------------------


def test_reactive_ytdlp_update_is_thread_safe_under_concurrent_calls(monkeypatch):
    monkeypatch.setattr(bridge, "_last_auto_update_time", 0.0)
    b = Bridge()
    call_count = 0
    count_lock = threading.Lock()
    start_barrier = threading.Barrier(4, timeout=2.0)

    def fake_update():
        nonlocal call_count
        with count_lock:
            call_count += 1
        time.sleep(0.05)
        return {"success": True, "status": "DONE"}

    results: list[bool] = []
    results_lock = threading.Lock()

    def worker():
        start_barrier.wait()
        ok = b._try_reactive_ytdlp_update()
        with results_lock:
            results.append(ok)

    with patch.object(b, "ytdlp_update", side_effect=fake_update):
        threads = [threading.Thread(target=worker) for _ in range(4)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=3.0)

    assert call_count == 1
    assert results.count(True) == 1
    assert results.count(False) == 3


def test_tag_and_save_m4a_uses_unique_tmp_paths(tmp_path, monkeypatch):
    download_dir = tmp_path / "downloads"
    download_dir.mkdir()
    monkeypatch.setattr(
        bridge.settings,
        "get",
        lambda key, default=None: str(download_dir) if key == "download_folder" else default,
    )

    seen_tmp_paths: list[str] = []

    class MockMP4(dict):
        def save(self):
            pass

    def fake_mp4(path_str):
        seen_tmp_paths.append(path_str)
        return MockMP4()

    mock_mutagen = types.ModuleType("mutagen")
    mock_mutagen_mp4 = types.ModuleType("mutagen.mp4")
    mock_mutagen_mp4.MP4 = fake_mp4
    mock_mutagen_mp4.MP4Cover = MagicMock()
    mock_mutagen.mp4 = mock_mutagen_mp4

    b = Bridge()
    dest = download_dir / "same_song.m4a"
    import base64
    b64 = base64.b64encode(b"audio-bytes").decode("ascii")

    with patch.dict(sys.modules, {"mutagen": mock_mutagen, "mutagen.mp4": mock_mutagen_mp4}):
        for _ in range(2):
            res = b.tag_and_save_m4a(
                file_path=str(dest),
                audio_b64=b64,
                title="Song",
                artist="Artist",
            )
            assert res["success"] is True

    assert len(seen_tmp_paths) == 2
    assert seen_tmp_paths[0] != seen_tmp_paths[1]
    assert seen_tmp_paths[0].endswith(".tmp")
    assert seen_tmp_paths[1].endswith(".tmp")
