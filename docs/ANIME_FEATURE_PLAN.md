<deliver-assets>
<media type="md" src="commit-id-408303346467125" caption="Plan completo de la feature Anime: OP/ED search integrada en Search" name="ANIME_FEATURE_PLAN.md" />
</deliver-assets>

---

```markdown
# Plan: Búsqueda de Openings/Endings de Anime

> Feature: integrar la búsqueda de openings/endings directamente en el tab de Search, con detección automática del "anime-feel" del query.
>
> Status: acordado en sesión, pendiente de implementar.
> Slices diseñados, slice 1 listo para arrancar.

---

## 1. Motivación

La app ya sabe buscar canciones y descargar audio. Para anime, el videoId del OP/ED correcto es **conocido y curado** por la comunidad — no tiene sentido pasar por el candidate picker ni por una búsqueda abierta a YouTube. Esta feature aprovecha eso: cuando el usuario busca algo que huele a anime, en lugar de mostrar canciones se le muestra la lista de openings/endings numerados y puede descargar/escuchar directo.

---

## 2. UX acordada

Un solo input en el **tab Search actual**. La decisión es automática:

```
[Query del usuario]
       │
       ▼
¿La query matchea el patrón "anime-feel"?
       │
   ┌───┴───┐
  SÍ      NO
   │       │
   ▼       ▼
[Modo    [Modo
 anime]   canciones]
   │       │
   ▼       ▼
Lista    Canciones
de anime de Deezer
   │
   ▼ click anime
   │
[Lista de OP/ED numerados]
   │
   ▼ click OP N o ED N
   │
[Download directo con videoId]
```

### 2.1 Trigger "anime-feel"

La query se considera con "anime-feel" si matchea cualquiera de:

- Contiene keyword: `anime`, `opening`, `ending`, `ost`, `theme song`
- Matchea patrón regex: `^.+\s+(op|ed|opening|ending)\s*\d*$` (ej. `"naruto op 1"`, `"bleach ending 3"`, `"one piece opening"`)
- Fallback: 0 resultados de canciones + query parece nombre propio (≤ 3 palabras, sin caracteres especiales)

Cuando se dispara, arriba de los resultados aparece un badge **"Buscando anime"** para que sea obvio el modo activo. Click en el badge → vuelve a modo canciones con la misma query.

### 2.2 Click en un OP/ED

- **Comportamiento principal:** descarga directa usando el `videoId` conocido (provisto por animethemes.moe). Se reutiliza `startDownloadWithVideoId` que ya existe.
- **Fallback:** si el video de YouTube está muerto (DMCA, eliminado), se re-busca en YouTube con título + artista y se ofrece el picker normal. Esto evita que un video caído rompa la descarga.

### 2.3 Vista de detalle del anime

Cuando el usuario hace click en un anime de la lista:

```
┌─ Naruto (2002 · TV · 220 eps) ─────┐
│  [cover grande]  Sinopsis...        │
│                                      │
│  ── OPENINGS ──                      │
│  [thumb]  OP 1   "Rocks"            │
│           Hound Dog · eps 1-25   ⬇  │
│  [thumb]  OP 2   "Haruka Kanata"    │
│           ASIAN KUNG-FU · 26-53 ⬇  │
│  ...                                 │
│                                      │
│  ── ENDINGS ──                       │
│  [thumb]  ED 1   "Wind"             │
│           Akemi Okamura · 1-25   ⬇  │
│  ...                                 │
└──────────────────────────────────────┘
```

Extras que se incluyen en MVP: sinopsis, año, número de episodios.
Extras fuera de MVP: anime relacionados, insert songs, filtros por año/género.

---

## 3. Decisiones técnicas

### 3.1 Fuentes de datos

| Necesidad | Fuente | Razón |
|---|---|---|
| Buscar/listar anime (cover, año, tipo, sinopsis, episodios) | **AniList** GraphQL | Sin auth, completo |
| Lista de OP/ED con videoId YouTube | **animethemes.moe** GraphQL | LA base de datos de la comunidad, IDs verificados |
| Audio al descargar | YouTube vía pipeline actual | Sin cambio |

Ambas fuentes son públicas, sin API key, sin rate limit agresivo para uso personal.

### 3.2 Arquitectura

```
[SearchPage] 
    ↓ searchAnime(q)
