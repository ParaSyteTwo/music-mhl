# Technical Design Document
> Project: MHL Music
> Stack: React/Vite + pywebview/Python + Capacitor/Android
> Version: 2.2
> Last updated: 2026-06-13
> Scope: Desktop + Android

## 1. Alcance Normativo

Las unicas plataformas activas son:

- Desktop Windows: pywebview, Python y PyInstaller.
- Android: Capacitor 8 y plugins nativos.

El codigo Web/PWA y `services/ytdlp-service/` es legado fuera de scope. Puede
mantenerse compilando, pero no recibe features nuevas, no forma parte de QA de
release y no debe condicionar decisiones de arquitectura. FastAPI no se
despliega para el flujo real.

## 2. Tech Stack

### Frontend compartido

| Layer | Technology |
|---|---|
| UI | React 18 |
| Language | TypeScript 5 |
| Bundler | Vite 5 |
| Routing | React Router 6 |
| State | Zustand 5 |
| Styling | TailwindCSS 3 |
| Unit testing | Vitest |

### Desktop

| Layer | Technology | Ubicacion |
|---|---|---|
| Window host | pywebview | `mhl-desktop/launcher.py` |
| Native bridge | Python | `mhl-desktop/bridge.py` |
| Settings | Python | `mhl-desktop/settings.py` |
| Packaging | PyInstaller | `mhl-desktop/MHLMusic.spec` |
| Portable build | PowerShell | `mhl-desktop/scripts/build-portable.ps1` |
| Audio tools | yt-dlp + ffmpeg | incluidos por el packaging Desktop |

### Android

| Layer | Technology | Ubicacion |
|---|---|---|
| Host | Capacitor 8 | `android/` |
| YouTube/download | `YtDlpPlugin` | plugin nativo Android |
| File opening | `OpenFilePlugin` | plugin nativo Android |
| App updates | `AppUpdaterPlugin` | plugin nativo Android |

## 3. Arquitectura General

```text
music-mhl/
|-- src/                         React compartido Desktop + Android
|   |-- components/
|   |-- pages/
|   |-- store/
|   |-- lib/
|   |   |-- api/                 catalogo, anime y seleccion de audio
|   |   |-- platform/            deteccion android/pywebview/web legado
|   |   |-- ytdlpBridge.ts       adapter Capacitor
|   |   `-- appUpdaterBridge.ts
|   `-- types/
|-- mhl-desktop/
|   |-- launcher.py              servidor local + ventana pywebview
|   |-- bridge.py                red, yt-dlp, descarga y filesystem
|   |-- settings.py
|   |-- MHLMusic.spec
|   |-- scripts/build-portable.ps1
|   `-- tests/
|-- android/                     proyecto Capacitor Android
|-- scripts/android/             contrato y preparacion de release
|-- services/ytdlp-service/      legado fuera de scope
`-- release/                     ZIP portable, APK y manifiesto Android
```

`src/` significa frontend compartido por Desktop y Android; no implica que la
web sea una plataforma soportada.

## 4. Deteccion y Adaptacion de Plataforma

La API compartida distingue:

```typescript
type Platform = 'android' | 'pywebview' | 'web';
```

- `android`: `Capacitor.isNativePlatform()` y plugins registrados.
- `pywebview`: parametro `?platform=pywebview` o `window.pywebview`.
- `web`: fallback legado, no entregable.

La deteccion debe centralizarse en `src/lib/platform/`. Los adapters pueden
esperar el evento `pywebviewready` cuando el bridge aun no este inyectado.

| Operacion | Desktop | Android |
|---|---|---|
| Catalogo musical | bridge Python o llamada directa aprobada | frontend/HTTP nativo |
| Busqueda anime | `Bridge.anime_search` | AniList desde el adapter Android/frontend |
| Temas anime | `Bridge.anime_get_themes` | AnimeThemes desde el adapter Android/frontend |
| Candidatos YouTube | `Bridge.get_candidates` | `YtDlpPlugin.search` |
| Descarga | bridge Python + yt-dlp/ffmpeg | `YtDlpPlugin` |
| Filesystem | bridge Python restringido | plugins Capacitor |
| Updater app | no aplica | `AppUpdaterPlugin` |

