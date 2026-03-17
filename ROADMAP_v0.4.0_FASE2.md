# 🎵 ROADMAP v0.4.0 — FASE 2: Personal Music Library v2

**Status:** En Planificación
**Versión Anterior:** v0.3.0 (COMPLETADA ✅)
**Filosofía:** Enfoque en organización local, no streaming frágil

---

## 📊 REALIDAD & Replanteamiento

**Análisis honesto:**
- MHL Music NO es un Spotify clone (ni debería serlo)
- Streaming YouTube/APIs son frágiles y pueden fallar
- **Lo que SÍ funciona:** Búsqueda + Descarga + Organización local
- **Mejor caso de uso:** Gestor de biblioteca personal

**v0.4.0 enfoque:** Pulir lo que ya funciona bien

---

## 🎯 Features Principales (Realistas)

### 1. Smart Download & Management

**Descarga Batch**
```typescript
// Seleccionar 5+ canciones, descargar todas
selectedTracks.forEach(track => {
  downloadTrack(track); // Con queue management
});
```

**Evitar Duplicados**
- Detectar automáticamente canciones duplicadas
- Comparar: artista + título (fuzzy match)
- Opciones: Skip, Replace, Keep both

**Mejor Calidad**
- Mostrar disponibilidad: MP3, M4A, FLAC
- Permitir elegir formato
- Verificar bitrate antes de descargar

**Estimado:** 2-3 días

### 2. Library Organization

**Auto-Fix Metadata**
- Usar Musicbrainz para mejorar ID3 tags
- Auto-captualize títulos
- Llenar género/año faltantes

**Smart Grouping**
```
Albums with same name → merge?
Artists with variations (The Beatles / Beatles) → unify?
Genres undefined → suggest from Musicbrainz?
```

**Duplicate Management**
- Marcar duplicados automáticamente
- Opciones: Delete one, Keep higher quality, Merge metadata

**Estimado:** 3-4 días

### 3. Statistics & Insights

**Library Stats**
```
- Total tracks: 250
- Total size: 1.5 GB
- Formats: MP3 (180), FLAC (50), M4A (20)
- Genres: 25 unique
- Artists: 120 unique
- Most played track: (title) — 45 times
- Recently added: (list of 10)
```

**Smart Playlists**
- By mood (upbeat, chill, sad)
- By year (80s, 90s, 2000s)
- By rating (favorite, good, okay)
- By play count (top 10, never played)

**Listening Trends**
- Songs this week
- Most played month
- Listening streak

**Estimado:** 2-3 días

### 4. Sharing & Collaboration

**Export Playlist**
```
- JSON format (importable)
- CSV format (spreadsheet)
- Text format (readable list)
- Share link (cloud link to JSON)
```

**Import Playlists**
- From JSON/CSV/text
- From shared links
- Merge with existing playlists

**Estimado:** 1-2 días

### 5. Search Improvements

**Advanced Filters**
```
Search "Rock 1970s"
├─ Genre filter
├─ Year range filter
├─ Format filter (FLAC only?)
├─ Quality filter (high bitrate)
└─ Play count filter (never played)
```

**Metadata Search**
- Search by any ID3 field
- Regex patterns support
- Save searches as smart playlists

**Estimado:** 2-3 días

---

## 🚀 Implementation Plan

### Sprint 1: Smart Download (Days 1-3)
- [ ] Batch download UI
- [ ] Duplicate detection (fuzzy match)
- [ ] Format selection before download
- [ ] Testing batch ops

**Commits:** 3-4

### Sprint 2: Library Organization (Days 4-8)
- [ ] Musicbrainz integration for auto-fix
- [ ] Metadata auto-correction
- [ ] Duplicate marking & management
- [ ] Library cleanup UI

**Commits:** 5-6

### Sprint 3: Statistics (Days 9-11)
- [ ] Stats calculation engine
- [ ] Smart playlist generation
- [ ] Listening trends tracking
- [ ] UI for stats display

**Commits:** 4-5

### Sprint 4: Sharing & Export (Days 12-13)
- [ ] Export playlists (JSON/CSV/text)
- [ ] Import from formats
- [ ] Share links (if backend available)

**Commits:** 2-3

### Sprint 5: Advanced Search (Days 14-16)
- [ ] Filter UI (genre, year, format)
- [ ] Metadata search engine
- [ ] Save searches as playlists
- [ ] Performance optimization

**Commits:** 3-4

---

## 📋 What NOT to Do (Removed from v0.4.0)

❌ **YouTube full-stream** — APIs frágiles, ToS violations
❌ **Background audio Service** — nice-to-have, no core use case
❌ **Hardware media buttons** — Works via MediaSession, no need for Service
❌ **React Query/IndexedDB** — Premature optimization

✅ **INSTEAD:** Focus on local library management

---

## 📊 Testing Strategy

### Local Testing
- [ ] Batch download de 20+ canciones
- [ ] Duplicate detection accuracy
- [ ] Export/import playlists roundtrip
- [ ] Stats calculation performance

### Performance
- [ ] Library with 1000+ tracks responsive
- [ ] Stats calculation <2s
- [ ] Search with filters <500ms

### Data
- [ ] Export JSON valid format
- [ ] Roundtrip: Export → Import → same data
- [ ] Metadata improvements verified

---

## 🎯 Success Criteria (v0.4.0 Release)

- [x] Batch download working
- [x] Duplicate detection >95% accurate
- [x] Auto-fix metadata from Musicbrainz
- [x] Library stats + smart playlists
- [x] Export/import playlists
- [x] Advanced search with filters
- [x] 65+/70 tests passing
- [x] Zero critical bugs
- [x] Deploy to Vercel + APK signed

---

## 📈 Metrics

| Métrica | v0.3.0 | v0.4.0 Goal | Notes |
|---------|--------|-------------|-------|
| Download Speed | Single | Batch (5+) | User can bulk download |
| Metadata Quality | Auto-ID3 | Musicbrainz enhanced | Better accuracy |
| Duplicate Detection | Manual | Automatic | Saves user time |
| Library Stats | ❌ No | ✅ Yes | Shows insights |
| Smart Playlists | ❌ No | ✅ Yes | Auto-generated by mood/year |
| Export Formats | ❌ No | 3+ (JSON/CSV/txt) | Portable |
| Tests | 62/62 | 65+/70 | New feature coverage |
| Build Size | 605KB | <620KB | Minimal growth |

---

## 🤔 Philosophy

**MHL Music is:**
- NOT a Spotify clone
- NOT a streaming service
- YES a personal music library manager
- YES with smart search & organization

**User value:**
1. Find music (Deezer search)
2. Download it (once, keep forever)
3. Organize intelligently
4. Enjoy with statistics & insights

---

## Estimado Total

**v0.4.0 FASE 2:** 2-3 semanas
- Descarga batch + Smart download
- Metadata auto-fix
- Statistics & Smart playlists
- Export/import
- Advanced search

**Viable:** YES
**Sustentable:** YES (no API streaming risk)
**User value:** HIGH (true personal library management)

---

**Próxima Reunión:** Después de v0.3.0 release (validar stabilidad antes de empezar FASE 2)

