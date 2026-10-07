import time
from unittest.mock import MagicMock, patch
from pathlib import Path
import pytest

from bridge import (
    Bridge,
    _is_outdated_ytdlp_error,
    _bin,
    _USER_BIN_DIR,
    _AUTO_UPDATE_COOLDOWN,
)


def test_is_outdated_ytdlp_error():
    assert _is_outdated_ytdlp_error("Sign in to confirm you're not a bot") is True
    assert _is_outdated_ytdlp_error("HTTP Error 403: Forbidden") is True
    assert _is_outdated_ytdlp_error("ERROR: Unable to extract video data") is True
    assert _is_outdated_ytdlp_error("n-sig extraction failed") is True
    assert _is_outdated_ytdlp_error("Signature extraction failed") is True
    assert _is_outdated_ytdlp_error("Some random file error") is False
    assert _is_outdated_ytdlp_error("") is False


def test_bin_prioritizes_user_dir(tmp_path, monkeypatch):
    test_user_bin = tmp_path / "yt-dlp.exe"
    test_user_bin.write_text("fake binary")

    monkeypatch.setattr("bridge._USER_BIN_DIR", tmp_path)
    assert _bin("yt-dlp.exe") == str(test_user_bin)


def test_ytdlp_get_version():
    b = Bridge()
    with patch("subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(returncode=0, stdout="2026.08.19\n", stderr="")
        res = b.ytdlp_get_version()
        assert res["success"] is True
        assert res["version"] == "2026.08.19"


def test_reactive_update_cooldown():
    b = Bridge()
    with patch.object(b, "ytdlp_update") as mock_update:
        mock_update.return_value = {"success": True, "status": "DONE"}

        # First trigger should succeed
        assert b._try_reactive_ytdlp_update() is True
        assert mock_update.call_count == 1

        # Second trigger within cooldown must return False and not invoke ytdlp_update
        assert b._try_reactive_ytdlp_update() is False
        assert mock_update.call_count == 1
