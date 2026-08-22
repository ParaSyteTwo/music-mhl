"""Pytest suite for M4A tagging in bridge.Bridge."""
from __future__ import annotations

import base64
import sys
import types
from unittest.mock import patch, MagicMock
from bridge import Bridge


def test_tag_and_save_m4a_sets_all_metadata_atoms():
    bridge = Bridge()
    fake_audio_b64 = base64.b64encode(b"fake-audio-content").decode("utf-8")

    class MockMP4(dict):
        def save(self):
            pass

    mock_mp4_obj = MockMP4()

    mock_path_inst = MagicMock()
    mock_path_inst.resolve.return_value = mock_path_inst
    mock_path_inst.parent = MagicMock()
    mock_path_inst.stat.return_value.st_size = 12345

    mock_mutagen = types.ModuleType("mutagen")
    mock_mutagen_mp4 = types.ModuleType("mutagen.mp4")
    mock_mutagen_mp4.MP4 = lambda p: mock_mp4_obj
    mock_mutagen_mp4.MP4Cover = MagicMock()
    mock_mutagen.mp4 = mock_mutagen_mp4

    with patch.dict(sys.modules, {"mutagen": mock_mutagen, "mutagen.mp4": mock_mutagen_mp4}):
        with patch("pathlib.Path", return_value=mock_path_inst):
            res = bridge.tag_and_save_m4a(
                file_path="C:/Music/test_song.m4a",
                audio_b64=fake_audio_b64,
                title="MIRROR",
                artist="Ado",
                album="MIRROR",
                cover_url=None,
                lyrics="[00:16.50] Da-da-da-dance in the mirror",
                album_artist="Ado",
                composer="TeddyLoid",
                genre="J-Pop",
                year="2024",
                track_number=1,
                track_total=1,
                disc_number=1,
                disc_total=1,
            )

    assert res["success"] is True
    assert mock_mp4_obj["\xa9nam"] == "MIRROR"
    assert mock_mp4_obj["\xa9ART"] == "Ado"
    assert mock_mp4_obj["\xa9alb"] == "MIRROR"
    assert mock_mp4_obj["aART"] == "Ado"
    assert mock_mp4_obj["\xa9wrt"] == "TeddyLoid"
    assert mock_mp4_obj["\xa9gen"] == "J-Pop"
    assert mock_mp4_obj["\xa9day"] == "2024"
    assert mock_mp4_obj["trkn"] == [(1, 1)]
    assert mock_mp4_obj["disk"] == [(1, 1)]
    assert mock_mp4_obj["\xa9lyr"] == "[00:16.50] Da-da-da-dance in the mirror"
