"""
MHL Music Desktop — pywebview launcher
Sirve el build de React (dist/) localmente y abre una ventana nativa.
Sin llamadas al backend Fly.io — todo pasa por bridge.py (Python puro).
"""
import sys
import threading
import time
import socket
from pathlib import Path
from http.server import HTTPServer, SimpleHTTPRequestHandler


def _base_dir() -> Path:
    """Directorio raíz: _MEIPASS cuando está congelado, o el directorio del script."""
    if getattr(sys, 'frozen', False):
        return Path(sys._MEIPASS)          # type: ignore[attr-defined]
    return Path(__file__).parent


def _unblock_app_files():
    """
    Elimina el Alternate Data Stream 'Zone.Identifier' (Mark of the Web) de los archivos
    de la aplicación si fue descargada en un archivo ZIP desde la web.
    En Windows, .NET Framework bloquea DLLs no confiables (como Python.Runtime.dll)
    si conservan dicha marca de zona remota.
    """
    if sys.platform != 'win32':
        return

    candidates = set()
    base = _base_dir()
    candidates.add(base)

    if getattr(sys, 'frozen', False):
        try:
            candidates.add(Path(sys.executable).parent)
        except Exception:
            pass

    for root_dir in candidates:
        if not root_dir.exists():
            continue
        try:
            for p in root_dir.rglob('*'):
                if p.is_file():
                    zone_path = Path(f'{p}:Zone.Identifier')
                    try:
                        if zone_path.exists():
                            zone_path.unlink(missing_ok=True)
                    except Exception:
                        pass
        except Exception:
            pass


_unblock_app_files()

import webview


def _dist_dir() -> Path:
    base = _base_dir()
    # Congelado: dist/ está dentro de _MEIPASS/dist
    # Desarrollo: dist/ está un nivel arriba del script
    candidate = base / 'dist'
    if candidate.exists():
        return candidate
    return base.parent / 'dist'


DIST_DIR = _dist_dir()
PORT = 8765


class _SpaHandler(SimpleHTTPRequestHandler):
    """Sirve dist/ como SPA: cualquier ruta desconocida → index.html."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DIST_DIR), **kwargs)

    def log_message(self, *_):
        pass

    def do_GET(self):
        target = DIST_DIR / self.path.lstrip('/')
        if not target.exists() or target.is_dir():
            self.path = '/index.html'
        super().do_GET()

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()


def _start_server(server: HTTPServer):
    server.serve_forever()


def _wait_for_server(port: int, timeout=10.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with socket.create_connection(('127.0.0.1', port), timeout=0.3):
                return True
        except OSError:
            time.sleep(0.1)
    return False


def _fatal(msg: str):
    """Muestra un error y termina — funciona aunque no haya consola (frozen)."""
    try:
        import ctypes
        ctypes.windll.user32.MessageBoxW(0, msg, 'MHL Music - Error de inicio', 0x10)
    except Exception:
        pass
    sys.exit(1)


def main():
    if not DIST_DIR.exists():
        _fatal(
            f'No se encontró la carpeta de la app:\n{DIST_DIR}\n\n'
            'Asegúrate de que el ejecutable no fue movido fuera de su carpeta.'
        )

    from bridge import Bridge

    try:
        server = HTTPServer(('127.0.0.1', 0), _SpaHandler)
    except OSError as exc:
        _fatal(f'No se pudo iniciar el servidor interno:\n{exc}')

    port = server.server_port
    t = threading.Thread(target=_start_server, args=(server,), daemon=True)
    t.start()

    if not _wait_for_server(port):
        _fatal('El servidor interno no respondió.')

    bridge = Bridge()

    window = webview.create_window(
        title='MHL Music - Cargando',
        url=f'http://127.0.0.1:{port}?platform=pywebview',
        js_api=bridge,
        width=1280,
        height=820,
        min_size=(960, 640),
        resizable=True,
        text_select=False,
        confirm_close=False,
    )

    bridge._window = window

    webview.start(debug=False)


if __name__ == '__main__':
    main()
