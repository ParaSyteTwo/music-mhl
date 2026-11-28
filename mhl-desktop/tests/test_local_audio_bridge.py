"""Pytest suite for Desktop local audio playback and missing file verification."""
from __future__ import annotations

import base64
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from bridge import Bridge


def test_read_local_audio_valid_with_lrc_fallback(tmp_path: Path):
    music_dir = tmp_path / "Music"
    music_dir.mkdir()
    audio_file = music_dir / "Artist - Track.m4a"
    payload = b"FAKE_M4A_BYTES"
    audio_file.write_bytes(payload)
    (music_dir / "Artist - Track.lrc").write_text("[00:01.00] Hello world", encoding="utf-8")

    bridge = Bridge()
    with patch("bridge.settings", {"download_folder": str(music_dir)}):
        res = bridge.read_local_audio("Artist - Track.m4a")

    assert res["success"] is True
    assert res["mime"] == "audio/mp4"
    assert base64.b64decode(res["data_b64"]) == payload
    assert "[00:01.00] Hello world" in res["lyrics"]


def test_read_local_audio_reads_mutagen_lyr_tag(tmp_path: Path):
    music_dir = tmp_path / "Music"
    music_dir.mkdir()
    audio_file = music_dir / "TagSong.m4a"
    audio_file.write_bytes(b"AUDIO_DATA")

    fake_audio = SimpleNamespace(tags={"\xa9lyr": ["[00:05.00] Embedded line"]})
    bridge = Bridge()
    with patch("bridge.settings", {"download_folder": str(music_dir)}), patch(
        "mutagen.File", return_value=fake_audio
    ):
        res = bridge.read_local_audio("TagSong.m4a")

    assert res["success"] is True
    assert res["lyrics"] == "[00:05.00] Embedded line"


def test_read_local_audio_blocks_traversal_extension_and_oversized_files(tmp_path: Path):
    music_dir = tmp_path / "Music"
    music_dir.mkdir()
    outside = tmp_path / "secret.m4a"
    outside.write_bytes(b"SECRET")
    bad_ext = music_dir / "malware.exe"
    bad_ext.write_bytes(b"MZ")
    huge = music_dir / "huge.mp3"
    huge.write_bytes(b"0")

    bridge = Bridge()
    with patch("bridge.settings", {"download_folder": str(music_dir)}):
        trav = bridge.read_local_audio("../secret.m4a")
        assert trav["success"] is False
        assert "outside" in trav["error"].lower()

        ext_res = bridge.read_local_audio("malware.exe")
        assert ext_res["success"] is False
        assert "extension" in ext_res["error"].lower()

        orig_stat = Path.stat

        def fake_stat(self: Path, *args, **kwargs):
            st = orig_stat(self, *args, **kwargs)
            if self.name == "huge.mp3":
                return SimpleNamespace(st_size=65 * 1024 * 1024, st_mode=st.st_mode)
            return st

        with patch.object(Path, "stat", fake_stat):
            big_res = bridge.read_local_audio("huge.mp3")
        assert big_res["success"] is False
        assert "size" in big_res["error"].lower()


def test_check_local_files_reports_missing_and_treats_outside_as_missing(tmp_path: Path):
    music_dir = tmp_path / "Music"
    music_dir.mkdir()
    (music_dir / "present.m4a").write_bytes(b"OK")
    (tmp_path / "outside.m4a").write_bytes(b"OUTSIDE")

    bridge = Bridge()
    with patch("bridge.settings", {"download_folder": str(music_dir)}):
        res = bridge.check_local_files(["present.m4a", "gone.m4a", "../outside.m4a"])

    assert res["success"] is True
    assert res["missing"] == ["gone.m4a", "../outside.m4a"]
