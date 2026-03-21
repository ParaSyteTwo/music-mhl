# MHL Music Context

## Product State

MHL Music is a web and Android music app.

- Web uses React + Vite and downloads through a Supabase broker plus an external `yt-dlp` service.
- Android keeps using the native Capacitor `yt-dlp` plugin in `android/app/src/main/java/com/mhl/music/YtDlpPlugin.java`.
- Deezer remains the source for search metadata and previews.
- Supabase Edge Functions remain the backend integration layer for the web app.

This document is the shared source of truth for coding agents working on this repository.

## Main Paths

- `src/lib/api/musicApi.ts`: browser-facing API bridge
- `src/store/musicStore.ts`: download orchestration and persistence
- `supabase/functions/deezer-search/index.ts`: Deezer metadata proxy
- `supabase/functions/yt-stream/index.ts`: web download broker and ticket issuer
- `services/ytdlp-service/`: external `yt-dlp` HTTP service for Railway
- `src/lib/ytdlpBridge.ts`: Android native bridge

## Download Architecture

### Web

1. The browser asks `yt-stream` for a download ticket.
2. `yt-stream` rate-limits the caller and resolves the best YouTube candidate through `ytdlp-service`.
3. `yt-stream` signs a short-lived token and returns `{ downloadUrl, fileName, expiresAt }`.
4. The browser downloads directly from `ytdlp-service`.
5. Supabase does not proxy large audio payloads.

### Android

1. The app searches and downloads with the native Capacitor plugin.
2. No Supabase broker is used for audio bytes.
3. Android behavior must not regress when web download logic changes.

## Constraints

- Do not expose service secrets to the browser.
- Do not proxy large audio responses through Supabase.
- Keep Android download behavior unchanged unless explicitly requested.
- Keep `deezer-search` limited to Deezer metadata/search responsibilities.
- Use short-lived signed tokens for direct download access.

## Service Contracts

### Browser -> `yt-stream`

Request:

```json
{
  "action": "webDownloadTicket",
  "title": "Song title",
  "artist": "Artist name",
  "format": "mp3"
}
```

Success response:

```json
{
  "success": true,
  "downloadUrl": "https://service.example.com/download?token=...",
  "fileName": "Artist - Song title.mp3",
  "expiresAt": "2026-03-21T17:00:00.000Z"
}
```

### `yt-stream` -> `ytdlp-service`

- `GET /health`
- `GET /search?q=...`
- `POST /resolve`
- `GET /download?token=...`

`yt-stream` uses a server-only API key for `/search` and `/resolve`.
`/download` is protected with a signed short-lived token instead of a static key.

### `resolve` response

```json
{
  "success": true,
  "videoId": "abc123",
  "title": "Resolved title",
  "duration": 212,
  "format": "mp3",
  "fileName": "Artist - Song title.mp3",
  "token": "signed-token",
  "expiresAt": "2026-03-21T17:00:00.000Z"
}
```

## Env and Secrets

### Frontend

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

### Supabase secrets

- `YTDLP_SERVICE_URL`
- `YTDLP_SERVICE_KEY`
- `YTDLP_SIGNING_SECRET`
- `YTDLP_TOKEN_TTL_SECONDS`
- `YTDLP_RATE_LIMIT_BURST`
- `YTDLP_RATE_LIMIT_WINDOW_SECONDS`
- `YTDLP_DAILY_LIMIT`

### Railway service env

- `SERVICE_API_KEY`
- `DOWNLOAD_SIGNING_SECRET`
- `TOKEN_TTL_SECONDS`
- `MAX_CONCURRENT_DOWNLOADS`
- `TEMP_DIR`
- `PORT`

## Acceptance Criteria

- Web downloads get a ticket from `yt-stream` and then fetch audio from the external service.
- Tokens expire and expired tokens are rejected.
- Normal sequential user downloads do not trigger visible throttling.
- `deezer-search` handles Deezer-only actions.
- Android still downloads through the native plugin.

## Operational Risks

- Supabase in-memory rate limiting is best-effort and instance-local.
- Temporary YouTube extraction failures must surface as clean 4xx/5xx errors.
- `yt-dlp` and `ffmpeg` updates may change extraction behavior over time.
- Direct download links must stay short-lived to reduce abuse.
