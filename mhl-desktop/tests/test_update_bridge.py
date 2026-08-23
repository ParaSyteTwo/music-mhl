import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from bridge import Bridge, APP_VERSION


def test_get_app_info_returns_version_and_platform():
    bridge = Bridge()
    info = bridge.get_app_info()

    assert info['success'] is True
    assert info['version'] == APP_VERSION
    assert info['platform'] == 'desktop'
    assert 'frozen' in info
    assert 'app_dir' in info


def test_apply_desktop_update_rejects_non_https():
    bridge = Bridge()
    res = bridge.apply_desktop_update('http://insecure.com/app.zip', '1.5.5')
    assert res['success'] is False
    assert 'Invalid' in res['error']


def test_apply_desktop_update_downloads_and_spawns_helper(monkeypatch):
    bridge = Bridge()
    test_tmp = Path(__file__).parent / '_test_tmp_updater'
    if test_tmp.exists():
        import shutil
        shutil.rmtree(test_tmp, ignore_errors=True)
    test_tmp.mkdir(parents=True, exist_ok=True)

    try:
        # Mock requests.get
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.iter_content.return_value = [b'dummy zip content']

        # Mock subprocess.Popen
        mock_popen = MagicMock()

        # Mock tempfile.mkdtemp
        monkeypatch.setattr('tempfile.mkdtemp', lambda prefix='': str(test_tmp))
        monkeypatch.setattr('requests.get', lambda *args, **kwargs: mock_resp)
        monkeypatch.setattr('subprocess.Popen', mock_popen)
        # Evitar que el thread cierre el proceso de pytest
        monkeypatch.setattr('threading.Thread.start', lambda self: None)

        res = bridge.apply_desktop_update('https://github.com/ParaSyteTwo/music-mhl/releases/download/v1.5.5/MHL-Music-Portable-1.5.5.zip', '1.5.5')

        assert res['success'] is True
        assert res['started'] is True

        # Verificar que el zip y el script de PowerShell fueron generados
        zip_file = test_tmp / 'MHL-Music-Portable-1.5.5.zip'
        ps1_file = test_tmp / 'update_runner.ps1'

        assert zip_file.exists()
        assert zip_file.read_bytes() == b'dummy zip content'

        assert ps1_file.exists()
        script_content = ps1_file.read_text(encoding='utf-8')
        assert 'Wait-Process' in script_content
        assert 'Expand-Archive' in script_content
        assert 'Unblock-File' in script_content
        assert 'Start-Process' in script_content

        # Verificar que subprocess.Popen fue invocado con PowerShell
        assert mock_popen.called
        args = mock_popen.call_args[0][0]
        assert 'powershell.exe' in args[0]
        assert '-pidToWait' in args
    finally:
        import shutil
        shutil.rmtree(test_tmp, ignore_errors=True)


def test_open_file_blocks_dangerous_executables(tmp_path, monkeypatch):
    bridge = Bridge()
    fake_exe = tmp_path / 'payload.exe'
    fake_exe.write_text('MZ dummy executable', encoding='utf-8')

    res = bridge.open_file(str(fake_exe))
    assert res['success'] is False
    assert 'Security check' in res['error']


def test_open_file_allows_safe_media_files(tmp_path, monkeypatch):
    bridge = Bridge()
    fake_mp3 = tmp_path / 'song.mp3'
    fake_mp3.write_text('ID3 dummy audio', encoding='utf-8')

    mock_startfile = MagicMock()
    monkeypatch.setattr('os.startfile', mock_startfile, raising=False)

    res = bridge.open_file(str(fake_mp3))
    assert res['success'] is True
    if sys.platform == 'win32':
        assert mock_startfile.called


