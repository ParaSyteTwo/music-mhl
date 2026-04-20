import asyncio
import base64
import json
import threading
from typing import Any

from fastapi import FastAPI, HTTPException, Request

from config import MAX_CONCURRENT_DOWNLOADS, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
from modules.cookies import (
    _ALL_COOKIES_B64,
    add_cookie_smart,
    check_all_cookies,
    get_cookies_index,
    rotate_cookies,
)
from modules.download import download_slots, try_auto_update_ytdlp, ytdlp_version_info
from modules.maintenance import get_maintenance_until, is_maintenance, set_maintenance
from modules.stats import _error_log, _error_log_lock, _stats, _stats_lock
from modules.telegram import send_telegram


def register_telegram_routes(app: FastAPI) -> None:
    """Registra las rutas de webhook de Telegram."""

    @app.post("/telegram/webhook")
    async def telegram_webhook(req: Request) -> dict[str, str]:
        """Recibe comandos del bot de Telegram."""
        if not TELEGRAM_BOT_TOKEN:
            raise HTTPException(status_code=503, detail="Telegram not configured")

        body = await req.json()
        message = body.get("message", {})
        text = message.get("text", "").strip()
        chat_id = str(message.get("chat", {}).get("id", ""))
        document = message.get("document")

        if chat_id != TELEGRAM_CHAT_ID:
            return {"ok": "ignored"}

        # Recepción de archivo cookies.txt
        if document:
            file_name = document.get("file_name", "")
            if not file_name.endswith(".txt"):
                await send_telegram(
                    "❌ Solo acepto archivos <b>.txt</b> de cookies en formato Netscape."
                )
                return {"ok": "handled"}
            try:
                await send_telegram(
                    "⏳ Recibiendo archivo y comprobando cookies existentes..."
                )
                file_id = document["file_id"]
                info_res = await asyncio.get_event_loop().run_in_executor(
                    None,
                    lambda: __import__("urllib.request").request.urlopen(
                        f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/getFile?file_id={file_id}",
                        timeout=10,
                    ).read(),
                )
                info = json.loads(info_res)
                file_path_tg = info["result"]["file_path"]

                file_bytes = await asyncio.get_event_loop().run_in_executor(
                    None,
                    lambda: __import__("urllib.request").request.urlopen(
                        f"https://api.telegram.org/file/bot{TELEGRAM_BOT_TOKEN}/{file_path_tg}",
                        timeout=15,
                    ).read(),
                )

                header = (
                    file_bytes[:100].decode("utf-8", errors="ignore").lower()
                )
                is_valid_netscape = "netscape" in header and "cookie" in header

                if not is_valid_netscape:
                    first_line = file_bytes[:100].decode("utf-8", errors="ignore")
                    print(
                        f"[cookie-upload] Validación fallida. Primeros 100 chars: {repr(first_line)}",
                        flush=True,
                    )
                    await send_telegram(
                        f"❌ El archivo no parece un archivo de cookies Netscape válido.\nExportalo con Cookie Quick Manager en Firefox.\n\n<i>Debug: {repr(first_line[:50])}</i>"
                    )
                    return {"ok": "handled"}

                b64 = base64.b64encode(file_bytes).decode("ascii")
                report = await asyncio.get_event_loop().run_in_executor(
                    None, lambda: add_cookie_smart(b64)
                )
                set_maintenance(False)

                total = report["total"]
                slot = report["slot"]
                action_labels = {
                    "added": f"➕ Nueva cookie añadida como slot #{slot}",
                    "replaced_broken": f"🔄 Reemplazó slot roto #{slot}",
                    "replaced_active": f"♻️ Reemplazó slot activo #{slot} (todos estaban llenos)",
                }
                action_text = action_labels.get(
                    report["action"], "✅ Cookie aplicada"
                )
                bar = "".join(
                    "🟢" if i < slot else "⬜" for i in range(total)
                )
                status_icon = (
                    "✅"
                    if report["action"] == "added"
                    else "🔄"
                    if "roto" in report["action"]
                    else "♻️"
                )
                await send_telegram(
                    f"<b>━━━━━━━━━━━━━━━━</b>\n"
                    f"{status_icon} <b>cookies.txt Procesado</b>\n"
                    f"<b>━━━━━━━━━━━━━━━━</b>\n\n"
                    f"{action_text}\n"
                    f"{bar}\n"
                    f"<b>{total}</b> slots activos\n\n"
                    f"🌐 Mantenimiento desactivado\n"
                    f"✅ Descargas reanudadas\n\n"
                    f"💾 <i>Para hacerlo permanente en Railway:</i>\n"
                    f"<code>YOUTUBE_COOKIES_B64_{slot}</code>\n\n"
                    f"<b>━━━━━━━━━━━━━━━━</b>"
                )
            except Exception as e:
                print(
                    f"[cookie-upload] Excepción: {type(e).__name__}: {e}",
                    flush=True,
                )
                await send_telegram(
                    f"❌ Error procesando el archivo:\n<code>{str(e)[:100]}</code>"
                )
            return {"ok": "handled"}

        if text.startswith("/status"):
            ytdlp = ytdlp_version_info()
            cookies_total = len(_ALL_COOKIES_B64)
            with _stats_lock:
                dl_today = _stats["today"]
                dl_total = _stats["total"]
                dl_errors = _stats["errors"]
            slots_free = download_slots._value  # type: ignore[attr-defined]

            maint_status = (
                "🔴 MANTENIMIENTO" if is_maintenance() else "🟢 OPERATIVO"
            )
            cookie_bar = (
                "".join(
                    "🟢" if i < get_cookies_index() + 1 else "⬜"
                    for i in range(cookies_total)
                )
                or "❌ sin cookies"
            )
            ytdlp_emoji = "✅" if ytdlp["age_days"] <= 30 else "⚠️"

            lines = [
                f"<b>━━━━━━━━━━━━━━━━</b>",
                f"<b>🎵 MHL Music Status</b>",
                f"<b>━━━━━━━━━━━━━━━━</b>",
                "",
                f"{maint_status}",
                "",
                f"<b>🍪 Cookies activas</b>",
                f"{cookie_bar}",
                f"#{get_cookies_index() + 1} de {cookies_total} en uso",
                "",
                f"<b>🔧 yt-dlp {ytdlp['version']}</b>",
                f"{ytdlp_emoji} {ytdlp['age_days']} días desde release",
                "",
                f"<b>📥 Descargas</b>",
                f"🌅 Hoy: <b>{dl_today}</b>  |  📊 Total: <b>{dl_total}</b>",
                f"❌ Errores: <b>{dl_errors}</b>",
                "",
                f"<b>⚡ Descargas simultáneas</b>",
                f"{slots_free}/{MAX_CONCURRENT_DOWNLOADS} slots libres",
                f"<b>━━━━━━━━━━━━━━━━</b>",
            ]
            if ytdlp["age_days"] > 30:
                lines.append(
                    "\n⚠️ <b>yt-dlp desactualizado</b> — usa /update para actualizar"
                )
            if is_maintenance():
                lines.append("\n🔧 El servicio está en mantenimiento — /status en 1 min")
            await send_telegram("\n".join(lines))

        elif text.startswith("/ping"):
            import time

            t0 = time.monotonic()
            ytdlp_version_info()
            ms = int((time.monotonic() - t0) * 1000)
            if ms < 500:
                emoji, status = "🟢", "Excelente"
            elif ms < 1000:
                emoji, status = "🟡", "Normal"
            else:
                emoji, status = "🔴", "Lento"
            await send_telegram(
                f"<b>━━━━━━━━━━━━━━━━</b>\n"
                f"🏓 <b>Ping del servidor</b>\n"
                f"<b>━━━━━━━━━━━━━━━━</b>\n\n"
                f"{emoji} <b>{ms}ms</b> — {status}\n\n"
                f"<b>━━━━━━━━━━━━━━━━</b>"
            )

        elif text.startswith("/logs"):
            with _error_log_lock:
                recent = list(_error_log)
            if not recent:
                await send_telegram(
                    "<b>━━━━━━━━━━━━━━━━</b>\n"
                    "✅ <b>Sin errores recientes</b>\n"
                    "<b>━━━━━━━━━━━━━━━━</b>\n\n"
                    "El sistema está funcionando correctamente."
                )
            else:
                lines = (
                    [
                        "<b>━━━━━━━━━━━━━━━━</b>",
                        f"🚨 <b>Últimos {len(recent[-10:])} errores</b>",
                        "<b>━━━━━━━━━━━━━━━━</b>",
                        "",
                    ]
                    + recent[-10:]
                    + ["", "<b>━━━━━━━━━━━━━━━━</b>"]
                )
                await send_telegram("\n".join(lines))

        elif text.startswith("/update"):
            await send_telegram("⏳ Actualizando yt-dlp...")

            def _do_update() -> None:
                ok = try_auto_update_ytdlp()
                info = ytdlp_version_info()
                msg = (
                    f"✅ yt-dlp actualizado a <b>{info['version']}</b>"
                    if ok
                    else f"⚠️ No se pudo actualizar (cooldown activo o error)\nVersión actual: {info['version']}"
                )
                asyncio.run(send_telegram(msg))

            threading.Thread(target=_do_update, daemon=True).start()

        elif text.startswith("/rotate"):
            if len(_ALL_COOKIES_B64) <= 1:
                await send_telegram(
                    "⚠️ Solo hay 1 set de cookies, no hay a dónde rotar."
                )
            else:
                prev = get_cookies_index() + 1
                rotate_cookies()
                new = get_cookies_index() + 1
                total = len(_ALL_COOKIES_B64)
                bar = "".join("🟢" if i < new else "⬜" for i in range(total))
                await send_telegram(
                    f"<b>━━━━━━━━━━━━━━━━</b>\n"
                    f"🔄 <b>Cookies rotadas</b>\n"
                    f"<b>━━━━━━━━━━━━━━━━</b>\n\n"
                    f"{bar}\n"
                    f"#{prev} ➜ #{new}/{total}\n\n"
                    f"<b>━━━━━━━━━━━━━━━━</b>"
                )

        elif text.startswith("/maintenance"):
            parts = text.split()
            if len(parts) < 2 or parts[1] not in ("on", "off"):
                await send_telegram("Uso: /maintenance on | /maintenance off")
            elif parts[1] == "on":
                set_maintenance(True, minutes=5)
                await send_telegram(
                    "<b>━━━━━━━━━━━━━━━━</b>\n"
                    "🔧 <b>Mantenimiento ACTIVADO</b>\n"
                    "<b>━━━━━━━━━━━━━━━━</b>\n\n"
                    "⏱️ Duración: 5 minutos\n"
                    "🌐 Descargas: pausadas en la web\n\n"
                    "<b>━━━━━━━━━━━━━━━━</b>"
                )
            else:
                set_maintenance(False)
                await send_telegram(
                    "<b>━━━━━━━━━━━━━━━━</b>\n"
                    "✅ <b>Mantenimiento DESACTIVADO</b>\n"
                    "<b>━━━━━━━━━━━━━━━━</b>\n\n"
                    "🌐 Descargas: reanudadas\n\n"
                    "<b>━━━━━━━━━━━━━━━━</b>"
                )

        elif text.startswith("/checkall"):
            if not _ALL_COOKIES_B64:
                await send_telegram("⚠️ No hay cookies configuradas.")
            else:
                await send_telegram(
                    f"⏳ Comprobando <b>{len(_ALL_COOKIES_B64)} slots</b> en paralelo..."
                )

                def _do_check() -> None:
                    report = check_all_cookies()
                    total, ok, removed = (
                        report["total"],
                        report["ok"],
                        report["removed"],
                    )
                    bar = "".join(
                        "🟢" if i < ok else "❌" for i in range(total)
                    )
                    lines = [
                        "<b>━━━━━━━━━━━━━━━━</b>",
                        "🍪 <b>Chequeo de cookies</b>",
                        "<b>━━━━━━━━━━━━━━━━</b>",
                        "",
                        bar,
                        f"<b>{ok}/{total}</b> válidas",
                    ]
                    if removed:
                        lines.append("")
                        lines.append(
                            f"❌ <b>{removed} eliminadas</b> automáticamente (inválidas)"
                        )
                        if ok == 0:
                            lines.append("")
                            lines.append("⚠️ <b>¡Sin cookies válidas!</b>")
                            lines.append("Usa /login para renovar.")
                    lines.append("")
                    lines.append("<b>━━━━━━━━━━━━━━━━</b>")
                    asyncio.run(send_telegram("\n".join(lines)))

                threading.Thread(target=_do_check, daemon=True).start()

        elif text.startswith("/login"):
            if is_maintenance():
                await send_telegram(
                    "🔧 Ya hay un mantenimiento activo.\nUsa /addcookie o envía el archivo cookies.txt directamente."
                )
            else:
                set_maintenance(True, minutes=10)
                await send_telegram(
                    "<b>━━━━━━━━━━━━━━━━</b>\n"
                    "🔧 <b>Modo Renovación de Cookies</b>\n"
                    "<b>━━━━━━━━━━━━━━━━</b>\n\n"
                    "<b>📱 Opción 1: Archivo Directo (RECOMENDADO)</b>\n"
                    "  1️⃣ Abre Firefox y ve a youtube.com\n"
                    "  2️⃣ Click derecho → Inspeccionar (DevTools)\n"
                    "  3️⃣ Tab <code>Storage</code> → <code>Cookies</code> → youtube.com\n"
                    "  4️⃣ Click derecho en una cookie → <code>Cookie Quick Manager</code> → Exportar\n"
                    "  5️⃣ Envía el archivo <b>cookies.txt</b> aquí (sin conversión)\n\n"
                    "<b>💻 Opción 2: Base64 desde Texto</b>\n"
                    "  • Exporta cookies.txt (pasos 1-4 arriba)\n"
                    "  • En Windows CMD (con el archivo cookies.txt en la carpeta actual):\n"
                    "    <code>python -c \"import base64; print(base64.b64encode(open('cookies.txt','rb').read()).decode())\" > b64.txt</code>\n"
                    "  • O en Mac/Linux:\n"
                    "    <code>cat cookies.txt | base64</code>\n"
                    "  • Copia el resultado y envía: <code>/addcookie <base64></code>\n\n"
                    "⏱️ <b>El bot testa todas las cookies en paralelo (~30s)</b>\n"
                    "✅ Descargas reanudadas al terminar\n\n"
                    "<b>━━━━━━━━━━━━━━━━</b>"
                )

        elif text.startswith("/addcookie"):
            parts = text.split(maxsplit=1)
            if len(parts) < 2:
                await send_telegram(
                    "<b>━━━━━━━━━━━━━━━━</b>\n"
                    "🍪 <b>Cómo Cargar Cookies</b>\n"
                    "<b>━━━━━━━━━━━━━━━━</b>\n\n"
                    "<b>✅ Mejor Opción: Archivo Directo</b>\n"
                    "  → Simplemente envía <b>cookies.txt</b> al chat\n"
                    "  → El bot lo convierte automáticamente\n"
                    "  → No necesitas hacer nada más\n\n"
                    "<b>📝 Alternativa: Usando Base64</b>\n"
                    "  <code>/addcookie <base64></code>\n\n"
                    "<b>🔄 Qué Pasa Después</b>\n"
                    "  1️⃣ El bot testa TODAS tus cookies existentes (en paralelo)\n"
                    "  2️⃣ Testa la nueva cookie\n"
                    "  3️⃣ Lugar inteligente:\n"
                    "     • Si hay alguna rota → reemplaza esa (🔄)\n"
                    "     • Si todas OK y hay espacio (max 4) → añade nueva (➕)\n"
                    "     • Si todas OK y slots llenos → reemplaza la actual (♻️)\n"
                    "  4️⃣ Te avisa del resultado con detalles\n\n"
                    "<b>⚠️ Qué es una Cookie \"Rota\"</b>\n"
                    "  • YouTube ha expirado (cambió tu contraseña, cerró sesión, etc)\n"
                    "  • El bot lo detecta automáticamente\n"
                    "  • Chequeo automático cada 6 horas\n\n"
                    "<b>━━━━━━━━━━━━━━━━</b>"
                )
            else:
                b64 = parts[1].strip()
                try:
                    _b64c = b64.rstrip("=")
                    _b64c += "=" * (-len(_b64c) % 4)
                    decoded = base64.b64decode(_b64c)
                    header = decoded[:100].decode("utf-8", errors="ignore").lower()
                    is_valid = "netscape" in header and "cookie" in header
                    if not is_valid:
                        raise ValueError(
                            f"No parece un archivo de cookies Netscape válido. Header: {repr(decoded[:50].decode('utf-8', errors='ignore'))}"
                        )
                    await send_telegram(
                        "⏳ Comprobando cookies existentes antes de añadir..."
                    )
                    report = await asyncio.get_event_loop().run_in_executor(
                        None, lambda: add_cookie_smart(b64)
                    )
                    set_maintenance(False)
                    total = report["total"]
                    slot = report["slot"]
                    action_labels = {
                        "added": f"➕ Nueva cookie añadida como slot #{slot}",
                        "replaced_broken": f"🔄 Reemplazó slot roto #{slot}",
                        "replaced_active": f"♻️ Reemplazó slot activo #{slot}",
                    }
                    action_text = action_labels.get(
                        report["action"], "✅ Cookie aplicada"
                    )
                    bar = "🟢" * total
                    await send_telegram(
                        f"✅ <b>Cookie aplicada</b>\n\n"
                        f"{action_text}\n"
                        f"{bar}  {total} slots activos\n\n"
                        "🌐 Mantenimiento desactivado — descargas reanudadas."
                    )
                except Exception as e:
                    print(
                        f"[addcookie-base64] Excepción: {type(e).__name__}: {e}",
                        flush=True,
                    )
                    await send_telegram(
                        f"❌ Error procesando cookie:\n<code>{str(e)[:100]}</code>"
                    )

        elif text.startswith("/help"):
            await send_telegram(
                "<b>━━━━━━━━━━━━━━━━</b>\n"
                "🎵 <b>MHL Bot — Guía Completa</b>\n"
                "<b>━━━━━━━━━━━━━━━━</b>\n\n"
                "<b>📊 Monitoreo</b>\n"
                "  /status — estado del servicio\n"
                "  🏓 /ping — latencia del servidor\n"
                "  🚨 /logs — últimos errores\n\n"
                "<b>🔧 Mantenimiento</b>\n"
                "  ⬆️ /update — actualizar yt-dlp\n"
                "  🔄 /rotate — rotar cookies\n"
                "  🍪 /checkall — chequear todas ahora\n\n"
                "<b>🔑 Renovar Cookies (cuando expiren)</b>\n"
                "  🔐 /login — activar modo renovación + guía\n"
                "  📄 <b>Envía cookies.txt directamente</b> (recomendado)\n"
                "  📎 /addcookie <base64> — si prefieres usar base64\n"
                "  🔧 /maintenance on|off — modo manual\n\n"
                "<b>━━━━━━━━━━━━━━━━</b>\n"
                "<b>💡 Detalles Importantes</b>\n"
                "  • El bot testa cada cookie antes de guardar\n"
                "  • Chequeo automático cada 6 horas\n"
                "  • Máximo 4 slots de cookies\n"
                "  • Descargas pausadas durante renovación\n"
                "<b>━━━━━━━━━━━━━━━━</b>"
            )

        return {"ok": "handled"}
