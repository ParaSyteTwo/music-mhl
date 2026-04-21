# Technical Design Document
> Project: MHL Music
> Stack: Multi-platform (React/Vite + FastAPI + Tauri + Capacitor)
> Version: 2.0
> Last updated: 2026-04-21

## 1. Tech Stack

### Frontend (compartido entre Web, PWA, Desktop)

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | React | 18.3+ |
| Language | TypeScript | 5+ (strict) |
| Bundler | Vite | 5.4+ |
| Routing | React Router | 6.30+ |
| State | Zustand | 5.0+ |
| Styling | TailwindCSS | 3.4+ |
| Animations | Framer Motion | latest |
| PWA | vite-plugin-pwa | latest |
| Testing | Vitest + Playwright | latest |

### Backend (Fly.io — solo para Web/PWA)

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | FastAPI | 0.110+ |
| Language | Python | 3.11+ |
| Audio | yt-dlp | latest |
| Deployment | Fly.io (Docker) | - |

### Android (ya funciona — no tocar)

| Layer | Technology |
|-------|-----------|
| Bridge | Capacitor 8.2 |
| Plugin | yt-dlp nativo (Java/Kotlin) |
| Audio | ffmpeg-kit bundleado |

### Desktop (Windows — Tauri v2)

| Layer | Technology | Notas |
|-------|-----------|-------|
| Shell | Tauri v2 | proceso principal Rust |
| Bundler | Tauri bundler | genera .exe NSIS installer |
| Backend local | Tauri Shell plugin | invoca yt-dlp.exe + ffmpeg.exe |
| Binarios | yt-dlp.exe + ffmpeg.exe | bundleados en `resources/win/`, ignorados por git |
| IPC | Tauri commands + events | renderer ↔ Rust main process |
| Window | decorations: true | frame nativo del SO, sin chrome customizado |
| Auto-update | Tauri updater | v2.1 |

---

## 2. Arquitectura General

```
music-mhl/
├── src/                    # React app (compartido Web + Desktop + Android)
│   ├── components/
│   │   ├── layout/         # AppLayout, BottomPlayer
│   │   └── ui/
│   ├── pages/              # Search, Library, Downloads, Playlists, Settings
│   ├── store/              # Zustand stores
│   ├── lib/
│   │   ├── api/            # musicApi.ts — llamadas al backend / yt-dlp local
│   │   ├── platform/       # platform.ts — detección Web vs Tauri vs Android
│   │   ├── audioEngine.ts
│   │   ├── metadataEnricher.ts
│   │   ├── ytdlpBridge.ts  # interfaz para Android (Capacitor plugin)
│   │   └── tauriDownloader.ts  # interfaz para Desktop (Tauri Shell → yt-dlp.exe)
│   └── types/
│
├── src-tauri/              # Proceso principal Tauri (Rust)
│   ├── src/
│   │   └── main.rs         # Entry point + Tauri commands
│   ├── tauri.conf.json     # Configuración ventana: decorations: true
│   └── Cargo.toml
│
├── resources/              # Binarios bundleados para Desktop
│   └── win/
│       ├── yt-dlp.exe      # ignorado por git — descargar con script
│       └── ffmpeg.exe      # ignorado por git — descargar con script
│
├── services/
│   └── ytdlp-service/      # Backend FastAPI (Fly.io) — solo para Web
│
└── android/                # Capacitor Android — no tocar
```

---

## 3. Capa de Abstracción de Plataforma

**Problema:** el mismo React UI necesita comportarse diferente en Web, Desktop y Android.

**Solución:** `src/lib/platform/index.ts` + branches en `musicApi.ts`:

```typescript
// src/lib/platform/index.ts
export function detectPlatform(): 'tauri' | 'android' | 'web'

export const isTauri   = platform === 'tauri';
export const isAndroid = platform === 'android';
export const isWeb     = platform === 'web';
```

| Plataforma | Deezer search | Búsqueda YouTube | Descarga audio |
|-----------|--------------|-----------------|---------------|
| Web/PWA | Backend Fly.io `/deezer` | Backend Fly.io `/candidates` | Backend Fly.io `/download-ticket` |
| Desktop (Tauri) | `deezerDirect.ts` → `api.deezer.com` directo | yt-dlp.exe local via `tauriDownloader.ts` | yt-dlp.exe local via `tauriDownloader.ts` |
| Android | Backend Fly.io `/deezer` | Plugin Capacitor `searchYouTubeNative()` | Plugin Capacitor `downloadMp3Native()` |

**Desktop no hace ninguna llamada al backend Fly.io** — funciona aunque el backend caiga.

---

## 4. Desktop — Flujo Completamente Self-Contained

### Búsqueda Deezer (sin backend)
```
[React UI] → musicApi.searchDeezer() con isTauri=true
    ↓ deezerDirect.ts → fetch('https://api.deezer.com/search?q=...')
[api.deezer.com] — sin CORS en webview nativo de Tauri
    ↓ JSON crudo → mapProxiedTrack()
[React UI] → muestra resultados
```

