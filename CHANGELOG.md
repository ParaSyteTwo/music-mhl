# Changelog

## v1.4.2 - 2026-06-11

### 🎌 Búsqueda de anime (OP/ED)

- Nueva sección "Búsqueda" en Ajustes (toggle **off** por defecto) que activa el modo anime en SearchPage.
- Cuando la query matchea heurísticas anime (palabras como "anime", "opening", "ending", o termina en `OP 1`, `ED 2`, etc.), SearchPage muestra tarjetas de anime con cover, título, año, tipo y episodios.
- Click en una tarjeta lista los OP/ED del anime con su videoId de YouTube.
- Click en un tema descarga vía `startDownloadWithVideoId` del store; si el video está muerto, fallback al picker de candidatos existente.
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
- Periodo de seguridad de siete días desde el último cambio del asset APK.
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
- Biblioteca, Descargas, Búsqueda, Ajustes, reproductor, avisos, estados y acciones respetan el idioma seleccionado.
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
