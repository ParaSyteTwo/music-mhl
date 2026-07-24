# PRD - Product Requirements Document
> Project: MHL Music
> Version: 2.3
> Last updated: 2026-07-21
> Scope: Desktop (Windows, pywebview) + Android (Capacitor)

## 1. Overview

MHL Music es una aplicacion para buscar, reproducir, identificar y descargar
musica en dos plataformas activas:

- Desktop Windows mediante React/Vite dentro de pywebview, con bridge Python.
- Android mediante React/Vite dentro de Capacitor y plugins nativos.

El frontend compartido vive en `src/`. Web/PWA y el backend FastAPI son codigo
legado fuera del producto entregado. No reciben nuevas features ni forman parte
de los requisitos, QA o releases de Desktop y Android.

## 2. Target Audience

| Plataforma | Usuario | Caso de uso |
|---|---|---|
| Desktop | Usuario principal | Buscar, reproducir y descargar musica localmente en Windows |
| Android | Usuario principal | Usar la aplicacion nativa, descargar musica y abrir archivos guardados |

## 3. Core Features

| Feature | Plataforma | Priority | Descripcion |
|---|---|---|---|
| Busqueda musical | Desktop + Android | P0 | Buscar canciones, artistas y albumes usando Deezer como catalogo |
| Reproductor | Desktop + Android | P0 | Play, pause, seek y volumen |
| Descarga de audio | Desktop + Android | P0 | Resolver primero en YouTube Music Songs, revisar ambigüedades y guardar MP3 |
| Metadatos | Desktop + Android | P0 | Conservar titulo, artista, album y portada de la identidad musical seleccionada |
| Busqueda anime opt-in | Desktop + Android | P1 | Buscar anime y listar sus openings/endings solo cuando el usuario activa el modo |
| Ajustes | Desktop + Android | P1 | Carpeta cuando aplique, idioma, letras, reproductor y modo anime |
| Updater asistido | Android | P1 | Detectar una release oficial, verificarla y abrir la instalacion con confirmacion del sistema |

## 4. Requisitos por Plataforma

### Desktop

- Runtime: pywebview con backend local Python en `mhl-desktop/`.
- Las llamadas con restricciones de CORS, busqueda YouTube, descargas y acceso
  al filesystem pasan por `window.pywebview.api`.
- yt-dlp y ffmpeg se distribuyen con el build portable; el usuario no debe
  instalarlos por separado.
- El artefacto de release es un ZIP portable de Windows en `release/`.
- No se genera instalador salvo peticion explicita.
- Desktop no depende del FastAPI legado ni de Fly.io para sus flujos reales.
- El paquete debe funcionar sin Node ni una instalacion externa de Python.

### Android

- Runtime: Capacitor 8 con plugins nativos registrados en `android/`.
- La busqueda y descarga YouTube se realizan mediante el plugin `YtDlp`.
- Apertura de archivos y updater usan sus respectivos plugins nativos.
- Las releases deben conservar `applicationId = com.mhl.music`, el certificado
  de firma actual e incrementar `versionCode` en releases normales.
- `ANDROID_UPDATE_CONTRACT.md` es la especificacion normativa del updater.
- El APK y `MHL-Music-Android.json` se publican con los nombres definidos por
  dicho contrato.

## 5. Contrato de Anime

El modo anime esta desactivado por defecto y solo se activa desde Ajustes. La
eleccion se persiste. Ninguna consulta, reproduccion o heuristica puede
habilitarlo automaticamente.

Cuando el modo esta activo:

1. AniList identifica la obra y aporta sus titulos y portada.
2. AnimeThemes resuelve los temas y es la autoridad para la identidad musical:
   `song.title` es el titulo de la cancion y `song.artists` sus artistas.
3. El titulo del anime se conserva como album o contexto, no sustituye al
   titulo real de la cancion.
4. YouTube se usa para localizar y seleccionar el audio completo que mejor
   coincide con titulo, artista y duracion esperada.
5. Los titulos y metadatos de YouTube no reemplazan automaticamente la
   identidad obtenida de AnimeThemes.
6. El audio curado de AnimeThemes puede utilizarse como fallback explicito
   cuando no haya una alternativa valida, dejando claro si es una version
   corta o TV-size.

Las heuristicas `anime-feel` solo pueden modificar consultas o ranking cuando
el ajuste ya esta habilitado. Una busqueda ambigua nunca altera el flujo
musical normal de un usuario que no haya optado por la feature.