[animeApi.searchAnime] ──web──> [backend /anime/search] ──> AniList
                            └──desktop/android──> AniList directo
                            (CORS friendly en native webviews)

    ↓ getAnimeThemes(slug)
[animeApi.getAnimeThemes] ──web──> [backend /anime/themes] ──> animethemes.moe
                              └──desktop/android──> animethemes.moe directo

    ↓ click "OP 1"
[downloadAnimeTheme(theme)]
    ↓ try
[startDownloadWithVideoId(track, videoId)]   ← ya existe
    ↓ catch (video dead)
[getDownloadCandidates(track)]  ← ya existe
    ↓
[picker normal]   ← fallback elegante
```

Se reutiliza el pipeline de descarga actual. Lo único nuevo es la fuente de la lista.

### 3.3 Platform awareness

El switch de plataforma sigue el mismo patrón que el resto de la app:

```ts
function getAnimeApiBase() {
  if (isRunningInPyWebView()) return 'pywebview_bridge'  // llama a window.pywebview.api
  if (Capacitor.isNativePlatform()) return 'capacitor_bridge'  // futuro plugin si hace falta
  return 'web_backend'  // pega a VITE_RAILWAY_URL/anime/*
}
```

AniList y animethemes.moe permiten CORS para todos los orígenes, así que el frontend web puede llamarlas directamente si queremos evitar proxy — pero el proxy backend es preferible para:
- Cachear respuestas (anime no cambia seguido)
- Mantener una sola fuente de verdad
- No exponer lógica de cliente

### 3.4 i18n

Todos los strings nuevos van en es + en. Keys tentativos:

```
anime.search.placeholder        "Buscar anime..."
anime.mode.active                "Buscando anime"
anime.mode.songs                 "Buscar canciones"
anime.detail.episodes            "{n} episodios"
anime.detail.year                "{year}"
anime.detail.type.TV             "TV"
anime.detail.type.MOVIE          "Película"
anime.detail.type.OVA            "OVA"
anime.detail.type.SPECIAL        "Especial"
anime.themes.opening             "OPENINGS"
anime.themes.ending              "ENDINGS"
anime.themes.episodeRange        "eps {from}-{to}"
anime.themes.deadVideo           "El video no está disponible, buscando alternativa..."
anime.themes.download            "Descargar"
anime.empty                      "No se encontraron resultados"
```

---

## 4. Slices

Cada slice es entregable, testeable y no rompe nada existente.

### Slice 1 — Backend: cliente AniList + animethemes + endpoints

**Cero riesgo** (código nuevo, no toca lo existente).

Archivos:
- `services/ytdlp-service/modules/anime_client.py` (nuevo)
  - `search_anime(query: str, limit: int) -> list[Anime]`
  - `get_anime_themes(anilist_id: int) -> list[AnimeTheme]`
- `services/ytdlp-service/routes/anime.py` (nuevo)
  - `POST /anime/search` → `{ query, limit }` → `{ success, results: [Anime] }`
  - `POST /anime/themes` → `{ anilist_id }` → `{ success, themes: [AnimeTheme] }`
- `services/ytdlp-service/app.py` (modificar) — registrar rutas
- `services/ytdlp-service/tests/test_anime.py` (nuevo) — tests pytest

Tipos:
```python
@dataclass
class Anime:
    id: int
    title_romaji: str
    title_english: str | None
    title_native: str | None
    cover: str  # large
    type: str  # TV | MOVIE | OVA | SPECIAL
    episodes: int | None
    year: int | None
    synopsis: str | None

@dataclass
class AnimeTheme:
    anime_id: int
    type: str  # OP | ED
    sequence: int  # 1, 2, 3...
    title: str
    artist: str
    episodes_from: int | None
    episodes_to: int | None
    video_id: str  # YouTube ID
    video_url: str
