# Changelog

## v1.4.7-beta.2 - 2026-06-14

- Corregida la lectura nativa de tamaños, versiones y timestamps enviados por Capacitor al descargar e instalar actualizaciones.
- Unificado `FileProvider` para que el instalador Android pueda leer el APK validado sin errores de autoridad.

## v1.4.7-beta.1 - 2026-06-14

- Corregido el canal beta para aceptar inmediatamente la release más reciente, sea estable o prerelease.
- Mejorada la detección de letras en español y eliminadas capas duplicadas entre original, romanización y traducción.

## v1.4.6 - 2026-06-14

- Eliminada la biblioteca local, su navegación, estado, plugin Android y dependencia de selección de archivos.
- Las descargas quedan fijadas a MP3 con la calidad máxima de yt-dlp; formato y calidad dejan de ser ajustes.
- El updater usa una sola acción para comprobar, descargar, validar y abrir el instalador.
- El canal estable conserva siete días de maduración; los prereleases beta son elegibles desde su publicación.

## v1.4.5 - 2026-06-13

### Anime

- Los títulos y artistas de AnimeThemes se usan como identidad canónica de la canción, conservando el anime como álbum y su portada.
- YouTube selecciona la canción completa; el audio TV-size de AnimeThemes queda como fallback explícito.
- Eliminado el fallback ambiguo al primer resultado y mantenidos los temas sin audio curado para búsquedas en YouTube.

### Desktop

- Corregida la transferencia de audio Base64, la búsqueda/scoring Python y la escritura segura dentro de la carpeta configurada.
- Las descargas ya no se marcan como completadas si falla la escritura.
- AAC queda deshabilitado mientras el pipeline de metadatos solo sea compatible con MP3.

### Android y frontend

- Restauradas la cola atómica y la restauración de archivos reales.
- Restaurado el periodo obligatorio de maduración de siete días y restringido el canal beta a prereleases.
- Bloqueados downgrades, restringido FileProvider y corregidos los contratos TypeScript del updater.
- `versionCode` incrementado a `19` con el paquete y certificado oficiales.

### Verificación

- Lint, TypeScript, tests frontend, Desktop y Android, builds de producción y contratos de release superados.
- ZIP portable y APK firmada verificados antes de publicar.

## v1.4.4 - 2026-06-13

### 📱 Android

- Corregida la apertura del instalador del sistema en móviles que no aceptaban la acción genérica usada por versiones anteriores.
- El APK descargado se comparte con el instalador mediante un permiso de lectura explícito y compatible con distintos fabricantes.
- Al volver de autorizar "Instalar aplicaciones desconocidas", MHL Music comprueba el permiso y reanuda la instalación automáticamente.
- Si el instalador del sistema no está disponible, la aplicación muestra un error concreto en vez de quedar bloqueada.
- `versionCode` incrementado a `18` y certificado oficial conservado.

### ✅ Verificación

- Tests frontend, lint, build de producción y tests Android superados.
- Actualización firmada desde 1.4.3 verificada conservando paquete y certificado.

## v1.4.3 - 2026-06-13

### 💻 Desktop

- Corregida la pantalla negra causada por una dependencia circular entre el store y la API de descargas.
- Corregido el acceso a una función de búsquedas recientes antes de inicializarla, que impedía montar la pantalla de búsqueda.
- El ajuste de búsqueda anime se pasa explícitamente al ranking, caché y descarga sin acoplar la API al estado global.
- El empaquetado ahora solo supera el smoke test cuando React confirma que la interfaz terminó de montar.

### 📱 Android

- La consulta del manifiesto de actualización usa HTTP nativo de Capacitor para evitar el bloqueo CORS de los assets de GitHub Releases.
- Eliminado el service worker legado que podía mezclar `index.html` y chunks JavaScript de versiones distintas tras actualizar.
- Cada `versionCode` limpia una vez los caches PWA antiguos antes de cargar la interfaz nueva.
- Una release remota anterior se muestra como aplicación actualizada, no como un fallo de downgrade.
- Ajustes vuelve a consultar la identidad nativa si el estado persistido no contiene la versión instalada.
- Ajustes muestra el código y detalle real cuando una comprobación o instalación falla.
- `versionCode` incrementado a `17` y certificado oficial conservado.

### ✅ Verificación