Ninguna operacion Desktop o Android debe depender de
`services/ytdlp-service/`.

## 5. Desktop pywebview

### Arranque

```text
launcher.py
  -> inicia servidor local de assets Vite compilados
  -> crea ventana pywebview con ?platform=pywebview
  -> expone Bridge como window.pywebview.api
  -> React notifica frontend_ready
```

El servidor local solo sirve los assets embebidos. No convierte Desktop en una
plataforma web ni habilita el backend FastAPI legado.

### Bridge

`mhl-desktop/bridge.py` concentra las capacidades que requieren privilegios o
evitan CORS:

- peticiones a Deezer, AniList y AnimeThemes;
- busqueda y evaluacion de candidatos YouTube;
- ejecucion local de yt-dlp y ffmpeg;
- lectura y escritura controlada de archivos;
- seleccion de carpeta y settings Desktop.

Los metodos async del frontend deben capturar errores y trabajar con respuestas
tipadas:

```typescript
type BridgeResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };
```

Las operaciones de filesystem deben resolver rutas dentro de destinos
permitidos, bloquear escapes de directorio y confirmar escritura antes de
marcar una descarga como completada.

### Packaging

El build Desktop se ejecuta mediante:

```powershell
mhl-desktop/scripts/build-portable.ps1
```

PyInstaller usa `mhl-desktop/MHLMusic.spec`. El resultado de release es un ZIP
portable de Windows ubicado en `release/`, con la aplicacion y sus dependencias
runtime. No se genera instalador en el flujo normal.

## 6. Android Capacitor

El frontend compilado se sincroniza con `android/` mediante Capacitor. Las
capacidades nativas se exponen a TypeScript con adapters tipados.

Plugins registrados:

- `YtDlpPlugin`: busqueda, descarga y procesamiento de audio.
- `OpenFilePlugin`: apertura externa de archivos descargados.
- `AppUpdaterPlugin`: identidad, descarga, validacion e instalacion asistida.

No se modifica el codigo Android sin una necesidad concreta y pruebas
proporcionales al cambio. Toda release conserva package, firma y versionado
compatibles con `ANDROID_UPDATE_CONTRACT.md`.

## 7. Flujo Musical Normal

```text
consulta del usuario
  -> catalogo Deezer
  -> Track canonico: titulo, artista, album, portada, ISRC si existe
  -> generar consultas YouTube
  -> obtener y puntuar candidatos
  -> seleccion automatica segura o eleccion del usuario
  -> descargar audio
  -> escribir metadatos canonicos
  -> verificar archivo
  -> incorporar al historial de descargas
```

YouTube es fuente de audio. Sus titulos, canales y miniaturas son senales para
evaluar candidatos, no autoridad automatica sobre los metadatos de la pista.

## 8. Flujo Anime

### Activacion

`animeSearchEnabled` es persistente y `false` por defecto. Solo Ajustes puede
cambiarlo de forma explicita. Las heuristicas no activan la feature.

### Identidad

```text
consulta anime
  -> AniList: obra, titulos alternativos y portada
  -> AnimeThemes: opening/ending, song.title y song.artists
  -> Track canonico
       title  = titulo real de AnimeThemes
       artist = artistas de AnimeThemes
       album  = titulo del anime
       cover  = portada del anime
       context = OP/ED + secuencia + episodios
```

No debe construirse el titulo como `"{anime} OP 1"` cuando AnimeThemes aporta
el nombre de la cancion. OP/ED es contexto, no identidad musical.

### Seleccion de audio

```text
Track canonico
  -> consulta principal: titulo real + artista
  -> variantes limitadas: official audio, topic, opening/ending
  -> puntuar titulo, artista, duracion, ISRC y penalizaciones
  -> seleccionar candidato YouTube completo
  -> descargar audio
  -> conservar metadatos de AnimeThemes/AniList
```

