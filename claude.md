# MHL Music - Project Context

> ESPECÍFICO — Solo para music-mhl.

## Qué es

Reproductor de música web y Android. Buscar, escuchar y descargar música gratis, sin paywalls. Open-source.

## Estado: v0.3.0 OFICIAL ✅ → v0.4.0 (Gestión Profesional de Metadatos)

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

**v0.4.0 REPLANIFICADO (FASE 2 — Gestión de Metadatos Profesional):**
Enfoque: MHL Music es gestor profesional de metadatos para tu biblioteca local.
- ✅ Lectura completa de ID3 (título, artista, álbum, género)
- ✅ Arreglar imágenes cortadas en álbumes (CSS aspect ratio)
- ✅ Descarga automática de covers (CoverArtArchive)
- ✅ Enriquecimiento con MusicBrainz (género, año)
- ✅ Renombramiento automático ("Título - Artista")
- ✅ Sincronización metadatos ↔ nombre archivo
- ✅ Edición intuitiva de tags (UI modal)
- ✅ Covers en descargas también
**Estimado:** 3-4 semanas (5 sprints estructurados)
**Razón:** Metadatos consistentes = biblioteca profesional y funcional

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

### FASE 2: Gestión de Metadatos Profesional (v0.4.0) — EN PLANIFICACIÓN

**Sprint 1: Lectura de Metadatos + Covers (3 días)**
1. Parser ID3 mejorado (título, artista, álbum, género)
2. Arreglar CSS imágenes (aspect ratio, no cortadas)
3. CoverArtArchive API integration
4. Auto-descarga de covers para importados
5. UI progreso descarga covers

**Sprint 2: Enriquecimiento + Renombramiento (5 días)**
6. MusicBrainz API integration
7. UI modal para editar metadatos
8. Auto-capitalize títulos y artistas
9. Detección de nombres incorrectos
10. Renombramiento automático ("Título - Artista")
11. Sincronización ID3 ↔ nombre archivo
12. Confirmación antes de cambios

**Sprint 3: Descargas con Metadatos (3 días)**
13. Modificar descarga para incluir covers
14. Aplicar renombramiento a descargas
15. Garantizar ID3 completo en descargas
16. Validación archivo guardado

**Sprint 4: UI Gestión Avanzada (3 días)**
17. Vista archivos con metadatos incompletos
18. Batch edit (editar múltiples a la vez)
19. Preview antes de guardar
20. Historial de cambios

**Sprint 5: Testing + Polish (2 días)**
21. Tests para ID3 parser
22. Tests para MusicBrainz lookup
23. Tests para renombramiento
24. Pruebas manuales (100+ archivos)

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
