# Technical Design Document
> Project: MHL Music
> Stack: React + Vite + Capacitor + Android (youtube-dl-android)
> Last updated: 2026-04-17

## 1. Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend Framework | React | 18.3.1 |
| Build Tool | Vite | 5.4.19 |
| Mobile | Capacitor | 8.2.0 |
| Android Native | youtube-dl-android | 0.18.1 |
| State | Zustand | 5.0.11 |
| Styling | Tailwind CSS | 3.4.17 |
| Audio Metadata | browser-id3-writer | 6.3.1 |
| Music Metadata | music-metadata-browser | 2.5.11 |
| Testing | Vitest + Playwright | latest |

## 2. Architecture — Offline-First Android

```
src/
├── lib/
│   ├── ytdlpBridge.ts       # Bridge to YtDlpPlugin (Capacitor native)
│   ├── api/
│   │   └── musicApi.ts      # Unified API — online/offline aware
│   ├── id3Writer.ts         # ID3 tag writing + cover art
│   ├── metadataEnricher.ts  # Local file parsing, Cover Art Archive
│   ├── localTrackRuntime.ts # Documents/ path + playback URLs
│   └── searchEngine.ts      # Local search (IndexedDB + Fuse.js fallback)
├── store/
│   └── musicStore.ts        # Zustand store (persist partialized state)
├── pages/
│   ├── SearchPage.tsx       # CandidatePicker + YouTube search
│   └── LibraryPage.tsx      # Local library browser
├── hooks/
│   └── useOfflineSearch.ts  # Detects network, switches search mode
└── components/

android/app/src/main/java/com/mhl/music/
├── YtDlpPlugin.java          # YouTube search + download
├── NativeLibraryPlugin.java  # Documents/ scanner
└── OpenFilePlugin.java      # File opener
```

## 3. Core Patterns & Conventions

- **Offline-first**: Toda operación core debe funcionar sin red. Solo Deezer search es online-only y degrada gracefully.
- **Fallback en cascada**: Search offline → YouTube directo (yt-dlp) → resultado local. Nunca falla silenciosamente.
- **Single source of truth para downloads**: `musicStore.downloads` (persistido en localStorage)
- **Binary data bridge**: youtube-dl-android devuelve audio como base64 → JS decodea → Filesystem.writeFile
- **No cambios en backend**: Railway sigue existiendo pero no es requerido para Android

## 4. Key Data Flows

### Search Offline (Core Change)

```
User types query
    ↓
check navigator.onLine
    ↓
[OFFLINE] → searchLocalLibrary(query) → fuse.js on IndexedDB
    ↓ OR
[ONLINE] → searchDeezer(query) → Railway → results
    ↓
Display results (mixed: local + Deezer tracks for online)
    ↓
User taps track → startDownload(track)
```

### YouTube Direct Search (New Capability)

```
searchYouTubeDirect(query) → YtDlpPlugin.search()
    ↓
Returns {videoId, title, duration, channel}[] directly from YouTube
    ↓
Track created from YouTube metadata (title, channel as artist)
    ↓
Proceeds to download flow
```

### Download (Already Offline-Capable)

```
startDownload(track)
    ↓
getDownloadCandidates(track) [ANDROID] → YtDlpPlugin.search()
    ↓
scoreCandidates() → top 3 results
    ↓
downloadMp3Native(videoId) → YtDlpPlugin.downloadAudio()
    ↓
ArrayBuffer → writeID3Tags() → Filesystem.writeFile()
    ↓
Add to localLibrary in store
```

## 5. Offline Strategy Details

### Network Detection
- `navigator.onLine` para detección de conectividad
- `online` / `offline` event listeners para cambios dinámicos
- Sin periodic polling — solo detección pasiva

### Local Search Index
- IndexedDB via `idb-keyval` o wrapper simple sobre localStorage
- Almacena: `{id, title, artist, album, duration, deezerId, youtubeId, thumbnail, savedAt}`
- Fuse.js para fuzzy search sobre el índice local
-索引 se construye desde `musicStore.localLibrary` + `musicStore.downloads`

### YouTube Direct Mode
- Cuando offline Y no hay resultados locales → mostrar mensaje "Sin resultados locales. Conéctate a internet para buscar en YouTube."
- NUEVO: opción de búsqueda YouTube directa via `YtDlpPlugin.search()` incluso offline
  - Solo necesita yt-dlp (que ya está en el APK)
  - Devuelve resultados aunque no haya Deezer

### Deezer como Enhancement
- Solo se intenta si `navigator.onLine === true`
- Timeout de 5s — si falla, se ignora y se muestran resultados YouTube o locales
- No bloquea la UI — sefetch en paralelo post-render

## 6. API Changes

### musicApi.ts — Dual Mode

```typescript
// Nuevo: búsqueda con fallback automático
async function searchWithFallback(query: string): Promise<Track[]> {
  if (!navigator.onLine) {
    // Modo offline: YouTube directo
    const ytResults = await searchYouTubeDirect(query);
    return ytResults;
  }
  // Modo online: Deezer + YouTube
  const deezerResults = await searchDeezer(query);
  if (deezerResults.length > 0) return deezerResults;
  // Fallback: YouTube directo
  return searchYouTubeDirect(query);
}

// Nuevo: búsqueda local
function searchLocalLibrary(query: string): Track[] {
  const index = getLocalSearchIndex(); // from store
  return fuse.search(query).slice(0, 20);
}
```

## 7. Testing Strategy

- Unit: Vitest para searchEngine, candidate scoring, ID3 writer
- Integration: YouTube direct search sin red (mock network)
- E2E: Playwright para flujos offline (Flight Mode simulator)
- Coverage target: 70% minimum para lógica nueva

## 8. Environment Variables

No se agregan nuevas variables de entorno. La app usa:
- `VITE_RAILWAY_URL` — solo para web (no afecta Android)
- `VITE_SERVICE_API_KEY` — solo para web

## 9. Forbidden

- No agregar dependencias de red obligatorias para Android
- No cambiar el schema de persistencia de zustand (rompería backwards compat)
- No tocar android/app/src/main/java/com/mhl/music/MainActivity.java sin necesidad
- No modificar el backend Railway (fuera de scope)
