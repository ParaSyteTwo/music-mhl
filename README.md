# MHL Music

MHL Music es una app web y Android para buscar, reproducir y descargar musica.

## Arquitectura actual

- Frontend: React + TypeScript + Vite
- Estado: Zustand
- Backend web: Supabase Edge Functions
- Servicio de descargas web: `services/ytdlp-service` desplegado en Railway
- Android: Capacitor + plugin nativo `yt-dlp`

### Flujo de descarga

- Web: navegador -> `yt-stream` -> ticket firmado -> `ytdlp-service`
- Android: app -> plugin nativo `yt-dlp`

`deezer-search` queda limitado a Deezer y metadatos. `yt-stream` actua como broker para descargas web.

## Estructura relevante

```text
src/
  lib/api/musicApi.ts
  lib/ytdlpBridge.ts
  store/musicStore.ts
supabase/functions/
  deezer-search/
  yt-stream/
services/
  ytdlp-service/
docs/
  context.md
```

## Variables de entorno

### Frontend

```env
VITE_SUPABASE_URL=https://your_project_id.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_publishable_key
```

### Secrets de Supabase

```env
YTDLP_SERVICE_URL=https://your-railway-service.up.railway.app
YTDLP_SERVICE_KEY=change-me
YTDLP_SIGNING_SECRET=change-me
YTDLP_TOKEN_TTL_SECONDS=120
YTDLP_RATE_LIMIT_BURST=8
YTDLP_RATE_LIMIT_WINDOW_SECONDS=60
YTDLP_DAILY_LIMIT=250
```

### Env de Railway

```env
SERVICE_API_KEY=change-me
DOWNLOAD_SIGNING_SECRET=change-me
TOKEN_TTL_SECONDS=120
MAX_CONCURRENT_DOWNLOADS=3
TEMP_DIR=/tmp/ytdlp-service
PORT=8080
```

`YTDLP_SIGNING_SECRET` y `DOWNLOAD_SIGNING_SECRET` deben tener el mismo valor.

## Desarrollo local

### Web

```bash
npm install
npm run dev
```

### Supabase functions

```bash
supabase login
supabase functions deploy deezer-search
supabase functions deploy yt-stream
supabase secrets set YTDLP_SERVICE_URL=https://your-railway-service.up.railway.app
supabase secrets set YTDLP_SERVICE_KEY=change-me
supabase secrets set YTDLP_SIGNING_SECRET=change-me
supabase secrets set YTDLP_TOKEN_TTL_SECONDS=120
supabase secrets set YTDLP_RATE_LIMIT_BURST=8
supabase secrets set YTDLP_RATE_LIMIT_WINDOW_SECONDS=60
supabase secrets set YTDLP_DAILY_LIMIT=250
```

### Railway

Desplegar `services/ytdlp-service/` como servicio Docker.

- Build context: `services/ytdlp-service`
- Healthcheck: `GET /health`
- No requiere volumen persistente para v1
- Instala `ffmpeg` desde el `Dockerfile`

## Validacion esperada

- La web obtiene ticket desde `yt-stream`.
- La descarga final viene del servicio Railway.
- Tokens caducados fallan.
- Android sigue descargando por el plugin nativo.

## Contexto para agentes

- Fuente principal: `docs/context.md`
- Resumen corto para Claude: `claude.md`
