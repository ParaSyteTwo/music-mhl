# MHL Music - Project Context

> ESPECÍFICO — Solo para music-mhl.

## Qué es

Reproductor de música web y Android. Buscar, escuchar y descargar música gratis, sin paywalls. Open-source.

## Estado: v0.2.1 → v0.3.0 (en progreso)

**v0.2.1 funcional:** Búsqueda (Deezer), reproducción (previews 30s), cola con controles, letras sincronizadas (LRCLIB) con traducción, descarga MP3 con metadatos ID3, Shazam, importación local de MP3, biblioteca local con tabs (Albums/Artists/Genres/TopPlayed), APK Android, deploy Vercel.

**v0.3.0 en FASE 1 (Estabilidad Core):**
- ✅ Service Worker duplicado arreglado
- 📝 Tests suite (62 tests: musicStore, audioEngine, localMusicParser)
- 🔧 Bugs críticos identificados (localFileRefs en Android, audioEngine error handling)

## Stack

- Frontend: React 18 + TypeScript 5, Vite 5, shadcn/ui, Zustand 5, Tailwind CSS 3.4
- Backend: Supabase Edge Functions (Deno) — deezer-search/ y yt-stream/
- Mobile: Capacitor 8, Android 8.0+
- Deploy: Vercel (web), Android Studio + Gradle (APK)

## Skills relevantes para este proyecto

- **Superpowers**: Usar para cualquier feature nueva (brainstorm → plan → implement)
- **Frontend Design**: Usar siempre que se toquen componentes UI — este proyecto necesita verse bien, no genérico
- **React Best Practices**: Si está instalada, aplicar en todo componente React
- **Supabase Best Practices**: Si está instalada, aplicar en Edge Functions y queries

## Arquitectura

src/
├── components/
│   ├── layout/        → AppLayout.tsx, BottomPlayer.tsx
│   ├── music/         → Componentes de música
│   └── ui/            → shadcn reutilizables
├── pages/             → HomePage, LibraryPage, PlaylistPage, LyricsPage
├── store/musicStore.ts → Zustand (queue, currentTrack, isPlaying, library, searchResults)
├── lib/
│   ├── api/musicApi.ts → searchMusic(), identifyTrack(), getLyrics(), translateLyrics()
│   ├── audioEngine.ts  → Motor de reproducción (HTML5 Audio)
│   └── id3Writer.ts    → Metadatos MP3
└── types/music.ts      → Tipos globales (Track, Playlist, etc.)

supabase/functions/
├── deezer-search/      → GET /search?q=...
└── yt-stream/          → GET /stream?videoId=...

## APIs externas

| API | Para qué | Ruta |
|-----|----------|------|
| Deezer | Búsqueda, metadatos | musicApi.ts → searchMusic() |
| YouTube (RapidAPI) | Stream audio completo | supabase/functions/yt-stream/ |
| Shazam (RapidAPI) | Identificar canciones | musicApi.ts → identifyTrack() |
| LRCLIB | Letras sincronizadas | musicApi.ts → getLyrics() |
| LibreTranslate / DeepL | Traducción | musicApi.ts → translateLyrics() |

## Env vars

VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_RAPIDAPI_KEY, VITE_DEEPL_API_KEY (opcional)

## Flujos principales

Búsqueda: Usuario → musicStore.search() → musicApi.searchMusic() → Deezer → resultados en store → render
Reproducción: play() → audioEngine.loadTrack() → preview (30s) o yt-stream (completa) → HTML5 Audio
Descarga: downloadTrack() → id3Writer.writeMetadata() → Capacitor Filesystem
Letras: getLyrics() → LRCLIB → detectar idioma → traducir si necesario → sincronizar con currentTime

## Zustand store (musicStore.ts)

Estados: queue, currentTrackIndex, isPlaying, shuffle, repeat, library, searchResults
Acciones: play/pause/togglePlay, next/previous, addToQueue, createPlaylist, addToPlaylist, search

## Roadmap v1.0.0

### FASE 1: Estabilidad Core (v0.3.0) — EN PROGRESO
1.1 Bugs críticos (Service Worker ✅, localFileRefs, audioEngine)
1.2 Tests suite (musicStore ✅, audioEngine, localMusicParser)
1.3 Documentación (flujo reproducción, arquitectura, edge cases)

### FASE 2: Full-Stream YouTube & Android Background (v0.4.0)
- YouTube full stream (no solo 30s)
- Android background audio (Service nativo + Media notifications)
- Media Session API para hardware controls

### FASE 3: UX Polish & Discovery (v0.5.0)
- Frontend design audit + responsive design (mobile-first)
- Páginas artista/álbum + recomendaciones
- Charts por país (integración API)
- Performance: React Query, IndexedDB caching, code-splitting

### FASE 4: Release Candidate & v1.0.0
- Testing final (>80% coverage, E2E Playwright)
- Beta testing (3-5 usuarios)
- Deploy web (Vercel automático) + APK en GitHub releases
- Documentación final + roadmap v1.1+

## Problemas conocidos & FASE 1 Progress

### Arreglados (v0.3.0)
- ✅ Service Worker duplicado en src/main.tsx

### En progreso (FASE 1 — v0.3.0)
1. **localFileRefs vacío en Android al recargar**
   - Causa: File objects no serializables, localFileRefs inicia vacío cada sesión
   - Fix: Ejecutar `rescanLocalLibrary()` en mount de App.tsx para Android
   - Estado: Identificado, fix pendiente

2. **audioEngine silent failures**
   - Causa: play() y error handler no dan feedback descriptivo al usuario
   - Fix: Mejorar error code mapping (MEDIA_ERR_NETWORK, DECODE, etc) + UI feedback
   - Estado: Identificado, tests creados, fix pendiente

3. **Test coverage**
   - Estado: 62 tests creados, 44/62 pasando (necesitan ajustes de mocking)

### Futuros (v0.4.0+)
- YouTube full-stream (no solo 30s)
- Android background audio (Service nativo)
- LibreTranslate lento — usar DeepL con límites
- Shazam limitado a free tier RapidAPI

## Reglas para trabajar en este proyecto

- Respetar arquitectura: Componentes → Pages → Store → API
- Tipos TypeScript siempre — nada de any
- Seguir naming existente (Track, Playlist, etc.)
- Env vars con VITE_* o supabase secrets — nunca hardcodear keys
- Si cambias audioEngine o store, escribe tests (Superpowers fuerza TDD)
- Si tocas UI, usa Frontend Design skill para que no quede genérico

## Links

- Repo: https://github.com/ParaSyteTwo/music-mhl
- Web: https://music-mhl.vercel.app
