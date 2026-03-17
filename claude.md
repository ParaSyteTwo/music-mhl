# MHL Music - Project Context

> ESPECÍFICO — Solo para music-mhl.

## Qué es

Reproductor de música web y Android. Buscar, escuchar y descargar música gratis, sin paywalls. Open-source.

## Estado: v0.1.0

Funcional: búsqueda (Deezer), reproducción (previews 30s), cola con controles, letras sincronizadas (LRCLIB) con traducción, descarga MP3 con metadatos ID3, Shazam, importación local, APK Android, deploy Vercel.

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

## Roadmap

v0.2.0: YouTube full stream (no solo 30s), audio background Android, notificaciones descarga, páginas artista/álbum, charts por país
v0.3.0: Modo offline, sync multi-dispositivo, ecualizador (Web Audio API), crossfade, sleep timer

## Problemas conocidos

1. YouTube limitado a preview 30s — v0.2.0 resuelve
2. Android se pausa al bloquear pantalla — necesita Service nativo
3. LibreTranslate lento a veces — DeepL mejor pero con límites
4. Shazam necesita RapidAPI key

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