- Tests frontend, lint, build de producción y tests Desktop superados.
- Portable Windows construido con Python 3.12 y apertura real verificada.
- APK release firmada verificada en instalación limpia y actualización conservando datos.
- Flujo anime Android verificado con AniList, AnimeThemes y descarga directa completada.

## v1.4.2 - 2026-06-11

### 🎌 Búsqueda de anime (OP/ED)

- Nueva sección "Búsqueda" en Ajustes (toggle **off** por defecto) que activa el modo anime en SearchPage.
- Cuando la query matchea heurísticas anime (palabras como "anime", "opening", "ending", o termina en `OP 1`, `ED 2`, etc.), SearchPage muestra tarjetas de anime con cover, título, año, tipo y episodios.
- Click en una tarjeta lista los OP/ED obtenidos desde AnimeThemes.
- Click en un tema descarga el audio directo de AnimeThemes; si no está disponible, usa YouTube mediante el selector de candidatos existente.
- i18n completo en `es` y `en` (`animeModeActive`, `animeToggleTitle`, `animeThemesDownload`, etc.).
- Desktop (pywebview): nuevos métodos `bridge.anime_search` y `bridge.anime_get_themes` que llaman directo a AniList y animethemes.moe desde Python (sin backend). Respuesta en camelCase para coincidir con la interface TS.

### 📐 Arquitectura

- Alcance del proyecto actualizado: **solo Desktop (pywebview) + Android (Capacitor)**. La web/PWA está fuera de scope — la IP del servidor de Google rechaza el tráfico de yt-dlp. `AGENTS.md` y `TECH_DESIGN.md` documentan el cambio.
- Backend FastAPI `services/ytdlp-service/` queda como código legacy — no se despliega, no se verifica en releases.

### 🔧 Compatibilidad

- `versionCode` incrementado a `16`.
- Esta es la primera release estable tras 1.4.1 (que rompió la cuarentena de 7 días de 1.4.0). Desde esta release, las versiones estables futuras son inmediatas.

## v1.4.1 - 2026-06-10

### 📱 Canales de actualización

- El canal estable ofrece inmediatamente la última release pública.
- Nuevo canal **Beta tester** opcional para recibir prereleases oficiales.
- El canal elegido queda guardado y se comprueba al cambiarlo.
- Ajustes muestra el canal activo y la versión remota detectada.
- Se mantienen SHA-256, package, versión, certificado, bloqueo de downgrade y reconsulta antes de instalar.
- Las versiones intermedias no se descargan: cada canal resuelve únicamente su candidato más reciente.

### 🔧 Compatibilidad

- Los APK beta admiten versiones como `1.4.2-beta.1`.
- `versionCode` incrementado a `15`.
- La actualización desde `1.4.0` requiere instalar `1.4.1` manualmente o esperar la cuarentena que ya estaba compilada en `1.4.0`. Desde `1.4.1`, las siguientes versiones estables son inmediatas.

## v1.4.0 - 2026-06-10

### 📱 Auto-update Android

- Detección automática de nuevas versiones publicadas únicamente en `ParaSyteTwo/music-mhl`.
- Comprobación manual desde Ajustes y comprobación no bloqueante cada 24 horas.
- Identidad de compilación mediante `versionCode`, `versionName` y SHA-256 del APK.
- Periodo de seguridad estable de siete días desde el último cambio del asset APK.
- La hora confiable de GitHub impide acortar la espera modificando el reloj del dispositivo.
- Descarga privada con progreso, cancelación y prevención de descargas duplicadas.
- Validación de digest, paquete `com.mhl.music`, versión y certificado firmante.
- Reconsulta de GitHub antes de descargar y antes de instalar.
- Instalación asistida mediante el instalador del sistema y permiso de fuente desconocida.
- Compatibilidad de firma para Android API 24-27 y API 28+.

### 🔍 Selector de candidatos

- Nueva presentación visual para coincidencias exactas, muy altas, revisables y alternativas.
- Porcentaje, etiquetas y explicación individual basados en canal, versión y duración.
- Avisos claros para covers, directos, remixes, instrumentales, videos con letras y duraciones incorrectas.
- Los visualizers y videos musicales dejan de mostrarse como coincidencia exacta.

### 🔒 Release y firma

- Credenciales de firma eliminadas de la configuración versionada.
- Verificación obligatoria del certificado release antes de compilar.
- Generación automática de `MHL-Music-Android.json`.
- Validación contractual del APK antes de preparar los assets de GitHub.

