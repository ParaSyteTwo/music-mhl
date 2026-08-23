from pathlib import Path
import socket
import threading

import launcher


def test_internal_server_uses_available_dynamic_port():
    server = launcher.HTTPServer(('127.0.0.1', 0), launcher._SpaHandler)
    thread = threading.Thread(
        target=launcher._start_server,
        args=(server,),
        daemon=True,
    )
    thread.start()

    try:
        assert server.server_port > 0
        assert launcher._wait_for_server(server.server_port, timeout=2)
        with socket.create_connection(('127.0.0.1', server.server_port), timeout=1):
            pass
    finally:
        server.shutdown()
        server.server_close()


def test_unblock_app_files_removes_zone_identifier(monkeypatch):
    import sys
    import tempfile
    if sys.platform != 'win32':
        return

    with tempfile.TemporaryDirectory() as tmp_dir:
        fake_base = Path(tmp_dir) / 'app'
        fake_base.mkdir()
        fake_dll = fake_base / 'Python.Runtime.dll'
        fake_dll.write_text('dummy binary content', encoding='utf-8')

        zone_stream = Path(f'{fake_dll}:Zone.Identifier')
        zone_stream.write_text('[ZoneTransfer]\nZoneId=3\n', encoding='utf-8')

        assert zone_stream.exists()

        monkeypatch.setattr(launcher, '_base_dir', lambda: fake_base)
        launcher._unblock_app_files()

        assert not zone_stream.exists()
        assert fake_dll.exists()