```

Esfuerzo: ~3 horas.

### Slice 2 — Desktop bridge

- `mhl-desktop/bridge.py` (modificar) — agregar métodos:
  - `anime_search(self, query: str, limit: int) -> dict`
  - `anime_get_themes(self, anilist_id: int) -> dict`
- `mhl-desktop/tests/test_anime_bridge.py` (nuevo) — tests pytest con mocks

Esfuerzo: ~1 hora.

### Slice 3 — Types + animeApi.ts

- `src/types/anime.ts` (nuevo)
- `src/lib/api/animeApi.ts` (nuevo) — `searchAnime()`, `getAnimeThemes()`, `downloadAnimeTheme()` con el switch de plataforma
- `src/lib/api/animeApi.test.ts` (nuevo) — tests Vitest

Esfuerzo: ~2 horas.

### Slice 4 — UI en SearchPage

- `src/components/ui/AnimeCard.tsx` (nuevo) — card con cover + meta
- `src/components/ui/ThemeRow.tsx` (nuevo) — fila con badge "OP 1"/"ED N", título, artista, episode range, botón descargar
- `src/components/ui/AnimeModeBadge.tsx` (nuevo) — el badge "Buscando anime" toggleable
- `src/pages/SearchPage.tsx` (modificar):
  - Detectar anime-feel en la query
  - Si sí → renderizar vista anime en lugar de canciones
  - Click en anime → vista detalle con lista de temas
  - Click en tema → llama a `downloadAnimeTheme`

Esfuerzo: ~4-6 horas.

### Slice 5 — i18n

- `src/lib/i18n.ts` (modificar) — agregar keys listadas arriba en es + en

Esfuerzo: ~1 hora.

### Slice 6 — Dead-video fallback

- `src/lib/api/animeApi.ts` (modificar) — `downloadAnimeTheme` con try/catch:
  - Si `startDownloadWithVideoId` falla con error de video muerto
  - Llamar a `getDownloadCandidates` con título + artista
  - Devolver candidatos para que el picker los ofrezca
- `src/lib/api/animeApi.test.ts` (modificar) — tests del fallback

Esfuerzo: ~2 horas.

### Slice 7 — Verificación final

- TypeScript build
- ESLint
- Vitest run completo
- Pytest run completo (servicio + desktop)
- Probar manualmente en Web (PWA), Desktop pywebview, Android
- Si todo OK → release

Esfuerzo: ~2 horas.

**Total estimado: 3-4 días con foco.**

---

## 5. Archivos a tocar (resumen)

| Estado | Archivo |
|---|---|
| nuevo | `services/ytdlp-service/modules/anime_client.py` |
| nuevo | `services/ytdlp-service/routes/anime.py` |
| modificar | `services/ytdlp-service/app.py` |
| nuevo | `services/ytdlp-service/tests/test_anime.py` |
| modificar | `mhl-desktop/bridge.py` |
| nuevo | `mhl-desktop/tests/test_anime_bridge.py` |
| nuevo | `src/types/anime.ts` |
| nuevo | `src/lib/api/animeApi.ts` |
| nuevo | `src/lib/api/animeApi.test.ts` |
| nuevo | `src/components/ui/AnimeCard.tsx` |
| nuevo | `src/components/ui/ThemeRow.tsx` |
| nuevo | `src/components/ui/AnimeModeBadge.tsx` |
| modificar | `src/pages/SearchPage.tsx` |
| modificar | `src/lib/i18n.ts` |

---

## 6. Convenciones a respetar

- Plan antes de código (regla de `AGENTS.md`)
- Cambios atómicos (un slice = un commit)
- Tests junto al código, no después
- `try/catch` con respuestas de error tipadas
- Sin `any` — usar `unknown` + type guards
- Sin dependencias externas nuevas sin aprobación
- Estilo del código existente: TypeScript strict, ESLint pasa
- Python: typing hints, dataclasses, no `print` (usar `logging`)

---

## 7. Riesgos identificados

- **AniList / animethemes.moe cambian su API**: usar un cliente dedicado por fuente, no llamadas `fetch` esparcidas. Si rompen, se arregla en un solo lugar.
- **YouTube video muerto**: cubierto con el fallback de slice 6.
- **CORS en web**: cubierto usando el backend como proxy.
- **Performance**: cachear respuestas en backend (anime no cambia seguido). TTL 24h razonable.
- **Anime adulto / NSFW**: AniList filtra por default. Si se quiere, agregar flag `adult` opcional.
- **Traducción de títulos**: usar `title_romaji` o `title_english` según el `deviceLang` del usuario.

---

## 8. Próximo paso

Empezar por el **Slice 1** (backend). Es trabajo aislado, no toca nada existente, y nos da la base para todo lo demás. Una vez listo:

1. Probar con `curl` o `httpie`:
   ```
   curl -X POST $VITE_RAILWAY_URL/anime/search \
     -H "Authorization: Bearer $SERVICE_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"query": "naruto", "limit": 5}'
   ```
2. Validar tipos y forma de la respuesta.
3. Pasar al slice 2.
```

---