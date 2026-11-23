# 🎵 MHL Music

## Tu música. Sin límites.

**MHL Music** es una aplicación de código abierto para buscar y descargar música en Windows y Android.

Usa **Deezer** como catálogo principal y **YouTube / YouTube Music** como fuente de audio, con soporte para **álbumes y playlists en un clic** (Deezer, YouTube y Spotify) y un **modo Anime por temporadas** opcional. Las descargas se procesan localmente con `yt-dlp` y `ffmpeg` en **M4A (por defecto, sin recodificar)** o **MP3**, completadas con portada, metadatos nativos y letras sincronizadas multicapa.

Sin cuentas obligatorias, sin anuncios y sin seguimiento.

### 📥 Descargar

[![Última versión](https://img.shields.io/github/v/release/ParaSyteTwo/music-mhl?include_prereleases&label=versión&color=C8F04B)](../../releases)
[![Android](https://img.shields.io/badge/Android-APK-3DDC84?logo=android&logoColor=white)](../../releases)
[![Windows](https://img.shields.io/badge/Windows-Portable-0078D4?logo=windows&logoColor=white)](../../releases)
[![Licencia](https://img.shields.io/badge/licencia-MIT-green)](LICENSE)

---

## ✨ Funciones principales

### 💻 Windows Desktop — App self-contained

- **`yt-dlp.exe` + `ffmpeg.exe` incluidos** en el portable, con actualización integrada de `yt-dlp` desde Ajustes
- Interfaz de escritorio con **pywebview** y WebView nativo de Windows
- No requiere instalar **Python**, **Node.js** ni usar permisos de administrador
- Búsqueda directa en Deezer, YouTube, Spotify Embed y fuentes de anime sin depender del backend legado
- Descarga local en **M4A** (copia directa de stream AAC sin pérdida extra) o **MP3**
- Transferencia **zero-base64 por ruta temporal en disco** para reducir picos de RAM
- Etiquetado nativo con **Mutagen** (portada, metadatos y letras sincronizadas en el átomo `©lyr` en M4A o ID3 en MP3)
- Pool HTTP persistente con keep-alive, frame nativo del sistema operativo y sin ventanas CMD durante las descargas

> Desktop funciona sin el servicio FastAPI legado. Solo necesita Internet para consultar los servicios externos de música, audio, anime y letras.

### 📱 Android — Descargas locales

- Descargas procesadas directamente en el dispositivo mediante **`yt-dlp` nativo embebido** con actualización automática y manual
- Transferencia **zero-base64 por archivo temporal** y pools de ejecución aislados para descargas, búsquedas y playlists
- Actualizaciones desde las releases oficiales del proyecto (`MHL-Music-Android.json`), sin compartir el APK manualmente
- Verificación de versión, SHA-256, paquete (`com.mhl.music`) y certificado antes de instalar
- Canal estable tras 7 días de maduración y canal beta inmediato opcional
- Instalación asistida mediante la confirmación nativa de Android
- Apertura en **VLC, Retro Music, Music Player** y otros reproductores con detección automática y reproductor predeterminado configurable desde Ajustes
- Progreso de descarga con fases, velocidad y tiempo estimado

### 📦 Álbumes y playlists en 1 clic

- Pega enlaces de **Deezer** (álbumes y playlists), **YouTube / YouTube Music** (playlists) o **Spotify** (álbumes y playlists vía embed público, sin API keys)
- Botón **"Ver álbum completo"** directamente desde los resultados de búsqueda de canciones
- Panel de vista previa con carátula, origen, contador de pistas y botón **"Descargar todo"**
- Descarga en lote de hasta **50 pistas** con deduplicación automática, estado por canción y descarga individual con reintento persistente
- Reanudación automática de la cola si YouTube aplica una pausa temporal (`HTTP 403`)

### 🎌 Modo Anime por temporadas (opcional)

- **Desactivado por defecto**: solo se activa manualmente desde Ajustes y nunca altera la búsqueda musical normal
- Al seleccionar una serie, descubre automáticamente todas sus temporadas en orden cronológico (`T1`, `T2`, ..., atravesando películas y OVAs puente)
- Extrae los openings y endings oficiales de cada temporada desde **Jikan v4** con respaldo automático en **AnimeThemes**
- Hidrata cada canción con su título oficial, artista, duración y carátula de estudio para descargar la **versión completa oficial** a través del pool normal
- Permite descargar temas individuales o una **temporada completa** en un clic

### 🎤 Letras sincronizadas multicapa

- Obtención escalonada con saneamiento de metadatos desde **LRCLIB** (coincidencia exacta y búsqueda difusa), **Letras.com** y **Genius**
- Filtrado de marcas temporales sintéticas y alineación inteligente para canciones bilingües o de doble escritura
- **Original**: texto en el idioma y escritura original del artista
- **Romanización**: soporte para japonés (Kuroshiro/Kuromoji + wanakana), coreano y chino (pinyin), más opción **Solo alfabeto latino** para usar la romanización como letra principal
- **Traducción**: traducción paralela por bloques al español o inglés según configuración
- **Incrustación directa + `.lrc`**: letras sincronizadas `[mm:ss.xx]` inyectadas directamente en el átomo `©lyr` en M4A y disponibles como archivos `.lrc` / etiquetas ID3 en MP3
- Cada capa puede activarse o desactivarse individualmente

### 🔍 Búsqueda y selección inteligente

- Búsqueda rápida con caché, debounce y reutilización de peticiones en vuelo
- Protección anti-carrera para que resultados antiguos no reemplacen una búsqueda o enlace nuevo
- Picker con los **tres mejores candidatos únicos** y modo de resolución automática configurable (perfil adaptativo y política para datos móviles)
- Ranking por título, artista, álbum, canal, duración e ISRC con porcentaje y explicación visible
- Penalizaciones para covers, directos, remixes, instrumentales, versiones alteradas y filtro configurable para audios largos
- Sugerencias basadas en los géneros más descargados (60% afines y 40% variadas), colores HSL determinísticos por artista e historial editable

### ⚡ Rendimiento adaptable

- Audio, portada, metadatos y letras se procesan en paralelo
- Hasta **3 descargas simultáneas en Windows Desktop** y **2 en Android** con colas aisladas para mantener la interfaz y búsquedas fluidas
- Formato **M4A sin recodificación** por defecto para descargas más rápidas y menor uso de CPU
- Caché con TTL para resultados, portadas y colecciones, sin esperas artificiales entre descargas
- Portadas con carga diferida y animaciones reducidas en equipos modestos

### 🎨 Temas y 🌐 Español e inglés

- **13 temas visuales** configurables desde Ajustes (*Original Minimalist*, *Acid Cyberpunk*, *OLED Sapphire*, *Vaporwave Sunset*, *Matcha Zen*, *Matrix Terminal*, entre otros)
- Interfaz completa disponible en **español e inglés** con detección automática del idioma del dispositivo y selector manual

---

## 🚀 Compatibilidad

| Plataforma | Tecnología | Estado |
|---|---|---|
| Windows 10/11 x64 | React + pywebview | ✅ Compatible |
| Android 7.0+ (API 24) | React + Capacitor 8 | ✅ Compatible |
| Web / PWA | Código legado | ❌ Fuera de alcance |

### ⚠️ Web / PWA

La edición Web/PWA está abandonada y no forma parte de las releases. Las plataformas soportadas son Windows Desktop y Android.

**Windows y Android procesan las descargas localmente y no dependen del backend Web legado.**

---

## 📦 Instalación

### 💻 Windows Desktop

**Portable (recomendada):**

1. Abre la [última release estable](../../releases/latest) (o la [sección de releases](../../releases) para probar betas)
2. Descarga el archivo `MHL-Music-Portable-{version}.zip`
3. Descomprime el ZIP en cualquier carpeta
4. Ejecuta `MHL Music.exe`

**Requisitos:** Windows 10/11 x64

### 📱 Android

1. Abre la [última release estable](../../releases/latest) (o la [sección de releases](../../releases) para probar betas)
2. Descarga el archivo `MHL-Music-{version}.apk`
3. Abre el archivo en tu dispositivo
4. Autoriza la instalación desde esa fuente si Android lo solicita

**Requisitos:** Android 7.0+ (API 24+)

---

## 🏗️ Cómo funciona

```text
Buscar canción / Pegar álbum o playlist / Elegir temporada de anime
      ↓
Catálogo y metadatos oficiales (Deezer / YouTube / Spotify Embed / AniList + Jikan)
      ↓
Selección del mejor candidato de audio en el pool
      ↓
Descarga local zero-base64 con yt-dlp + ffmpeg (en paralelo con portada y letras)
      ↓
M4A o MP3 con portada, metadatos nativos y letras sincronizadas multicapa
```

### Arquitectura

| Capa | Tecnología |
|---|---|
| Interfaz compartida | React 18 + Vite + TypeScript |
| Estado | Zustand 5 |
| Windows | pywebview + PyInstaller + Mutagen |
| Android | Capacitor 8 + plugin nativo (`YtDlpPlugin`) |
| Actualizaciones Android | GitHub Releases + `MHL-Music-Android.json` + validación nativa |
| Legado no entregado | Web/PWA + FastAPI |
| Audio | yt-dlp (auto-actualizable) + ffmpeg (M4A nativo / MP3) |
| Catálogo y letras | Deezer, YouTube Music, Spotify Embed, AniList / Jikan / AnimeThemes, LRCLIB / Letras.com / Genius |
| Metadatos | Mutagen (Desktop) + browser-id3-writer |
| Pruebas | Vitest + pytest + retrieval invariants + contrato Android |

```text
music-mhl/
├── src/                       # Interfaz compartida (Desktop + Android)
├── android/                   # Aplicación Capacitor 8 y plugins nativos
├── mhl-desktop/               # Aplicación portable de Windows (pywebview + Python)
├── scripts/                   # Validación de contrato Android y utilidades de build
├── services/ytdlp-service/    # Backend legado, fuera del producto
└── release/                   # APK, MHL-Music-Android.json y ZIP generados localmente
```

---

## 🔧 Desarrollo

### Frontend y verificación

```bash
npm install
npm run dev
npm run test
npm run test:retrieval-invariants
npm run test:android-release-contract
npm run lint
npm run build
```

### Windows

```bash
powershell -ExecutionPolicy Bypass -File mhl-desktop/scripts/build-portable.ps1
```

### Android

```bash
npm run build
npx cap sync android
cd android
gradlew testDebugUnitTest
gradlew assembleRelease
cd ..
npm run android:prepare-release -- --apk android/app/build/outputs/apk/release/app-release.apk
```

Las reglas de trabajo y las fuentes de verdad documentales están resumidas en
[`docs/README.md`](docs/README.md).

---

## 🔒 Privacidad

- Sin registro obligatorio
- Sin publicidad, tracking ni cuentas de usuario
- Windows y Android procesan el audio localmente
- El audio no pasa por el servicio FastAPI legado
- Solo se contactan los servicios externos necesarios para buscar música, audio, anime y letras
- Código abierto y auditable

---

## 👨‍💻 Creado por

**Paul Antonio Díaz Talica** — [paul-dev.vercel.app](https://paul-dev.vercel.app)

¿Encontraste un problema? Abre un [issue](../../issues).