### Búsqueda YouTube + Descarga (sin backend)
```
[React UI] → tauriDownloader.searchYouTube(track)
    ↓ Command.create('yt-dlp', ['--dump-json', 'ytsearch5:...'])
[yt-dlp.exe] (bundleado en resources/win/)
    ↓ stdout: resultados JSON
[React UI] → muestra candidatos

[React UI] → tauriDownloader.downloadMp3(videoId, opts)
    ↓ Command.create('yt-dlp', [url, '-x', '--audio-format', 'mp3', '--ffmpeg-location', ffmpegPath, ...])
[yt-dlp.exe → ffmpeg.exe]
    ↓ archivo .mp3 + ID3 tags
[~/Music/MHL/{artist} - {title}.mp3]
    ↓ evento de progreso vía onEvent()
[React UI] → actualiza estado de descarga
```

**Archivos clave a crear/completar:**

| Archivo | Estado | Rol |
|---------|--------|-----|
| `src/lib/api/deezerDirect.ts` | Existe, incompleto | Expandir con `trackMeta`, `home`, `artist`, `album` full |
| `src/lib/tauriDownloader.ts` | Por crear | `searchYouTube()` + `downloadMp3()` via Tauri Shell |
| `src/lib/api/musicApi.ts` | Existe | Agregar branch `isTauri` para Deezer + descarga |

**Rutas de binarios en producción (Tauri):**
```typescript
// src/lib/tauriDownloader.ts
import { Command } from '@tauri-apps/plugin-shell';
import { resolveResource } from '@tauri-apps/api/path';

const ytdlpPath = await resolveResource('win/yt-dlp.exe');
const ffmpegPath = await resolveResource('win/ffmpeg.exe');
```

**Configuración Tauri Shell** (`src-tauri/tauri.conf.json`):
```json
{
  "plugins": {
    "shell": {
      "scope": [
        { "name": "yt-dlp", "cmd": "resources/win/yt-dlp.exe", "args": true }
      ]
    }
  }
}
```

---

## 5. Desktop — Ventana Nativa

**`src-tauri/tauri.conf.json`** — configuración correcta:
```json
{
  "app": {
    "windows": [{
      "title": "MHL Music",
      "width": 1200,
      "height": 800,
      "minWidth": 900,
      "minHeight": 600,
      "decorations": true,
      "resizable": true,
      "center": true
    }]
  }
}
```

- **No hay titlebar customizado** en React — la barra de título la gestiona el SO
- **No hay botones close/minimize/maximize** en el UI — los gestiona el frame nativo
- Sin `window-drag-region` ni CSS de chrome customizado

---

## 6. PWA — Requisitos para iPhone

El manifest y service worker deben cumplir:

```json
{
  "display": "standalone",
  "background_color": "#000000",
  "theme_color": "#000000",
  "icons": [
    { "src": "icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

- `apple-touch-icon` en el HTML
- Service Worker con Workbox (ya incluido en vite-plugin-pwa)
- HTTPS obligatorio (ya está en Render)
- Sin headers que bloqueen instalación PWA

---

## 7. Convenciones de Código

- Componentes: funcionales, max 200 líneas, un archivo por pantalla
- Estado global: Zustand stores tipados, sin mutación directa
- API calls web: todas en `src/lib/api/`, tipadas con TypeScript
- Tauri commands: siempre vía `@tauri-apps/api` (nunca `__TAURI_INTERNALS__` directo)
- Binarios: siempre resueltos con `resolveResource()`, nunca rutas hardcodeadas
- No `any` — usar `unknown` + type guards
- Errores: siempre capturados y retornados como `{ success: false, error: string }`

---

## 8. Build Targets

| Target | Comando | Output |
|--------|---------|--------|
| Web/PWA | `npm run build` | `dist/` → Render |
| Android | `npm run android` | APK via Android Studio |
| Desktop | `npm run tauri:build` | `src-tauri/target/release/bundle/nsis/MHL Music_x.x.x_x64-setup.exe` |

**tauri.conf.json bundle config**:
```json
{
  "bundle": {
    "active": true,
    "targets": ["nsis"],
    "resources": ["../resources/win/yt-dlp.exe", "../resources/win/ffmpeg.exe"],
    "windows": { "nsis": { "installMode": "currentUser" } }
  }
}
```

---

## 9. Variables de Entorno

```env
# Web/PWA — frontend
VITE_RAILWAY_URL=https://ytdlp-service-little-sea-7784.fly.dev
VITE_SERVICE_API_KEY=...

# Desktop — no necesita variables de entorno externas
# Tauri resuelve binarios con resolveResource() desde el bundle
```

---

## 10. Prohibido (requiere aprobación explícita)

- [ ] Llamar al backend Fly.io desde Desktop Tauri — para cualquier cosa (Deezer, YouTube, descargas)
- [ ] `decorations: false` en tauri.conf.json — ventana siempre con frame nativo
- [ ] Titlebar/chrome customizado en React para Desktop
- [ ] Rutas absolutas hardcodeadas para binarios (usar `resolveResource()`)
- [ ] Tocar `android/` sin motivo (ya funciona al 100%)
- [ ] `npm run build` sin probar PWA manifest primero
- [ ] Subir yt-dlp.exe / ffmpeg.exe al repositorio git (usar .gitignore + script de descarga)
- [ ] `shell: { open: true }` en Tauri sin revisión de seguridad

---

## 11. Testing Strategy

- Unit: Vitest para stores, utils, platform adapters
- Integration: Vitest + mocks para flujos de descarga
- E2E Web: Playwright en Chrome + Safari (Webkit)
- Desktop: Tests manuales en Windows limpio (sin yt-dlp preinstalado)
- Android: Ya tiene su propio ciclo de testing
- Coverage target: 70% mínimo en src/lib/
