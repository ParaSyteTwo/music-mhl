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

### 🍎 En iPhone y iPad

- La web puede instalarse como app desde Safari
- Los previews y la navegación web funcionan como PWA
- Los archivos descargados pueden abrirse o guardarse en Archivos
- La experiencia de descarga no es tan nativa ni tan cómoda como en Android

### 🧠 En backend

- `deezer-search` queda limitado a Deezer y metadatos
- `yt-stream` actúa como broker para descargas web
- `services/ytdlp-service` resuelve la descarga real en Railway

---

## 💿 Lo que quiere ser

MHL Music va en esta dirección:

- una app que se sienta viva
- una UX más musical y menos tosca
- una experiencia rápida tanto en web como en Android
- una infraestructura clara, mantenible y sin piezas haciendo trabajos que no les tocan

### 🎯 Objetivos del producto

- buscar música sin fricción
- escuchar previews sin esperas raras
- elegir y bajar exactamente la versión que quieres
- mantener secretos fuera del frontend
- evitar pasar audio pesado por Supabase
- tener una web simple de desplegar y una app Android fuerte por separado

### 🔥 Dirección actual del proyecto

- pulir la experiencia web
- seguir reforzando Android como cliente nativo
- mejorar feedback visual, sensación y flow de la app
- reducir dependencias frágiles
- dejar el sistema en una combinación clara:

```text
frontend static site + Supabase + Railway
```

---

## 🎼 Cómo suena por dentro

### 🌐 Flujo web

1. El usuario busca una canción.
2. La app obtiene metadata desde Deezer.
3. Al pulsar descargar, el frontend pide un ticket a `yt-stream`.
4. `yt-stream` valida, limita, resuelve el video y firma un token.
5. El navegador baja el archivo directamente desde `ytdlp-service`.

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
5. La experiencia de archivos y descargas es más limitada que en Android.

---

## 🧭 Arquitectura actual

- **Frontend:** React + TypeScript + Vite
- **Estado:** Zustand
- **Backend web:** Supabase Edge Functions
- **Servicio de descargas web:** `services/ytdlp-service` desplegado en Railway
- **Android:** Capacitor + plugin nativo yt-dlp

---

## 🗂️ Estructura relevante

```text
src/
  lib/api/musicApi.ts
  lib/ytdlpBridge.ts
  store/musicStore.ts
supabase/functions/
  deezer-search/
  yt-stream/
services/
  ytdlp-service/
docs/
  context.md
```

---

## 🔧 Variables de entorno

### Frontend

```env
VITE_SUPABASE_URL=https://your_project_id.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_publishable_key
```

### Secrets de Supabase

```env
YTDLP_SERVICE_URL=https://your-railway-service.up.railway.app
YTDLP_SERVICE_KEY=change-me
YTDLP_SIGNING_SECRET=change-me
YTDLP_TOKEN_TTL_SECONDS=120
YTDLP_RATE_LIMIT_BURST=8
YTDLP_RATE_LIMIT_WINDOW_SECONDS=60
YTDLP_DAILY_LIMIT=250
```

### Env de Railway

```env
SERVICE_API_KEY=change-me
DOWNLOAD_SIGNING_SECRET=change-me
TOKEN_TTL_SECONDS=120
MAX_CONCURRENT_DOWNLOADS=3
TEMP_DIR=/tmp/ytdlp-service
PORT=8080
```

> `YTDLP_SIGNING_SECRET` y `DOWNLOAD_SIGNING_SECRET` deben tener el mismo valor.

---

## 🧪 Desarrollo local

### Web

```bash
npm install
npm run dev
```

### Supabase functions

```bash
supabase login
supabase functions deploy deezer-search
supabase functions deploy yt-stream
supabase secrets set YTDLP_SERVICE_URL=https://your-railway-service.up.railway.app
supabase secrets set YTDLP_SERVICE_KEY=change-me
supabase secrets set YTDLP_SIGNING_SECRET=change-me
supabase secrets set YTDLP_TOKEN_TTL_SECONDS=120
supabase secrets set YTDLP_RATE_LIMIT_BURST=8
supabase secrets set YTDLP_RATE_LIMIT_WINDOW_SECONDS=60
supabase secrets set YTDLP_DAILY_LIMIT=250
```

### Railway

Desplegar `services/ytdlp-service/` como servicio Docker.

- Build context: `services/ytdlp-service`
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

**Qué esperar en iPhone**

- ✅ la PWA puede abrirse como app
- ✅ los previews y la interfaz web funcionan
- ✅ iPhone puede reproducir `mp3`, `aac` y `m4a`
- ✅ un archivo descargado puede abrirse o guardarse en Archivos
- ⚠️ la gestión de descargas no es tan directa como en Android
- ⚠️ algunas acciones dependen del comportamiento de Safari
- ⚠️ no tiene el mismo nivel de integración nativa que la app Android

---

## 📱 Instalar la app en Android

Descarga el APK desde la sección [Releases](../../releases) de este repositorio.

1. En tu Android ve a **Ajustes → Seguridad → Fuentes desconocidas**
2. Actívalo si hace falta
3. Abre el APK descargado
4. Instala la app

> ⚠️ Requiere Android 8.0 o superior (API 26+)

---

## 🌐 Versión web

Disponible en: [music-mhl.onrender.com](https://music-mhl.onrender.com)

---

## 🔒 Privacidad

- sin registro obligatorio
- sin secretos en el navegador
- sin audio pesado pasando por Supabase
- arquitectura abierta y auditable desde el repo
- gratis para siempre — sin ads, sin paywalls

---

## 🤖 Contexto para agentes

- fuente principal: `docs/context.md`
- resumen corto para Claude: `.claude/CLAUDE.md`

---

¿Encontraste un bug? Abre un [issue](../../issues) en este repositorio.
