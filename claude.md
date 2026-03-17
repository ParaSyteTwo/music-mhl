# MHL Music - Project Context

> ESPECÍFICO — Solo para music-mhl.

## Qué es

Reproductor de música web y Android. Buscar, escuchar y descargar música gratis, sin paywalls. Open-source.

## Estado: v0.3.0 OFICIAL ✅ → v0.4.0 (Personal Music Library v2)

**v0.3.0 COMPLETADO (FASE 1 — Estabilidad Core):** ✅ 100% DONE
- ✅ Service Worker duplicado arreglado
- ✅ Android library permissions (runtime requests)
- ✅ Multi-formato audio (8 formatos soportados)
- ✅ Dual import options (auto-scan + manual file picker)
- ✅ Capacitor FilePicker (native Android picker)
- ✅ Batch processing (100+ archivos sin crash)
- ✅ Metadata optimization (256KB slices)
- ✅ Audio file validation (rejects non-audio)
- ✅ Smart YouTube search (prioritizes official audio)
- ✅ Error handling con MediaError mapping
- ✅ 62/62 tests passing, clean build

**v0.4.0 REPLANIFICADO (FASE 2 — Personal Music Library v2) — NO streaming APIs:**
Enfoque realista: MHL Music es gestor de biblioteca personal, NO Spotify clone.
- Batch download & smart quality selection
- Auto-fix metadata (Musicbrainz integration)
- Library statistics & listening trends
- Smart playlists (mood, year, rating, play count)
- Export/import (JSON, CSV, text formats)
- Advanced search with filters
**Estimado:** 2-3 semanas (vs 4+ para YouTube streaming)
**Razón:** APIs frágiles, ToS violations, RapidAPI rate limits — enfoque local es sustentable

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

### FASE 1: Estabilidad Core (v0.3.0) — ✅ COMPLETADA
- ✅ 3 bugs críticos arreglados
- ✅ 62/62 tests pasando
- ✅ 10 features implementadas
- ✅ Build limpio, zero critical issues

### FASE 2: Personal Music Library v2 (v0.4.0) — EN PLANIFICACIÓN

**Sprint 1: Smart Download (2-3 días)**
1. Batch download UI (select 5+ tracks → download all)
2. Duplicate detection (fuzzy match on artist+title)
3. Format selection before download
4. Quality verification (bitrate, format available)

**Sprint 2: Library Organization (3-4 días)**
5. Metadata auto-fix (Musicbrainz integration)
6. Auto-capitalize, fill missing genre/year
7. Duplicate marking & management
8. Library cleanup UI

**Sprint 3: Statistics (2-3 días)**
9. Stats calculation engine (total tracks, size, formats)
10. Smart playlists (by mood, year, rating, play count)
11. Listening trends (week, month, all-time)
12. Stats UI dashboard

**Sprint 4: Sharing & Export (1-2 días)**
13. Export playlists (JSON, CSV, text)
14. Import from formats
15. Share links (if backend available)

**Sprint 5: Advanced Search (2-3 días)**
16. Filter UI (genre, year, format, quality, play count)
17. Metadata search engine (regex support)
18. Save searches as smart playlists
19. Performance optimization

### FASE 3: UX Polish & Discovery (v0.5.0) — FUTURO
- Frontend design audit + responsive mobile-first
- Páginas artista/álbum + recomendaciones
- Charts por país (integración API)
- Infinite scroll optimization
- Dark/Light mode toggle

### FASE 4: Release Candidate & v1.0.0 — FUTURO
- Testing final (>80% coverage, E2E Playwright)
- Beta testing (3-5 usuarios)
- APK en Google Play (opcional)
- Documentación final + roadmap v1.1+

## Problemas conocidos & Estado

### Completados (v0.3.0)
- ✅ Service Worker duplicado
- ✅ localFileRefs vacío en Android
- ✅ audioEngine error handling
- ✅ Test coverage (62/62)
- ✅ Multi-format audio
- ✅ Android file picker
- ✅ Batch import optimization
- ✅ Audio file validation
- ✅ Smart YouTube search

### Deferred / Removed from v0.4.0
- ❌ YouTube full-stream (REMOVED — APIs frágiles, ToS risk, rate limits)
- ❌ Android background audio (REMOVED — no es critical, enfoque local first)
- ❌ React Query/IndexedDB (REMOVED — premature optimization)
- ⏸️ Offline mode enhancements (v0.5.0+)
- ⏸️ Queue persistence (v0.5.0+ — nice-to-have)
- ⏸️ Hardware media buttons (works via MediaSession, no need for native Service)

**Why:**
- MHL Music is NOT a Spotify clone
- Streaming APIs are unreliable → focus on what works: local library management
- User feedback: "no quiero que sea un dispositivo de streaming, sobre todo si las apis podrian fallar en cualquier momento"

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
