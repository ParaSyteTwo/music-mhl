# PRD — Product Requirements Document
> Project: MHL Music
> Last updated: 2026-04-17

## 1. Overview

App móvil Android (APK) + Web para buscar, reproducir y descargar música de YouTube. Versión 1.3.1 con autonomía offline total — el servidor es opcional y solo mejora la experiencia cuando está disponible.

## 2. Target Audience

Usuarios finales que quieren descargar y escuchar música offline en Android sin dependencias de servicios en la nube.

## 3. Core Features

| Feature | Priority | Description |
|---------|----------|-------------|
| Búsqueda offline local | P0 | Buscar en biblioteca local sin red (búsqueda en IndexedDB de tracks previamente descubiertos) |
| YouTube Search offline | P0 | Búsqueda directa en YouTube via yt-dlp local (sin pasar por servidor) |
| Descarga YouTube offline | P0 | Descarga audio MP3/AAC via youtube-dl-android, sin servidor |
| Biblioteca local | P0 | Escaneo de Documents/MHL Music/, reproducción, gestión de archivos |
| ID3 Tags | P0 | Escritura de metadatos y portada en archivos descargados |
| Reproducción | P1 | Motor de audio HTML5 con cola y controles |
| Búsqueda Deezer (online) | P2 | Proxy a Railway cuando hay conexión — degrada gracefully a YouTube-only si no hay red |

## 4. Acceptance Criteria

- [ ] APK se construye exitosamente con `npm run android`
- [ ] La búsqueda funciona 100% sin red usando YouTube directo via yt-dlp
- [ ] Las descargas guardan MP3 en Documents/MHL Music/ con ID3 tags correctos
- [ ] La biblioteca local escanea y reproduce archivos descargados
- [ ] No se requiere Railway para ninguna funcionalidad core
- [ ] La app funciona completamente offline tras la primera inicialización de yt-dlp
- [ ] Deezer search solo se usa como enhancement cuando hay conexión

## 5. Out of Scope (v1.3.1)

- Cambios en el backend Railway (sigue igual, no se toca)
- Web (Render) — sigue igual, no se toca
- Base de datos local pre-populada con contenido de inicio
- Cambio de arquitectura de estado (zustand persist se mantiene)

## 6. Success Metrics

- APK size < 80MB (reducido filtrando ABIs a ARM only ya está hecho)
- Descarga YouTube funciona sin conectividad de red
- Búsqueda por texto filtra resultados locales cuando no hay red
- Tiempo de búsqueda local < 100ms para library de < 1000 tracks
