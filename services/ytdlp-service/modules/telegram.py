from config import TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID


async def send_telegram(text: str) -> None:
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
