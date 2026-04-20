# 🎵 MHL Music

## Tu música. Tu ritmo. Tu espacio.

MHL Music es una app web y Android hecha para algo muy simple y muy bonito:
**buscar, escuchar, descargar y disfrutar.**

[![Latest Release](https://img.shields.io/github/v/release/ParaSyteTwo/music-mhl?label=versión&color=C8F04B)](../../releases/latest)
[![Android](https://img.shields.io/badge/Android-7.0%2B-green)](../../releases/latest)
[![Web](https://img.shields.io/badge/web-music--mhl.onrender.com-blue)](https://music-mhl.onrender.com)

---

## ✨ ¿Qué vibe tiene MHL Music?

MHL Music no quiere ser una plataforma gigantesca que te entierre en menús, muros y upsells.
Quiere ser una app que se siente ligera, útil y musical.

- 🔎 **encuentra música rápido** — 3 fuentes en paralelo (local, Deezer, YouTube)
- ▶️ **escucha previews al momento**
- ⬇️ **descarga directo al dispositivo** — sin pasar por servidores intermedios
- 🎨 **colores únicos por artista** — identidad visual determinística
- 📁 **biblioteca local** — importa y gestiona tu propia música
- 🔐 **sin secretos expuestos** — sin tracking, sin cuentas, sin anuncios

---

## 🚀 Funcionalidades actuales

### 🌐 En la web (PWA)

- Búsqueda de canciones y metadata desde Deezer
- Reproducción de previews en la misma app
- Descarga por ticket firmado — el navegador baja directo del backend sin proxy
- Instalable como PWA desde Safari (iPhone) o Chrome (Android)
- Colores únicos por artista con sistema HSL determinístico por nombre + género

### 📱 En Android (APK nativo)

- Búsqueda simultánea en 3 fuentes: **biblioteca local (~0ms)**, **Deezer (~1-3s)**, **YouTube (~2-5s)**
- Descarga nativa con **yt-dlp** directamente en el dispositivo — sin backend involucrado
- Barra de descarga con **fases en tiempo real**, velocidad, ETA y animación shimmer
- Las canciones se guardan en **Music → MHL Music**, visibles en cualquier reproductor
- **Abrir en reproductor externo**: VLC, RetroMusic, etc. con la canción desde el principio
- **Reproductor predeterminado**: elige una app en Ajustes y se abre directamente sin chooser
- **Calidad configurable**: Alta (320kbps) / Media (192kbps) / Baja (128kbps)
- **Actualización de yt-dlp** desde Ajustes, sin reinstalar la app
- Solo WiFi: opción para no descargar con datos móviles

### 📚 Biblioteca local

- Importa archivos `.mp3`, `.m4a`, `.aac`, `.ogg`, `.flac` desde el dispositivo
- Navega por artistas, álbumes, géneros
- Reproducción integrada con gestión de cola

---

## 🎼 Arquitectura

### Flujo web

```
Usuario → búsqueda Deezer → pide ticket → backend valida + firma token → navegador descarga directo
```

### Flujo Android

```
Usuario → búsqueda en paralelo (local + Deezer + YouTube simultáneo)
        → yt-dlp descarga en el dispositivo (sin backend)
        → archivo guardado en MediaStore (Music/MHL Music)
        → accesible desde cualquier reproductor externo
```

---

## 🧭 Stack técnico

| Capa | Tecnología |
|---|---|
| Frontend | React + TypeScript + Vite |
| Estado | Zustand (persistido) |
| Backend | FastAPI + Python en **Fly.io** |
| Android | Capacitor + plugins nativos Java |
| Motor descarga | yt-dlp integrado en el APK |
| Metadata | Deezer API (vía backend proxy) |
| Hosting web | Render (static site) |

**No hay Supabase.** Todo el backend es un único servicio FastAPI en Fly.io.

---

## 🗂️ Estructura del proyecto

```
src/
  lib/
    api/musicApi.ts         ← todas las llamadas al backend
    ytdlpBridge.ts          ← bridge nativo yt-dlp (descarga, progreso, update)
    openFileBridge.ts       ← bridge nativo para abrir archivos en reproductores externos
    searchEngine.ts         ← Fuse.js para búsqueda local ~0ms
    i18n.ts                 ← detección automática de idioma
  store/musicStore.ts       ← estado global con persistencia Zustand
  pages/
    SearchPage.tsx          ← búsqueda paralela + sugerencias personalizadas
    DownloadsPage.tsx       ← cola + progreso real + abrir en externo
    SettingsPage.tsx        ← calidad, reproductor predeterminado, yt-dlp update
  types/music.ts            ← tipos TypeScript compartidos

services/ytdlp-service/
  app.py                    ← FastAPI: configuración + registro de routers
  config.py                 ← variables de entorno centralizadas
  modules/
    auth.py                 ← firmas HMAC, tokens, Bearer validation
    search.py               ← scoring de candidatos YouTube
    download.py             ← yt-dlp + FFmpeg, calidades, limpieza
    deezer.py               ← proxy Deezer API
    cookies.py              ← rotación inteligente de cookies YouTube
    cache.py                ← LRU cache con TTL
    rate_limit.py           ← rate limiting en memoria por IP
    stats.py                ← contadores y errores recientes
    telegram.py             ← notificaciones via bot
    utils.py                ← sanitize, normalize, classify
    errors.py               ← clasificación de errores yt-dlp
  routes/
    health.py               ← GET /health
    search.py               ← GET /search, POST /candidates, POST /resolve
    download.py             ← POST /download-ticket, GET /download
    deezer.py               ← POST /deezer
    internal.py             ← GET /internal/keepalive-yt
    telegram.py             ← POST /telegram/webhook

android/
  app/src/main/java/com/mhl/music/
    YtDlpPlugin.java        ← descarga nativa, progreso real, update
    OpenFilePlugin.java     ← abrir en reproductor, getAudioPlayers()
    LocalMusicPlugin.java   ← escaneo biblioteca local
    TaggingPlugin.java      ← escritura de metadatos ID3 en el archivo
    MusicSaverPlugin.java   ← guardado en MediaStore (Music/MHL Music)
```

---

## 🔧 Variables de entorno

### Frontend (`.env.local`)

```env
VITE_RAILWAY_URL=https://ytdlp-service-little-sea-7784.fly.dev
VITE_SERVICE_API_KEY=tu_api_key
```

> El nombre de la variable es `VITE_RAILWAY_URL` por razones históricas — apunta a Fly.io.

### Backend (`ytdlp-service` en Fly.io)

```env
SERVICE_API_KEY=change-me
DOWNLOAD_SIGNING_SECRET=change-me
TOKEN_TTL_SECONDS=120
RATE_LIMIT_BURST=8
RATE_LIMIT_WINDOW_SECONDS=60
RATE_LIMIT_DAILY=250
TEMP_DIR=/tmp
YOUTUBE_COOKIES_B64=...      # opcional, mejora la tasa de éxito
YOUTUBE_COOKIES_B64_2=...    # rotación entre múltiples cuentas
YOUTUBE_COOKIES_B64_3=...
TELEGRAM_BOT_TOKEN=...       # opcional, notificaciones
TELEGRAM_CHAT_ID=...
ALLOWED_ORIGINS=https://music-mhl.onrender.com
```

---

## 🧪 Desarrollo local

### Web

```bash
npm install
npm run dev
```

### Backend (ytdlp-service)

```bash
cd services/ytdlp-service
pip install -r requirements.txt
uvicorn app:app --reload --port 8080
```

- Healthcheck: `GET /health`
- `ffmpeg` se instala desde el `Dockerfile`
- No requiere volumen persistente

### Android

```bash
npm run build
npx cap sync android
# Abrir en Android Studio o:
cd android && ./gradlew assembleRelease
```

---

## 📱 Instalar en Android

Descarga el APK desde la sección [Releases](../../releases/latest) de este repositorio.

1. Descarga `MHL-Music-vX.X.X.apk`
2. Ábrelo en tu dispositivo
3. Si aparece aviso de fuentes desconocidas, acéptalo en Ajustes → Seguridad

> ⚠️ Requiere Android 7.0 o superior (API 24+)

---

## 📲 Instalar en iPhone como PWA

1. Abre [music-mhl.onrender.com](https://music-mhl.onrender.com) en Safari
2. Pulsa el botón **Compartir**
3. Selecciona **Añadir a pantalla de inicio**
4. Confirma el nombre y ábrela desde el icono

**Qué esperar en iPhone:**
- ✅ Previews, búsqueda e interfaz completa
- ✅ Instalable y navegable offline
- ⚠️ Descarga menos nativa que en Android
- ⚠️ Depende del comportamiento de Safari/WebKit

---

## 🌐 Versión web

**[music-mhl.onrender.com](https://music-mhl.onrender.com)**

---

## 🔒 Privacidad

- Sin registro obligatorio
- Sin secretos expuestos al navegador
- Sin audio pesado pasando por servidores intermedios
- Sin tracking, sin ads, sin paywalls
- Arquitectura abierta y auditable desde este repositorio

---

## 👨‍💻 Creado por

**Paul Antonio Díaz Talica**
Portfolio: [paul-dev.vercel.app](https://paul-dev.vercel.app)

---

¿Encontraste un bug? Abre un [issue](../../issues) en este repositorio.
