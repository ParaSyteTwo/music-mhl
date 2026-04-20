import asyncio
import base64
import os
import subprocess
import tempfile
import threading
from pathlib import Path
from threading import Lock
from typing import Any

from config import TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
from .utils import utc_now_ts

_ALL_COOKIES_B64: list[str] = [
    v for v in [
        os.getenv("YOUTUBE_COOKIES_B64", "").strip(),
        os.getenv("YOUTUBE_COOKIES_B64_2", "").strip(),
        os.getenv("YOUTUBE_COOKIES_B64_3", "").strip(),
    ]
    if v
]

_cookies_index = 0
_cookies_lock = Lock()
_MAX_COOKIE_SLOTS = 4
_COOKIE_CHECK_INTERVAL = 6 * 3600


def _decode_cookies_to_file(b64: str, path: Path) -> None:
    """Decodifica cookies b64 y las escribe a un archivo Netscape cookies.txt"""
    _b64 = b64.rstrip("=")
    _b64 += "=" * (-len(_b64) % 4)
    path.write_bytes(base64.b64decode(_b64))


def _test_cookies_b64(b64: str) -> bool:
    """Testa un set de cookies haciendo una petición silenciosa a YouTube.
    Consolidación de _test_single_cookie() y _ping_youtube_with_cookies()."""
    try:
        with tempfile.TemporaryDirectory() as tmp:
            cookies_path = Path(tmp) / "cookies.txt"
            _decode_cookies_to_file(b64, cookies_path)
            result = subprocess.run(
                [
                    "yt-dlp",
                    "--cookies",
                    str(cookies_path),
                    "--skip-download",
                    "--quiet",
                    "--no-warnings",
                    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                ],
                capture_output=True,
                timeout=30,
            )
            return result.returncode == 0
    except Exception:
        return False


def get_active_cookies_b64() -> str:
    """Devuelve el set de cookies activo según el índice actual."""
    if not _ALL_COOKIES_B64:
        return ""
    with _cookies_lock:
        return _ALL_COOKIES_B64[_cookies_index % len(_ALL_COOKIES_B64)]


def rotate_cookies() -> None:
    """Rota al siguiente set de cookies disponible."""
    global _cookies_index
    if len(_ALL_COOKIES_B64) <= 1:
        return
    with _cookies_lock:
        _cookies_index = (_cookies_index + 1) % len(_ALL_COOKIES_B64)
        print(
            f"[cookies] Rotando a cookies #{_cookies_index + 1}/{len(_ALL_COOKIES_B64)}",
            flush=True,
        )


def check_all_cookies() -> dict[str, int]:
    """
    Testa todos los slots en paralelo.
    Elimina los que fallan y ajusta el índice activo.
    Retorna informe {total, ok, removed}.
    """
    global _cookies_index
    with _cookies_lock:
        slots = list(enumerate(_ALL_COOKIES_B64))

    if not slots:
        return {"total": 0, "ok": 0, "removed": 0}

    results: list[tuple[int, bool]] = []
    threads = []

    def _test(idx: int, b64: str) -> None:
        ok = _test_cookies_b64(b64)
        results.append((idx, ok))
        print(f"[cookie-check] slot #{idx + 1} ok={ok}", flush=True)

    for i, b64 in slots:
        t = threading.Thread(target=_test, args=(i, b64), daemon=True)
        threads.append(t)
        t.start()
    for t in threads:
        t.join(timeout=40)

    bad_indices = {i for i, ok in results if not ok}

    if bad_indices:
        with _cookies_lock:
            for i in sorted(bad_indices, reverse=True):
                if i < len(_ALL_COOKIES_B64):
                    _ALL_COOKIES_B64.pop(i)
            _cookies_index = _cookies_index % max(1, len(_ALL_COOKIES_B64))

    return {
        "total": len(slots),
        "ok": len(slots) - len(bad_indices),
        "removed": len(bad_indices),
    }


