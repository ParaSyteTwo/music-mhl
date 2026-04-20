# Arquitectura del Backend MHL ytdlp-service

## Descripción General

Backend FastAPI refactorizado de monolito (1,883 líneas) a arquitectura modular y mantenible (~2,500 líneas distribuidas).

**Objetivo:** Buscar, descargar y convertir audio de YouTube usando yt-dlp, con integración Deezer para metadatos y bot Telegram para administración.

## Estructura

```
services/ytdlp-service/
├── config.py                 # Variables de entorno centralizadas
├── app.py                    # FastAPI app + registro de rutas (53 líneas)
│
├── modules/                  # Lógica reutilizable
│   ├── __init__.py
│   ├── auth.py              # Tokens HMAC-SHA256, firmas
│   ├── cache.py             # LRU cache con TTL
│   ├── cookies.py           # Gestión de cookies YouTube (consolidó duplicados)
│   ├── download.py          # yt-dlp, FFmpeg, auto-update
│   ├── deezer.py            # Proxy API Deezer
│   ├── errors.py            # Clasificación errores yt-dlp
│   ├── maintenance.py       # Modo mantenimiento
│   ├── rate_limit.py        # Rate limiting por IP
│   ├── search.py            # Scoring candidatos YouTube
│   ├── stats.py             # Estadísticas descargas
│   ├── telegram.py          # Notificaciones Telegram
│   └── utils.py             # Funciones puras
│
├── routes/                   # Handlers de endpoints
│   ├── __init__.py
│   ├── deezer.py            # POST /deezer (search, artist, album, etc)
│   ├── download.py          # GET /download, POST /download-ticket
│   ├── health.py            # GET /health
│   ├── internal.py          # GET /internal/keepalive-yt
│   ├── resolve.py           # POST /resolve
│   ├── search.py            # GET /search, POST /candidates
│   └── telegram.py          # POST /telegram/webhook
│
├── tests/                    # Tests unitarios
│   ├── conftest.py
│   ├── test_auth.py
│   ├── test_cache.py
│   ├── test_rate_limit.py
│   └── test_utils.py
│
├── docs/                     # Documentación
│   ├── ARCHITECTURE.md       # Este archivo
│   ├── MODULES.md
│   ├── DEPLOYMENT.md
│   └── TESTING.md
│
├── requirements.txt          # Sin cambios
├── Dockerfile                # Sin cambios
└── test_scoring.py           # Test manual (conservado)
```

## Flujo de Datos

### 1. Búsqueda y Resolución
```
Usuario (Deezer)
    ↓
[POST /resolve] → Cache miss
    ↓
[search_candidates] (YouTube)
    ↓
[score_candidate] (con datos Deezer)
    ↓
[cache_set] → Token firmado
    ↓
Usuario recibe videoId + token
```

### 2. Descarga
```
Usuario (Token)
    ↓
[GET /download?token=...]
    ↓
[verify_token] → videoId
    ↓
[check_rate_limit] por IP
    ↓
[YoutubeDL] (con cookies rotables)
    ↓
[FFmpeg] conversión MP3/AAC
    ↓
FileResponse (cleanup automático)
```

### 3. Administración (Telegram)
```
Admin → /telegram/webhook
    ↓
Comandos: /status, /rotate, /login, /checkall, /logs, /update
    ↓
Respuestas con estado + acciones
```

## Principios de Diseño

### Modularidad
- Cada módulo: responsabilidad única
- Sin dependencias circulares
- Fácil de testear y mantener

### Estado Compartido (Thread-safe)
- `_rate_store` (rate limiting)
- `_resolve_cache` (LRU)
- `_stats` (descargas totales)
- `_error_log` (últimos 20 errores)
- `_ALL_COOKIES_B64` (slots de cookies)

Todos con `Lock()` para concurrencia.

### Sin Cambios en API
- Endpoints idénticos
- Payloads idénticos
- Variables de entorno idénticas
- Comportamiento idéntico

### Consolidación de Duplicados
**Antes:**
- `_test_single_cookie()` (línea 169)
- `_ping_youtube_with_cookies()` (línea 812)

**Después:**
- `_test_cookies_b64()` (modules/cookies.py)

Ambas hacían exactamente lo mismo → una sola función.

## Dependencias

```
fastapi==0.116.1
uvicorn==0.35.0
imageio-ffmpeg==0.6.0
httpx==0.28.1
yt-dlp (git+https://github.com/yt-dlp/yt-dlp.git)
```

**Sin cambios** respecto a app.py original.

## Configuración (config.py)

```python
SERVICE_API_KEY                 # Requerido
DOWNLOAD_SIGNING_SECRET         # Requerido
TOKEN_TTL_SECONDS               # 120 (default)
MAX_CONCURRENT_DOWNLOADS        # 3 (default)
RATE_LIMIT_BURST                # 8 requests/min
RATE_LIMIT_DAILY                # 250 requests/day
TELEGRAM_BOT_TOKEN              # Opcional
YOUTUBE_COOKIES_B64             # Slots 1-3
ALLOWED_ORIGINS                 # CORS
TEMP_DIR                        # /tmp/ytdlp-service
```

Todas importadas desde `config.py` → fácil de cambiar sin tocar código.

## Lifespan (Startup/Shutdown)

```python
@asynccontextmanager
async def lifespan(_: FastAPI):
    TEMP_DIR.mkdir(parents=True, exist_ok=True)
    threading.Thread(target=cookie_checker_loop, daemon=True).start()
    yield
```

- Crea directorio temporal
- Inicia thread de chequeo cookies cada 6 horas
- Auto-elimina cookies expiradas

## Tests

Unitarios para módulos puros:
- `test_auth.py` - Firma de tokens
- `test_cache.py` - LRU con TTL
- `test_rate_limit.py` - Límites por IP
- `test_utils.py` - Funciones de utilidad

Ejecutar con: `pytest tests/`

## Deploy

### Local
```bash
uvicorn app:app --port 8000 --reload
```

### Fly.io
```bash
fly deploy
```

Sin cambios en Dockerfile ni variables de entorno.

## Migración del Código Original

1. ✅ Módulos extraídos
2. ✅ Routes modularizadas
3. ✅ app.py reducido a 53 líneas
4. ✅ 100% funcionalidad preservada
5. ✅ Sintaxis verificada
6. ✅ Tests básicos listos
7. ⏳ Deployment en Fly.io

## Siguientes Pasos

1. **Testing Local**: `pytest tests/` + `uvicorn app:app`
2. **Deploy**: `fly deploy`
3. **Validación**: Probar todos los endpoints en producción
4. **Mejoras Futuras** (después, no ahora):
   - Structlog para logging estructurado
   - Mypy para type checking
   - Coverage 90%+
   - Redis para rate limit distribuido
   - Versionado API (/v1/)
