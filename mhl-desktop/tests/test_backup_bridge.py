"""Pytest suite for Desktop native backup export & import."""
from __future__ import annotations

import json
import sys
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from bridge import Bridge


def test_export_backup_uses_save_dialog_when_available(tmp_path):
    dest = tmp_path / "my-backup"
    mock_window = MagicMock()
    mock_window.create_file_dialog.return_value = str(dest)
    fake_webview = SimpleNamespace(
        windows=[mock_window],
        SAVE_DIALOG=30,
        OPEN_DIALOG=10,
    )

    payload = json.dumps({"state": {"downloads": [{"id": "dz-1"}]}})
    with (
        patch.dict(sys.modules, {"webview": fake_webview}),
        patch("bridge.Path.home", return_value=tmp_path),
    ):
        res = Bridge().export_backup(payload, "mhl-music-backup-2026-11-28.json")

    assert res["success"] is True
    assert res["fileName"] == "my-backup.json"
    saved = dest.with_suffix(".json")
    assert saved.exists()
    assert json.loads(saved.read_text(encoding="utf-8")) == json.loads(payload)


def test_export_backup_returns_cancelled_when_user_closes_dialog(tmp_path):
    mock_window = MagicMock()
    mock_window.create_file_dialog.return_value = None
    fake_webview = SimpleNamespace(windows=[mock_window], SAVE_DIALOG=30)

    payload = json.dumps({"state": {"downloads": []}})
    with (
        patch.dict(sys.modules, {"webview": fake_webview}),
        patch("bridge.Path.home", return_value=tmp_path),
    ):
        res = Bridge().export_backup(payload, "backup.json")

    assert res["success"] is False
    assert res["cancelled"] is True


def test_export_backup_rejects_invalid_json():
    res = Bridge().export_backup("{not valid json")
    assert res["success"] is False
    assert "invalid" in res["error"].lower()


def test_import_backup_reads_and_validates_selected_file(tmp_path):
    src = tmp_path / "restore.json"
    payload = json.dumps({"state": {"downloads": [{"id": "dz-99"}]}})
    src.write_text(payload, encoding="utf-8")

    mock_window = MagicMock()
    mock_window.create_file_dialog.return_value = [str(src)]
    fake_webview = SimpleNamespace(windows=[mock_window], OPEN_DIALOG=10)

    with (
        patch.dict(sys.modules, {"webview": fake_webview}),
        patch("bridge.Path.home", return_value=tmp_path),
    ):
        res = Bridge().import_backup()

    assert res["success"] is True
    assert res["filePath"] == str(src.resolve())
    assert json.loads(res["data"]) == json.loads(payload)


def test_import_backup_rejects_oversized_file(tmp_path):
    src = tmp_path / "huge.json"
    src.write_bytes(b"a" * (10 * 1024 * 1024 + 5))

    mock_window = MagicMock()
    mock_window.create_file_dialog.return_value = [str(src)]
    fake_webview = SimpleNamespace(windows=[mock_window], OPEN_DIALOG=10)

    with (
        patch.dict(sys.modules, {"webview": fake_webview}),
        patch("bridge.Path.home", return_value=tmp_path),
    ):
        res = Bridge().import_backup()

    assert res["success"] is False
    assert "10 mb" in res["error"].lower()
