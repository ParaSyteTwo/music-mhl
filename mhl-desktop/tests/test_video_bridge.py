"""Pytest suite for experimental Videoclips Desktop bridge methods."""
from __future__ import annotations

import json
import subprocess
from pathlib import Path
from unittest.mock import MagicMock, patch

from bridge import Bridge


def test_build_video_format_selector_variants():
    av1_1080 = Bridge._build_video_format_selector("1080p", "av1")
    assert "vcodec^=av01" in av1_1080
    assert "vcodec^=avc1" in av1_1080
    assert av1_1080.index("av01") < av1_1080.index("avc1")
    assert "[height<=1080]" in av1_1080

    h264_720 = Bridge._build_video_format_selector("720p", "h264")
    assert "av01" not in h264_720
    assert "vcodec^=avc1" in h264_720
    assert "[height<=720]" in h264_720

    best_av1 = Bridge._build_video_format_selector("best", "av1")
    assert "[height<=" not in best_av1


def test_video_id_owasp_validation_in_info_and_download():
    bridge = Bridge()
    for bad_id in ("", "short", "../../etc", "dQw4w9WgXcQ;calc", "https://evil.com/x"):
        info_res = bridge.get_video_info(bad_id)
        assert info_res["success"] is False
        assert "Invalid video_id" in info_res["error"]

        dl_res = bridge.download_video(bad_id)
        assert dl_res["success"] is False
        assert "Invalid video_id" in dl_res["error"]


def test_search_videos_parses_results_and_respects_limit():
    lines = "\n".join([
        json.dumps({
            "id": "dQw4w9WgXcQ",
            "title": "Official Music Video",
            "channel": "ArtistVEVO",
            "duration": 212,
            "view_count": 1500000,
        }),
        json.dumps({
            "id": "bad_id",
            "title": "Ignored short id",
            "duration": 100,
        }),
        json.dumps({
            "id": "abc123DEF45",
            "title": "Visualizer Clip",
            "uploader": "Indie Label",
            "duration": 185,
            "thumbnail": "https://img.example.com/custom.jpg",
        }),
    ])
    proc = MagicMock(returncode=0, stdout=lines, stderr="")
    with patch("bridge.subprocess.run", return_value=proc) as mock_run:
        res = Bridge().search_videos("daft punk", limit=8)

    assert res["success"] is True
    assert len(res["results"]) == 2
    assert res["results"][0]["videoId"] == "dQw4w9WgXcQ"
    assert res["results"][0]["thumbnail"] == "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg"
    assert res["results"][0]["viewCount"] == 1500000
    assert res["results"][1]["thumbnail"] == "https://img.example.com/custom.jpg"
    called_args = mock_run.call_args[0][0]
    assert "ytsearch8:daft punk" in called_args


def test_download_video_writes_mp4_to_videos_folder_zero_base64(tmp_path):
    video_dir = tmp_path / "Videos" / "MHL Music"

    def fake_run(args, **kwargs):
        out_idx = args.index("-o") + 1
        out_path = Path(args[out_idx])
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_bytes(b"\x00\x00\x00\x20ftypmp42" + b"0" * 64)
        return MagicMock(returncode=0, stdout="", stderr="")

    with (
        patch("bridge.settings", {"video_download_folder": str(video_dir)}),
        patch("bridge.subprocess.run", side_effect=fake_run) as mock_run,
    ):
        res = Bridge().download_video(
            "dQw4w9WgXcQ",
            quality="1080p",
            codec="av1",
            title="Track: <One>?",
            channel="Artist/VEVO",
        )

    assert res["success"] is True
    assert res["fileName"] == "Artist_VEVO - Track_ _One [1080p].mp4"
    assert Path(res["filePath"]).exists()
    assert res["size"] > 0
    assert "data" not in res
    called_args = mock_run.call_args[0][0]
    assert "--merge-output-format" in called_args
    assert "mp4" in called_args


def test_open_file_allows_mp4_in_video_folder_and_blocks_executables(tmp_path):
    music_dir = tmp_path / "Music" / "MHL Music"
    video_dir = tmp_path / "Videos" / "MHL Music"
    music_dir.mkdir(parents=True)
    video_dir.mkdir(parents=True)

    mp4_file = video_dir / "clip.mp4"
    mp4_file.write_bytes(b"mp4bytes")
    exe_file = video_dir / "bad.exe"
    exe_file.write_bytes(b"MZ")

    with (
        patch("bridge.settings", {
            "download_folder": str(music_dir),
            "video_download_folder": str(video_dir),
        }),
        patch("os.startfile", create=True) as mock_start,
    ):
        ok_res = Bridge().open_file("clip.mp4")
        assert ok_res["success"] is True
        mock_start.assert_called_once_with(str(mp4_file.resolve()))

        bad_res = Bridge().open_file("bad.exe")
        assert bad_res["success"] is False
        assert "not allowed" in bad_res["error"].lower()
