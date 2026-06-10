# 🎵 MHL Music

## Tu música. Sin límites.

**MHL Music** es una aplicación de código abierto para buscar, descargar, reproducir y organizar música en Windows y Android.

Usa **Deezer** como catálogo y **YouTube** como fuente de audio. Las descargas se procesan localmente con `yt-dlp` y `ffmpeg`, se convierten a MP3 y se completan con portada, metadatos ID3 y letras sincronizadas.

Sin cuentas obligatorias, sin anuncios y sin seguimiento.

### 📥 Descargar

[![Última versión](https://img.shields.io/github/v/release/ParaSyteTwo/music-mhl?label=versión&color=C8F04B)](../../releases/latest)
[![Android](https://img.shields.io/badge/Android-APK-3DDC84?logo=android&logoColor=white)](../../releases/latest)
[![Windows](https://img.shields.io/badge/Windows-Portable-0078D4?logo=windows&logoColor=white)](../../releases/latest)
[![Licencia](https://img.shields.io/badge/licencia-MIT-green)](LICENSE)

---

## ✨ Funciones principales

### 💻 Windows Desktop — App self-contained

- **`yt-dlp.exe` + `ffmpeg.exe` incluidos** en el portable
- Interfaz de escritorio con **pywebview** y WebView nativo de Windows
- No requiere instalar **Python**, **Node.js** ni usar permisos de administrador
- Búsqueda directa en Deezer sin depender del backend Web
- Descarga y conversión local a MP3
- Portada, metadatos ID3 y letras integrados
- Frame nativo del sistema operativo
- Sin ventanas CMD durante las descargas

> Desktop funciona sin el backend de MHL Music. Solo necesita Internet para consultar los servicios externos de música y letras.

### 📱 Android — Descargas y biblioteca local

- Descargas procesadas directamente en el dispositivo
- Biblioteca organizada por canciones, artistas, álbumes y géneros
- Apertura en **VLC, Retro Music, Music Player** y otros reproductores
- Detección automática de aplicaciones de audio instaladas
- Reproductor predeterminado configurable desde Ajustes
- Reproducción externa desde **00:00**
- Progreso de descarga con fases, velocidad y tiempo estimado

### 🎤 Letras sincronizadas multicapa

- **Original**: texto en el idioma y escritura del artista
- **Romanización**: conversión compatible con japonés, coreano y chino
- **Traducción**: español o inglés según la configuración de la aplicación
- **Archivos `.lrc`** guardados junto al MP3
- Cada capa puede activarse o desactivarse individualmente
- Compatible con reproductores que soportan letras LRC

### 🔍 Búsqueda y selección inteligente

- Búsqueda rápida con caché, debounce y reutilización de peticiones
- Protección para que resultados antiguos no reemplacen una búsqueda nueva
- Picker con los **tres mejores candidatos únicos**
- Ranking por título, artista, álbum, canal, duración e ISRC
- Porcentaje y explicación visible para cada coincidencia
- Penalizaciones para covers, directos, remixes, instrumentales y versiones alteradas
- Sugerencias basadas en los géneros más descargados: 60% afines y 40% variadas
- Colores HSL determinísticos por artista
- Historial reciente editable sin recargar la búsqueda

### ⚡ Rendimiento adaptable

- Audio, metadatos y letras comienzan en paralelo
- Máximo de dos descargas simultáneas para proteger la estabilidad
- Android adapta la búsqueda al rendimiento del dispositivo
- Windows y Android no añaden esperas artificiales entre descargas
- Portadas con carga diferida y animaciones reducidas en equipos modestos

### 🌐 Español e inglés

- Interfaz completa disponible en ambos idiomas
- Detección automática del idioma del dispositivo
- Selector manual en Ajustes
- Biblioteca, Descargas, Buscar, Ajustes, reproductor y avisos comparten el idioma elegido

---

## 🚀 Compatibilidad

| Plataforma | Tecnología | Estado |
|---|---|---|
| Windows 10/11 x64 | React + pywebview | ✅ Compatible |
| Android 7.0+ (API 24) | React + Capacitor | ✅ Compatible |
| Web / PWA | React + FastAPI remoto | ❌ Sin servicio si Fly.io está caído |

### ⚠️ Web / PWA

La edición Web/PWA depende del backend remoto desplegado en Fly.io. Cuando ese servicio no está disponible, la búsqueda y la descarga Web dejan de funcionar.

**Windows y Android no dependen de Fly.io para procesar las descargas.**

---

## 📦 Instalación

### 💻 Windows Desktop

**Portable (recomendada):**

1. Descarga [`MHL-Music-Portable-1.3.5.zip`](../../releases/latest)
2. Descomprime el ZIP en cualquier carpeta
3. Ejecuta `MHL Music.exe`

**Requisitos:** Windows 10/11 x64

### 📱 Android

1. Descarga [`MHL-Music-1.3.5.apk`](../../releases/latest)
2. Abre el archivo en tu dispositivo
3. Autoriza la instalación desde esa fuente si Android lo solicita

**Requisitos:** Android 7.0+ (API 24+)

---

## 🏗️ Cómo funciona

```text
Buscar canción
      ↓
Catálogo y metadatos de Deezer
      ↓
Selección del mejor candidato de audio
      ↓
Descarga local con yt-dlp + ffmpeg
      ↓
MP3 con portada, metadatos ID3 y letras opcionales
```

### Arquitectura

| Capa | Tecnología |
|---|---|
| Interfaz compartida | React 18 + Vite + TypeScript |
| Estado | Zustand |
| Windows | pywebview + PyInstaller |
| Android | Capacitor + puente nativo |
| Backend Web/PWA | FastAPI |
| Audio | yt-dlp + ffmpeg |
| Metadatos | browser-id3-writer |
| Pruebas | Vitest + pytest |

```text
music-mhl/
├── src/                       # Interfaz compartida
├── android/                   # Aplicación Capacitor
├── mhl-desktop/               # Aplicación portable de Windows
├── services/ytdlp-service/    # Backend exclusivo de Web/PWA
└── release/                   # APK y ZIP generados localmente
```

---

## 🔧 Desarrollo

### Frontend

```bash
npm install
npm run dev
npm run test
npm run lint
npm run build
```

### Windows

```bash
cd mhl-desktop
python -m pytest
python -m PyInstaller MHLMusic.spec --noconfirm
```

### Android

```bash
npx cap sync android
cd android
gradlew assembleRelease
```

---

## 🔒 Privacidad

- Sin registro obligatorio
- Sin publicidad, tracking ni cuentas de usuario
- Windows y Android procesan el audio localmente
- El audio no pasa por el backend Web de MHL Music
- Solo se contactan los servicios externos necesarios para buscar música, audio y letras
- Código abierto y auditable

---

## 👨‍💻 Creado por

**Paul Antonio Díaz Talica** — [paul-dev.vercel.app](https://paul-dev.vercel.app)

¿Encontraste un problema? Abre un [issue](../../issues).
