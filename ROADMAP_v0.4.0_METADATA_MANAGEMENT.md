# 🎵 ROADMAP v0.4.0 — FASE 2: Gestión Inteligente de Metadatos

**Estado:** En Planificación
**Versión Anterior:** v0.3.0 (COMPLETADA ✅)
**Filosofía:** Organización LOCAL con metadatos completos y consistentes

---

## 🎯 Objetivo Principal

Convertir MHL Music en un **gestor profesional de metadatos** para tu biblioteca personal:
- Leer metadatos incompletos de archivos locales
- Enriquecer con MusicBrainz
- Estandarizar nombres de archivos
- Descargar covers automáticamente
- Permitir edición y renombramiento

---

## 📊 Problemas Actuales → Soluciones

| Problema | Causa | Solución |
|----------|-------|----------|
| Imágenes cortadas en álbumes | Aspect ratio CSS incorrecto | Arreglar CSS cover art |
| Archivos importados sin foto | ID3 incompleto | Descargar cover art automáticamente |
| No hay género/año en locales | No se leen estos campos | Leer + MusicBrainz lookup |
| Nombres inconsistentes | Archivos con nombres raros | Renombrar automático: "Título - Artista" |
| Metadatos dispersos | Algunos en archivo, otros no | Sincronizar ID3 ↔ nombre archivo |

---

## 🎯 Features Principales (Realistas)

### 1. Lectura Completa de ID3 (Sprint 1)

**Campos a leer:**
```typescript
interface LocalTrackMetadata {
  title: string;        // Título canción
  artist: string;       // Artista principal
  album: string;        // Álbum
  genre: string;        // Género
  year?: number;        // Año (opcional, para búsqueda)
  duration: number;     // Duración en ms
  bitrate?: number;     // Bitrate detectado
  coverArt?: string;    // Data URL del cover
}
```

**Lectura:**
- Leer ID3v2 completo (incluyendo genre)
- Detectar bitrate del archivo MP3
- Extraer cover art embebido

**Estimado:** 1-2 días

---

### 2. Arreglar Imágenes Cortadas en Álbumes (Sprint 1)

**Problema actual:**
```css
/* Actual - causa corte */
.album-cover {
  width: 200px;
  height: 200px;
  object-fit: cover;  /* ← Corta los bordes */
}
```

**Solución:**
```css
.album-cover {
  width: 200px;
  height: 200px;
  object-fit: contain;        /* ← Muestra imagen completa */
  background-color: #f0f0f0;  /* ← Fondo si hay espacio */
  border-radius: 8px;
}
```

**Alcance:**
- Albums page
- Album grid en library
- Search results

**Estimado:** 0.5 días

---

### 3. Descarga Automática de Covers (Sprint 1)

**Para archivos importados:**
- Usuario carga archivo local sin cover art
- Sistema detecta: título + artista
- Busca en CoverArtArchive (MusicBrainz)
- Descarga cover automáticamente
- Escribe en ID3 tag

**UI:**
```
📥 Importando: "Blinding Lights - The Weeknd"
├─ Leyendo metadatos... ✓
├─ Buscando cover art... 🔄
├─ Descargando cover... ✓
└─ ¡Listo! Cover agregado
```

**Estimado:** 1-2 días

---

### 4. Enriquecimiento con MusicBrainz (Sprint 2)

**Para campos faltantes:**
```
Antes:
├─ Título: "blinding lights"
├─ Artista: "The Weeknd"
├─ Álbum: "After Hours"
├─ Género: ❌ vacío
└─ Año: ❌ vacío

Después (MusicBrainz):
├─ Título: "Blinding Lights"  (auto-capitalize)
├─ Artista: "The Weeknd"
├─ Álbum: "After Hours"
├─ Género: "Synthwave, Electronic"  ✅
└─ Año: 2019  ✅
```

**Flujo:**
1. Usuario importa archivo
2. Sistema lee: título + artista
3. Busca en MusicBrainz API
4. Si encuentra → llena género + año
5. Muestra preview antes de escribir

**UI para editar:**
```
📝 Editar Metadatos
├─ Título: "Blinding Lights"  [editable]
├─ Artista: "The Weeknd"      [editable]
├─ Álbum: "After Hours"       [editable]
├─ Género: "Synthwave"        [editable, MusicBrainz suggestion]
├─ Año: 2019                  [editable]
└─ [Guardar] [Cancelar]
```

**Estimado:** 2-3 días

---

### 5. Renombramiento Automático (Sprint 2)

**Patrón:** `Título - Artista.mp3`

**Ejemplo:**
```
Antes:
├─ song_official_audio.mp3
├─ 01 - The Weeknd - Blinding Lights.mp3
├─ weeknd_blinding.mp3

Después (después de editar metadatos):
├─ Blinding Lights - The Weeknd.mp3
├─ Blinding Lights - The Weeknd.mp3
├─ Blinding Lights - The Weeknd.mp3
```

**Flujo:**
1. Usuario edita metadatos (título + artista)
2. Sistema detecta nombre incorrecto
3. Propone nuevo nombre
4. Usuario confirma
5. Renombra archivo en disco

**UI:**
```
⚠️ Nombre incorrecto
Actual: "song_official_audio.mp3"
Propuesto: "Blinding Lights - The Weeknd.mp3"
[Renombrar] [Mantener]
```

**Estimado:** 2 días

---

### 6. Sincronización Metadatos ↔ Nombre (Sprint 2)

**Garantía:** Metadatos ID3 = Nombre archivo

