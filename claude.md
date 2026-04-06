# MHL Music

Resumen operativo para agentes.

## Proyecto

App web + Android para buscar, reproducir y descargar música.

- **Web:** React + Vite, static site en Render
- **Backend:** `services/ytdlp-service` en Railway (FastAPI + Python)
- **Android:** Capacitor + plugin nativo `yt-dlp`

## Arquitectura

**No hay Supabase.** Todo el backend es un solo servicio FastAPI en Railway.

Endpoints del backend:
- `POST /deezer` — proxy Deezer (search, artist, album, trackMeta, home, genre)
- `POST /candidates` — candidatos de YouTube para una canción
- `POST /download-ticket` — emite ticket firmado para descarga web
- `GET /download?token=...` — descarga el audio (con el ticket)
- `POST /resolve` — resuelve videoId + token sin picker
- `GET /search?q=...` — búsqueda raw en YouTube

## Variables de entorno del frontend

```
VITE_RAILWAY_URL=https://ytdlp-service-production-1b4b.up.railway.app
VITE_SERVICE_API_KEY=...
```

## Reglas de trabajo

- No exponer secretos al navegador.
- No proxyar audio pesado — el navegador descarga directo de Railway.
- No romper el flujo Android al tocar la web.
- Tipos TypeScript y cambios acotados a la arquitectura existente.