### ✅ Verificación

- Pruebas unitarias del parser de releases, política de seguridad, bridge, store, UI y contrato de publicación.
- TypeScript, ESLint, build de producción y compilación Android debug/release superados.
- Certificado Android preservado sin rotación de clave.

## v1.3.5 - 2026-06-09

### 💻 Windows Desktop

- Aplicación portable autocontenida con `yt-dlp.exe`, `ffmpeg.exe`, entorno Python y pywebview incluidos.
- Búsqueda directa en Deezer y descargas locales sin utilizar el backend de Fly.io.
- Marco nativo de Windows y ventanas de comandos ocultas durante las descargas.

### 🌐 English Update

- Interfaz completa en español e inglés con detección del idioma del dispositivo y selección manual.
- Modos de idioma `Sistema`, `Español` e `Inglés`.
- Descargas, Búsqueda, Ajustes, reproductor, avisos, estados y acciones respetan el idioma seleccionado.
- Migración automática de la preferencia de idioma anterior.

### 🎤 Letras sincronizadas multicapa

- Capas sincronizadas de letra original, romanizada y traducida.
- Archivos `.lrc` opcionales guardados junto a los MP3 descargados.
- La traducción se omite cuando el idioma original ya coincide con el idioma de destino.

### 📱 Android

- Detección de reproductores externos y reproductor predeterminado configurable.
- La reproducción comienza en `00:00` al abrir canciones externamente.
- Fases de descarga, velocidad y tiempo estimado en directo.
- Búsqueda adaptativa de candidatos con entre dos y cuatro trabajadores.

### 🔍 Búsqueda y picker de candidatos

- Caché de búsqueda, reutilización de peticiones en curso, debounce y protección contra respuestas antiguas.
- El precalentado del picker reutiliza la petición iniciada con el primer toque.
- Un máximo de tres candidatos únicos ordenados por calidad.
- Clasificación basada en título, artista, álbum, canal oficial, duración e ISRC cuando está disponible.
- Porcentaje, estado, etiquetas y explicación individual para cada candidato.
- Colores semánticos: lima para coincidencia exacta, cian para muy alta, ámbar para revisar y rojo suave para versiones alternativas.
- Los visualizers y videos de letras ya no aparecen como coincidencia exacta solo por ocupar la primera posición.
- Penalizaciones mayores para covers, directos, remixes, versiones alteradas, instrumentales, videos musicales y duraciones incorrectas.
- Las consultas adicionales solo se ejecutan cuando el resultado principal no tiene confianza suficiente.
- Animaciones reducidas y carga diferida de portadas en dispositivos modestos.

### ⚡ Rendimiento de descargas

- Audio, metadatos y letras comienzan en paralelo.
- Windows y Android ya no esperan tres segundos entre descargas en cola.
- Web/PWA conserva una pausa protectora para la infraestructura remota compartida.
- La concurrencia de descargas se mantiene limitada a dos.

### ✅ Verificación

- Pruebas frontend del ranking, caché, concurrencia y presentación visual superadas.
- Pruebas Python de candidatos, puntuación y empaquetado Desktop superadas.
- TypeScript, lint, PWA, compilación Android release y portable de Windows superados.

## v1.2.3 - 2026-03-31

### Fixed

- Fixed an issue that could create duplicate files when downloading tracks.

### Improved

- Improved metadata extraction and writing with more fields and greater accuracy.

### Optimized

- Reduced CPU and memory usage during download and processing.

### Notes

- Android and Web builds were updated with the metadata and performance fixes.

## v1.1.0 - 2026-03-29

### Added

- Candidate picker before downloading so the user can choose the exact YouTube result.
- Download modes for `Original`, `Cover`, and `Live`.
- Direct `videoId` override support in Web and native download flows.
- Backend candidate lookup endpoint and broker fallback logic for better resilience.

### Changed

- Web downloads no longer depend on guessing a single result before user confirmation.
- Candidate search prefers official audio by default and separates alternate versions more clearly.
- Error handling surfaces backend messages instead of showing only a generic failure.

### Fixed

- Improved selection for songs where the first automatic YouTube match was incorrect.
- Reduced failures when the external download service does not expose the newest candidate endpoint.

### Notes

- Android was aligned to version `1.1.0`.
- The Supabase `yt-stream` function was redeployed for this release.
