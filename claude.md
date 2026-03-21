# MHL Music

Resumen operativo corto para agentes. La fuente principal de contexto es `docs/context.md`.

## Leer primero

- `docs/context.md`
- `docs/superpowers/specs/`

## Proyecto

- App web + Android para buscar, reproducir y descargar musica.
- Web: React + Vite + Supabase Edge Functions.
- Android: Capacitor + plugin nativo `yt-dlp`.
- Descarga web: `yt-stream` como broker y `services/ytdlp-service` como servicio externo.

## Reglas de trabajo

- Mantener `deezer-search` solo para metadata y busqueda de Deezer.
- No exponer secretos al navegador.
- No proxyar audio pesado por Supabase.
- No romper el flujo Android al tocar la web.
- Tipos TypeScript y cambios acotados a la arquitectura existente.