```typescript
// Cuando usuario edita metadatos:
onMetadataUpdate(track: LocalTrack) {
  // 1. Escribir ID3 tags
  writeID3Tags(track.file, {
    title: track.title,
    artist: track.artist,
    album: track.album,
    genre: track.genre,
  });

  // 2. Renombrar archivo si es necesario
  const expectedName = `${track.title} - ${track.artist}.mp3`;
  if (track.filename !== expectedName) {
    renameFile(track.filename, expectedName);
  }
}
```

**Estimado:** Incluido en Sprint 2

---

### 7. Descarga de Covers para Archivos Descargados (Sprint 3)

**Cuando descargas una canción desde Deezer/YouTube:**
- Sistema descarga la canción
- Busca cover art (CoverArtArchive)
- Escribe cover en ID3 tag
- Archivo listo con todo

**Implementación:**
```typescript
async function downloadTrackWithMetadata(track: Track) {
  // 1. Descargar audio
  const audioBlob = await downloadAudio(track);

  // 2. Descargar cover art
  const coverUrl = await getCoverArt(track.title, track.artist);
  const coverImage = await fetch(coverUrl).blob();

  // 3. Escribir ID3 con cover
  writeID3Tags(audioBlob, {
    title: track.title,
    artist: track.artist,
    album: track.album,
    genre: track.genre,
    coverArt: coverImage,  // ← Nuevo
  });

  // 4. Guardar archivo
  saveToFilesystem(audioBlob, `${track.title} - ${track.artist}.mp3`);
}
```

**Estimado:** 1-2 días

---

## 🚀 Implementation Plan

### Sprint 1: Lectura de Metadatos + Covers (Days 1-3)

**Tareas:**
- [ ] Mejorar parser ID3 (leer género completo)
- [ ] Arreglar CSS de imágenes (aspect ratio)
- [ ] CoverArtArchive API integration
- [ ] Auto-descarga de covers para importados
- [ ] UI para mostrar progreso de descarga

**Commits:** 3-4

---

### Sprint 2: Enriquecimiento + Renombramiento (Days 4-8)

**Tareas:**
- [ ] MusicBrainz API integration
- [ ] UI para editar metadatos (modal)
- [ ] Auto-capitalize títulos y artistas
- [ ] Detección de nombres incorrectos
- [ ] Renombramiento automático de archivos
- [ ] Sincronización ID3 ↔ nombre archivo
- [ ] Confirmación antes de cambios

**Commits:** 5-6

---

### Sprint 3: Descargas con Metadatos Completos (Days 9-11)

**Tareas:**
- [ ] Modificar descarga para incluir covers
- [ ] Aplicar mismo renombramiento a descargas
- [ ] Garantizar ID3 completo (título, artista, álbum, género)
- [ ] UI: mostrar qué se descargó
- [ ] Validación: archivo guardado correctamente

**Commits:** 3-4

---

### Sprint 4: UI para Gestión (Days 12-14)

**Tareas:**
- [ ] Vista de "Archivos con metadatos incompletos"
- [ ] Batch edit (editar múltiples a la vez)
- [ ] Preview antes de guardar cambios
- [ ] Historial de cambios (opcional)
- [ ] Validación de campos

**Commits:** 3-4

---

### Sprint 5: Testing + Polish (Days 15-16)

**Tareas:**
- [ ] Tests para parseo ID3
- [ ] Tests para MusicBrainz lookup
- [ ] Tests para renombramiento
- [ ] Tests para CoverArtArchive
- [ ] Pruebas manuales (100+ archivos)
- [ ] Performance optimization

**Commits:** 2-3

---

## 📋 Lo que NO incluye v0.4.0

❌ Batch download de búsqueda (eso es Sprint futuro)
❌ Smart playlists por género (primero necesitamos género correcto)
❌ Estadísticas (para v0.5.0)
❌ YouTube full-stream
❌ Android background audio

**Por qué:** Primero arreglar metadatos, luego todo lo demás funciona mejor.

---

## 🎯 Success Criteria (v0.4.0 Release)

- [x] ID3 parser lee género completo
- [x] Imágenes álbumes no cortadas
- [x] Covers descargados automáticamente
- [x] MusicBrainz lookup funciona
- [x] Archivos renombrados correctamente
- [x] Metadatos sincronizados (ID3 = nombre archivo)
- [x] Descargas incluyen covers
- [x] 70+/75 tests passing
- [x] Cero bugs críticos
- [x] Deploy Vercel + APK signed

---

## 📊 Estimado Total

**v0.4.0 FASE 2:** 3-4 semanas
- Sprint 1: Lectura + Covers (3 días)
- Sprint 2: Enriquecimiento + Renombramiento (5 días)
- Sprint 3: Descargas mejoradas (3 días)
- Sprint 4: UI Gestión (3 días)
- Sprint 5: Testing + Polish (2 días)

**Total: 16 días de desarrollo = 3-4 semanas**

**Viable:** YES
**Sustentable:** YES (sin APIs frágiles, todo local)
**User Value:** HIGH (biblioteca profesional, metadatos consistentes)

---

## 🤔 Filosofía

MHL Music se convierte en:
- 📊 **Gestor profesional de biblioteca musical**
- 🏷️ **Con metadatos consistentes y completos**
- 🎨 **Y visualización de covers correcta**
- 📝 **Y edición intuitiva de tags**

No es:
- ❌ Streaming service
- ❌ Juguete
- ❌ Incompleto

---

**Próximo paso:** ¿Aprobado este roadmap? Entonces empezamos Sprint 1.
