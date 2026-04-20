import os
from pathlib import Path

# ── REQUIRED ENVIRONMENT VARIABLES ────────────────────────────────────────────
SERVICE_API_KEY = os.getenv("SERVICE_API_KEY", "").strip()
DOWNLOAD_SIGNING_SECRET = os.getenv("DOWNLOAD_SIGNING_SECRET", "").strip()

# ── OPTIONAL WITH DEFAULTS ────────────────────────────────────────────────────
TOKEN_TTL_SECONDS = int(os.getenv("TOKEN_TTL_SECONDS", "120"))
MAX_CONCURRENT_DOWNLOADS = int(os.getenv("MAX_CONCURRENT_DOWNLOADS", "3"))
RATE_LIMIT_BURST = int(os.getenv("RATE_LIMIT_BURST", "8"))
RATE_LIMIT_WINDOW_SECONDS = int(os.getenv("RATE_LIMIT_WINDOW_SECONDS", "60"))
RATE_LIMIT_DAILY = int(os.getenv("RATE_LIMIT_DAILY", "250"))
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "").strip()
TEMP_DIR = Path(os.getenv("TEMP_DIR", "/tmp/ytdlp-service"))
YOUTUBE_COOKIES = os.getenv("YOUTUBE_COOKIES", "")
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("ALLOWED_ORIGINS", "*").split(",")
    if origin.strip()
]

# ── YOUTUBE COOKIES (MULTIPLE SLOTS) ──────────────────────────────────────────
_ALL_COOKIES_B64 = [
    v for v in [
        os.getenv("YOUTUBE_COOKIES_B64", "").strip(),
        os.getenv("YOUTUBE_COOKIES_B64_2", "").strip(),
        os.getenv("YOUTUBE_COOKIES_B64_3", "").strip(),
    ] if v
]
YOUTUBE_COOKIES_B64 = _ALL_COOKIES_B64[0] if _ALL_COOKIES_B64 else ""

# ── INTERNAL CONSTANTS ────────────────────────────────────────────────────────
YTDLP_UPDATE_COOLDOWN = 3600  # máximo un intento de actualización por hora
MAX_COOKIE_SLOTS = 4
COOKIE_CHECK_INTERVAL = 6 * 3600  # chequeo completo cada 6 horas
RESOLVE_CACHE_MAX = 100_000
RESOLVE_CACHE_TTL = 86400  # 24 horas
YTDLP_CLIENTS = ["android_music", "ios", "android", "web"]
DEEZER_BASE = "https://api.deezer.com"
RAILWAY_PUBLIC_DOMAIN = os.getenv("RAILWAY_PUBLIC_DOMAIN", "")