El audio curado de AnimeThemes no es la fuente final preferida porque puede ser
TV-size. Se permite como fallback explicito cuando YouTube no ofrezca un
candidato valido. Los temas sin URL de audio curado deben conservarse si tienen
titulo y artista suficientes para buscar en YouTube.

La resolucion AnimeThemes debe comparar titulos romaji, ingles y nativo
normalizados. Ante resultados ambiguos, debe fallar de forma controlada en vez
de elegir silenciosamente otra serie.

## 9. Metadatos y MP3

- La identidad canonica procede del catalogo correspondiente: Deezer para
  musica normal; AnimeThemes/AniList para anime.
- Todas las descargas se convierten a MP3 con la calidad maxima de yt-dlp
  (`--audio-quality 0`) y usan tags ID3.
- Formato y calidad no son configurables.
- El nombre de archivo se deriva de artista y titulo canonicos tras sanitizar
  caracteres y nombres reservados.
- Una descarga solo termina con exito despues de comprobar escritura y tamano.

## 10. Android Update Architecture

`ANDROID_UPDATE_CONTRACT.md` es la fuente normativa y prevalece ante cualquier
resumen de este documento.

Fuente unica:

```text
GitHub Releases: ParaSyteTwo/music-mhl
```

Assets obligatorios:

```text
MHL-Music-Android.json
MHL-Music-{versionName}.apk
```

Identidad:

```text
versionCode + versionName + SHA-256
```

Flujo:

```text
release oficial
  -> validar manifiesto y elegibilidad temporal del canal
  -> comparar build instalada
  -> descargar a almacenamiento privado
  -> validar digest, package, version y certificado
  -> reconsultar GitHub
  -> abrir instalador Android
  -> confirmacion obligatoria del sistema
```

Reglas esenciales:

- incrementar `versionCode` en releases normales;
- conservar `applicationId = com.mhl.music` y el certificado actual;
- respetar siete dias desde `asset.updated_at` en stable;
- permitir prereleases beta desde su publicacion;
- no permitir downgrade;
- mantener separados updater de aplicacion y updater de yt-dlp;
- no inicializar este flujo en Desktop ni en el branch web legado;
- los errores son tipados y nunca bloquean el uso normal.

## 11. Build y Release

| Target | Preparacion | Artefacto requerido |
|---|---|---|
| Desktop | `mhl-desktop/scripts/build-portable.ps1` | ZIP portable Windows en `release/` |
| Android | `npm run android` y proceso de firma | APK firmado en `release/` |
| Android contract | `npm run android:prepare-release -- --apk <ruta>` | JSON y assets canonicos |

No hay target Web/PWA de release. `npm run build` produce assets compartidos
para los hosts activos; por si solo no representa una entrega web.

## 12. Testing Strategy

- Unit: Vitest para stores, utils, adapters y contratos de plataforma.
- Desktop: pytest para el bridge, anime, candidatos y packaging.
- Android: tests de adapters TypeScript, contrato de release y pruebas nativas
  cuando cambie un plugin.
- Integracion: busqueda, seleccion, descarga, metadatos y verificacion de
  archivo en Desktop y Android.
- Release smoke test: abrir el ZIP portable y el APK firmado en targets reales.

Los tests del branch web legado pueden mantenerse para evitar roturas de
compilacion, pero no son criterios de aceptacion ni bloquean una release.

## 13. Reglas de Evolucion

- Marcar `Alcance: Desktop + Android` al inicio de planes y SDD.
- Implementar logica Desktop en el bridge Python y logica Android en plugins o
  adapters nativos; no agregar endpoints FastAPI para features nuevas.
- Mantener una unica evaluacion de candidatos reutilizada por UI y descarga.
- Centralizar deteccion de plataforma y tipos de bridge.
- No agregar dependencias externas sin aprobacion.
- Toda feature incluye tests unitarios.
- Todo async captura errores y devuelve errores tipados.
- No subir binarios yt-dlp o ffmpeg a git.
- No crear otro mecanismo de actualizacion Android que contradiga
  `ANDROID_UPDATE_CONTRACT.md`.
