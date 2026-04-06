# 🎵 MHL Music

## Tu música. Tu ritmo. Tu espacio.

MHL Music es una app web y Android hecha para algo muy simple y muy bonito:
**abrir, buscar, escuchar, descargar y disfrutar.**

---

## ✨ ¿Qué vibe tiene MHL Music?

MHL Music no quiere ser una plataforma gigantesca que te entierre en menús, muros, upsells y pantallas llenas de ruido.
Quiere ser una app que se siente ligera, útil y musical.

La filosofía del proyecto es esta:

- 🔎 **encuentra música rápido**
- ▶️ **escucha previews al momento**
- ⬇️ **elige exactamente qué versión bajar**
- 🌐 **mantiene la web ligera**
- 📱 **deja Android hacer lo suyo con potencia nativa**
- 🔐 **no expone secretos al navegador**

---

## 🚀 Lo que ya hace

### 🌐 En la web

- Búsqueda y metadata desde Deezer
- Reproducción de previews desde la propia app
- Sistema de descarga por ticket firmado
- Frontend servido como static site

### 📱 En Android

- Búsqueda en YouTube con múltiples queries en paralelo
- Selector de candidatos antes de descargar — tú eliges la versión exacta
- Descarga nativa con yt-dlp directamente en el dispositivo
- Flujo completamente separado del backend web

### 🍎 En iPhone (PWA)

- La web puede instalarse como app desde Safari
- Los previews y la navegación web funcionan como PWA
- Los archivos descargados pueden abrirse o guardarse en Archivos
- La experiencia de descarga no es tan nativa como en Android

---

## 🎼 Cómo suena por dentro

### 🌐 Flujo web

1. El usuario busca una canción.
2. La app obtiene metadata desde Deezer (vía Railway `/deezer`).
3. Al pulsar descargar, el frontend pide un ticket a Railway `/download-ticket`.
4. Railway valida, limita, resuelve el video y firma un token.
5. El navegador baja el archivo directamente desde Railway `/download`.

### 📱 Flujo Android

1. El usuario busca una canción.
2. La app lanza varias búsquedas en YouTube en paralelo.
3. Aparece un picker con los 3 mejores candidatos puntuados por relevancia y duración.
4. El usuario elige la versión exacta que quiere.
5. La descarga se resuelve en el dispositivo con yt-dlp nativo.

### 🍎 Flujo en iPhone PWA

1. El usuario abre la web en Safari.
2. Puede añadirla a pantalla de inicio como app web.
3. La app sigue funcionando sobre Safari/WebKit.
4. Los audios descargados pueden abrirse o guardarse en Archivos.

---

## 🧭 Arquitectura actual

| Capa | Tecnología |
|---|---|
| Frontend | React + TypeScript + Vite |
| Estado | Zustand |
| Backend | `services/ytdlp-service` en Railway (FastAPI + Python) |
| Android | Capacitor + plugin nativo yt-dlp |
| Hosting web | Render (static site) |

**No hay Supabase.** Todo el backend vive en Railway.

---

## 🗂️ Estructura relevante

```text
src/
  lib/api/musicApi.ts       ← todas las llamadas al backend
  lib/ytdlpBridge.ts        ← bridge nativo Android
  store/musicStore.ts
services/
  ytdlp-service/
    app.py                  ← FastAPI: /deezer, /candidates, /resolve,
    Dockerfile                /download-ticket, /download, /search, /health
    requirements.txt
android/                    ← app Capacitor + plugin yt-dlp nativo
```

---

## 🔧 Variables de entorno

### Frontend (`.env.local`)

```env
VITE_RAILWAY_URL=https://your-ytdlp-service.up.railway.app
VITE_SERVICE_API_KEY=your_service_api_key
```

### Railway (`ytdlp-service`)

```env
SERVICE_API_KEY=change-me
DOWNLOAD_SIGNING_SECRET=change-me
TOKEN_TTL_SECONDS=120
MAX_CONCURRENT_DOWNLOADS=3
RATE_LIMIT_BURST=8
RATE_LIMIT_WINDOW_SECONDS=60
RATE_LIMIT_DAILY=250
PORT=8080
```

---

## 🧪 Desarrollo local

### Web

```bash
npm install
npm run dev
```

### ytdlp-service (Railway)

```bash
cd services/ytdlp-service
pip install -r requirements.txt
uvicorn app:app --reload --port 8080
```

- Healthcheck: `GET /health`
- No requiere volumen persistente
- `ffmpeg` se instala desde el `Dockerfile`

---

## 📲 Instalar la web como app en iPhone

1. Abre MHL Music en Safari
2. Pulsa el botón de **Compartir**
3. Baja hasta **Añadir a pantalla de inicio**
4. Confirma el nombre de la app
5. Ábrela desde el icono como si fuera una app normal

**Qué esperar en iPhone:**

- ✅ PWA instalable, previews e interfaz funcionan
- ✅ iPhone puede reproducir `mp3`, `aac` y `m4a`
- ⚠️ gestión de descargas más limitada que en Android
- ⚠️ depende del comportamiento de Safari/WebKit

---

## 📱 Instalar la app en Android

Descarga el APK desde la sección [Releases](../../releases) de este repositorio.

1. En tu Android ve a **Ajustes → Seguridad → Fuentes desconocidas**
2. Actívalo si hace falta
3. Abre el APK descargado e instala

> ⚠️ Requiere Android 7.0 o superior (API 24+)

---

## 🌐 Versión web

Disponible en: [music-mhl.onrender.com](https://music-mhl.onrender.com)

---

## 🔒 Privacidad

- sin registro obligatorio
- sin secretos en el navegador
- sin audio pesado pasando por servidores intermedios
- arquitectura abierta y auditable desde el repo
- gratis para siempre — sin ads, sin paywalls

---

¿Encontraste un bug? Abre un [issue](../../issues) en este repositorio.