def add_cookie_smart(b64: str) -> dict[str, Any]:
    """
    Añade una cookie de forma inteligente:
    - Si hay slots rotos → reemplaza el primero roto
    - Si todos OK y hay espacio (< _MAX_COOKIE_SLOTS) → añade nuevo slot
    - Si todos OK y slots llenos → reemplaza el más antiguo (índice 0)
    Retorna informe con la acción tomada.
    """
    global _cookies_index
    with _cookies_lock:
        slots = list(enumerate(_ALL_COOKIES_B64))

    if not slots:
        with _cookies_lock:
            _ALL_COOKIES_B64.append(b64)
        return {"action": "added", "slot": 1, "total": 1}

    results: list[tuple[int, bool]] = []
    threads = []

    def _test(idx: int, b64_slot: str) -> None:
        ok = _test_cookies_b64(b64_slot)
        results.append((idx, ok))

    for i, b64_slot in slots:
        t = threading.Thread(target=_test, args=(i, b64_slot), daemon=True)
        threads.append(t)
        t.start()
    for t in threads:
        t.join(timeout=40)

    bad = [i for i, ok in sorted(results) if not ok]
    total_ok = len(slots) - len(bad)

    with _cookies_lock:
        if bad:
            target = bad[0]
            _ALL_COOKIES_B64[target] = b64
            _cookies_index = target
            action = "replaced_broken"
            slot = target + 1
        elif len(_ALL_COOKIES_B64) < _MAX_COOKIE_SLOTS:
            _ALL_COOKIES_B64.append(b64)
            slot = len(_ALL_COOKIES_B64)
            _cookies_index = slot - 1
            action = "added"
        else:
            target = _cookies_index % len(_ALL_COOKIES_B64)
            _ALL_COOKIES_B64[target] = b64
            slot = target + 1
            action = "replaced_active"

    return {
        "action": action,
        "slot": slot,
        "total": len(_ALL_COOKIES_B64),
        "previously_ok": total_ok,
        "previously_broken": len(bad),
    }


async def _send_telegram_internal(text: str) -> None:
    """Envía mensaje de Telegram de forma no bloqueante. No lanza excepciones."""
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        return
    try:
        import urllib.parse
        import urllib.request

        data = urllib.parse.urlencode(
            {
                "chat_id": TELEGRAM_CHAT_ID,
                "text": text,
                "parse_mode": "HTML",
            }
        ).encode()
        req = urllib.request.Request(
            f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
            data=data,
        )
        urllib.request.urlopen(req, timeout=10)
    except Exception as e:
        print(f"[telegram] Error enviando mensaje: {e}", flush=True)


def cookie_checker_loop() -> None:
    """Thread de fondo que chequea todas las cookies cada 6 horas."""
    import time as _time

    _time.sleep(60)
    while True:
        _time.sleep(_COOKIE_CHECK_INTERVAL)
        if not _ALL_COOKIES_B64:
            continue
        print("[cookie-check] Iniciando chequeo periódico...", flush=True)
        report = check_all_cookies()
        total, ok, removed = report["total"], report["ok"], report["removed"]
        bar = "🟢" * ok + "❌" * removed
        msg = f"🍪 Chequeo periódico de cookies\n{bar}\n✅ {ok}/{total} activas"
        if removed:
            msg += f"\n❌ {removed} eliminadas por inválidas"
            if ok == 0:
                msg += "\n\n⚠️ ¡Sin cookies válidas! Usa /login para renovarlas."
        threading.Thread(
            target=lambda m=msg: asyncio.run(_send_telegram_internal(m)),
            daemon=True,
        ).start()


def get_cookies_total() -> int:
    """Retorna el número total de slots de cookies disponibles."""
    return len(_ALL_COOKIES_B64)


def get_cookies_index() -> int:
    """Retorna el índice actual de cookies (0-based)."""
    with _cookies_lock:
        return _cookies_index