## 6. Acceptance Criteria

### Resolucion y rendimiento

- [ ] Deezer conserva titulo, artista, album, ISRC y edicion como identidad canonica.
- [ ] YouTube Music `#songs` es la fuente primaria y YouTube general solo se consulta en verificacion profunda cuando no existe una coincidencia valida.
- [ ] La primera cancion de YouTube Music se descarga con un toque cuando el titulo base coincide y no hay contradicciones de version, colaboracion o edicion; el selector aparece solo ante ambiguedad real.
- [ ] El selector no muestra porcentajes sinteticos: identifica la opcion principal, las versiones que requieren eleccion y las alternativas incompatibles.
- [ ] Toda descarga musical recibe un `videoId` resuelto y ninguna plataforma repite una busqueda oculta.
- [ ] La preferencia de edicion admite catalogo, explicita, limpia o preguntar; catalogo es el valor predeterminado.
- [ ] Android ejecuta una resolucion simultanea y Desktop dos. Datos moviles en modo ligero no supera cinco canciones por consulta.
- [ ] La cola se cancela al cambiar consulta y se pausa sin red, con la app oculta, ahorro de bateria o menos del 20 por ciento sin cargar.
- [ ] La cache persistente guarda positivos 72 horas, vacios 10 minutos y como maximo 200 pistas.
- [ ] La traduccion de letras usa un idioma independiente y el locale nativo de Windows o Android.
- [ ] El LRC conserva un unico registro por timestamp y completa por linea los huecos de romaji japones o coreano sin duplicar la misma letra en ID3 y sidecar.
- [ ] El archivo final es MP3, se puede decodificar y su duracion esta dentro de `max(5 segundos, 5%)`.

### Desktop

- [ ] Busca musica y anime sin llamar al backend FastAPI legado.
- [ ] Reproduce audio y refleja correctamente errores de reproduccion.
- [ ] Descarga una cancion completa y confirma que el archivo fue escrito.
- [ ] Escribe metadatos coherentes con la identidad elegida.
- [ ] Funciona en Windows 10/11 limpio sin Node ni Python instalados.
- [ ] La release genera un ZIP portable en `release/`.
- [ ] El ZIP incluye los binarios y recursos requeridos por pywebview,
      yt-dlp y ffmpeg.

### Android

- [ ] Busqueda, reproduccion, descargas y apertura externa no sufren regresiones.
- [ ] La release genera un APK firmado en `release/`.
- [ ] El updater cumple integramente `ANDROID_UPDATE_CONTRACT.md`.
- [ ] Toda instalacion requiere confirmacion del sistema Android.

### Anime

- [ ] El modo permanece inactivo hasta que el usuario lo habilita.
- [ ] La cancion usa el titulo y artista reales de AnimeThemes.
- [ ] El anime se guarda como album o contexto, no como titulo de pista.
- [ ] La seleccion YouTube se evalua contra la identidad canonica y no la
      sustituye.
- [ ] La ausencia de audio curado no elimina un tema que pueda resolverse en
      YouTube.
- [ ] Los fallbacks cortos o TV-size se presentan como tales.

## 7. Release Artifacts

Cada release normal debe dejar en `release/`:

- Un ZIP portable de Windows construido con PyInstaller.
- Un APK Android firmado.
- `MHL-Music-Android.json` y los assets adicionales exigidos por
  `ANDROID_UPDATE_CONTRACT.md`.

No se publica PWA, despliegue web, servicio FastAPI ni instalador de Windows
como parte del proceso normal.

## 8. Out of Scope

- Web/PWA y compatibilidad de navegador como producto entregable.
- Despliegue o ampliacion funcional de `services/ytdlp-service/`.
- Biblioteca local, importacion de archivos y gestion de playlists dentro de la
  aplicacion. La pantalla activa conserva solo el historial de descargas.
- Instalador Windows, salvo peticion explicita.
- macOS y Linux.
- Login o cuentas de usuario.
- Auto-update de Desktop.

## 9. Success Metrics

- Desktop y Android completan busqueda, reproduccion y descarga sin depender
  del backend legado.
- Las descargas anime conservan el nombre original de la cancion y sus
  metadatos canonicos.
- Cada release produce los artefactos Desktop y Android requeridos.
- No hay regresiones en el contrato de actualizacion Android.
