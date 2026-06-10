# PRD — Product Requirements Document
> Project: MHL Music
> Version: 2.0
> Last updated: 2026-06-10

## 1. Overview

MHL Music es una app multi-plataforma para buscar, reproducir y descargar música usando Deezer como catálogo y YouTube como fuente de audio. Corre como PWA (iPhone/web), app Android nativa y app de escritorio Windows — cada plataforma completamente funcional e independiente.

## 2. Target Audience

| Plataforma | Usuario | Caso de uso |
|-----------|---------|-------------|
| PWA / Web | Amigos y conocidos con iPhone | Buscar y reproducir música sin instalar nada |
| Android | Usuario principal (Paul) | App nativa completa con descargas |
| Desktop | Usuario principal (Paul) | App Windows con descargas locales sin depender de ningún servicio externo |

## 3. Core Features

| Feature | Plataforma | Priority | Descripción |
|---------|-----------|----------|-------------|
| Búsqueda de música | Web + Android + Desktop | P0 | Buscar canciones, artistas y álbumes vía Deezer |
| Reproductor de audio | Web + Android + Desktop | P0 | Player con controles completos (play/pause/skip/seek/volumen) |
| Descarga de audio | Android + Desktop | P0 | Descargar MP3 con metadatos ID3 usando yt-dlp bundleado |
| PWA instalable | Web (iOS/iPhone) | P0 | App instalable desde Safari, funciona offline para library |
| Biblioteca local | Android + Desktop | P1 | Gestión de canciones descargadas, playlists |
| App Desktop self-contained | Desktop | P0 | `.exe` instalable, todo bundleado (yt-dlp + ffmpeg), sin backend externo |
| Historial / Playlists | Todos | P1 | Crear y gestionar playlists |
| Settings | Todos | P2 | Configuración de calidad, rutas de descarga, idioma |
| Auto-update asistido | Android | P1 | Detectar APK oficial, esperar 7 días de seguridad y abrir instalación confirmada |

## 4. Requisitos por Plataforma

### Web / PWA (iPhone focus)
- Debe funcionar 100% en Safari iOS (PWA installable)
- Búsqueda y reproducción de audio sin errores CORS
- Manifest correcto: icons, theme_color, display: standalone
- Service Worker activo para cache offline de la UI
- Sin funcionalidad de descarga (limitación iOS PWA)
- Tiempo de carga < 3s en móvil 4G

### Android
- Ya funciona al 100% — NO tocar sin razón
- Plugin nativo yt-dlp + ffmpeg bundleados
- Las futuras builds deben conservar compatibilidad con `ANDROID_UPDATE_CONTRACT.md`
- El updater solo puede consultar GitHub Releases de `ParaSyteTwo/music-mhl`
- Una build nueva no será instalable hasta 7 días después del último cambio del asset APK
- Toda instalación será confirmada por el usuario mediante Android

### Desktop (Windows — Tauri)
- Tauri v2 con Rust para el proceso principal
- yt-dlp.exe + ffmpeg.exe bundleados en `resources/win/` (ignorados por git)
- **Sin dependencia de Fly.io ni ningún backend externo — cero dependencias externas**
- Deezer search: llama a `api.deezer.com` directamente desde el webview Tauri (sin CORS en desktop nativo)
- Búsqueda YouTube y descargas: ejecutadas localmente vía Tauri Shell plugin → yt-dlp.exe
- **Ventana con frame nativo del SO** (`decorations: true`) — sin chrome customizado
- El frontend (React/Vite build) se sirve desde el proceso Tauri
- Instalador `.exe` generado con Tauri bundler (NSIS)
- Auto-updater opcional (v2.1)
- ⚠️ BUG CONOCIDO: la búsqueda en Desktop Tauri no funciona — el frontend no detecta correctamente el contexto Tauri y hace fallback al backend Fly.io. Fix en TECH_DESIGN.md §4.

## 5. Acceptance Criteria

### Web / PWA
- [ ] Búsqueda devuelve resultados en < 2s
- [ ] Audio se reproduce sin cortes en Chrome, Firefox y Safari iOS
- [ ] PWA se puede instalar desde Safari en iPhone (sin errores de manifest)
- [ ] La app carga offline (UI básica con Service Worker)
- [ ] No hay errores en consola en producción

### Desktop
- [ ] El instalador `.exe` funciona en Windows 10/11 limpio (sin Node, sin Python, sin Rust)
- [ ] Descarga una canción completa con metadatos en < 60s
- [ ] yt-dlp y ffmpeg se ejecutan localmente sin instalación externa
- [ ] La UI es idéntica a la versión web
- [ ] No requiere conexión al backend de Fly.io para nada (ni descargas ni búsqueda)
- [ ] La ventana muestra frame nativo del SO (barra de título, botones de sistema)
- [ ] Deezer search funciona en Desktop llamando a api.deezer.com directamente
- [ ] Si el backend Fly.io cae, Desktop sigue funcionando al 100%

### Android (ya cumplido — mantener)
- [ ] Descarga funciona con plugin nativo
- [ ] No regresiones al tocar código compartido

### Android Auto-update (implementado)
- [x] Solo acepta releases publicadas de `ParaSyteTwo/music-mhl`
- [x] Detecta builds mediante `versionCode`, `versionName` y SHA-256
- [x] Un APK reemplazado reinicia el periodo de seguridad de 7 días
- [x] Rechaza digest, package, versión o certificado inválidos
- [x] Nunca permite downgrade
- [x] No bloquea el uso normal de la aplicación ante errores
- [x] Requiere confirmación del instalador de Android

## 6. Out of Scope (v2.0)

- Sincronización de biblioteca entre dispositivos
- Streaming propio (Deezer directo con cuenta premium)
- macOS / Linux desktop
- Auto-updater en Desktop (v2.1)
- Login / cuentas de usuario
- Modo offline completo en PWA (reproducción offline)
- Chrome customizado / titlebar personalizado en Desktop

## 7. Success Metrics

- PWA instalable y funcional en iPhone sin errores
- Desktop `.exe` funcional en PC limpio, descarga sin backend
- Android sin regresiones
- Cero errores críticos en consola web en producción
