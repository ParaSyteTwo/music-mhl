# 🎵 MHL Music

## Tu musica. Tu ritmo. Tu espacio.

MHL Music es una app web y Android hecha para algo muy simple y muy bonito:  
**abrir, buscar, escuchar, descargar y disfrutar.**

---

## ✨ ¿Que vibe tiene MHL Music?

MHL Music no quiere ser una plataforma gigantesca que te entierre en menus, muros, upsells y pantallas llenas de ruido.  
Quiere ser una app que se siente ligera, util y musical.

La filosofia del proyecto es esta:

- 🔎 **encuentra musica rapido**
- ▶️ **escucha previews al momento**
- ⬇️ **descarga desde la cancion elegida**
- 🌐 **mantiene la web ligera**
- 📱 **deja Android hacer lo suyo con potencia nativa**
- 🔐 **no expone secretos al navegador**

---

## 🚀 Lo que ya hace

### 🌐 En la web

- 🔍 busqueda y metadata desde Deezer
- 🎧 reproduccion de previews desde la propia app
- 🎟️ sistema de descarga por ticket firmado
- 🪶 frontend servido como static site
- ⚡ flujo web limpio:

```text
navegador -> yt-stream -> ticket firmado -> ytdlp-service
```

### 📱 En Android

- ⚙️ descarga nativa con `yt-dlp`
- 🎵 flujo separado del backend web
- 🧱 arquitectura pensada para que la web no rompa la app movil

### 🧠 En backend

- `deezer-search` queda limitado a Deezer y metadatos
- `yt-stream` actua como broker para descargas web
- `services/ytdlp-service` resuelve la descarga real en Railway

---

## 💿 Lo que quiere ser

MHL Music va en esta direccion:

- una app que se sienta viva
- una UX mas musical y menos tosca
- una experiencia rapida tanto en web como en Android
- una infraestructura clara, mantenible y sin piezas haciendo trabajos que no les tocan

### 🎯 Objetivos del producto

- buscar musica sin friccion
- escuchar previews sin esperas raras
- bajar audio desde la cancion elegida
- mantener secretos fuera del frontend
- evitar pasar audio pesado por Supabase
- tener una web simple de desplegar y una app Android fuerte por separado

### 🔥 Direccion actual del proyecto

- pulir la experiencia web
- seguir reforzando Android como cliente nativo
- mejorar feedback visual, sensacion y flow de la app
- reducir dependencias fragiles
- dejar el sistema en una combinacion clara:

```text
frontend static site + Supabase + Railway
```

---

## 🎼 Como suena por dentro

### 🌐 Flujo web

1. El usuario busca una cancion.
2. La app obtiene metadata desde Deezer.
3. Al pulsar descargar, el frontend pide un ticket a `yt-stream`.
4. `yt-stream` valida, limita, resuelve el video y firma un token.
5. El navegador baja el archivo directamente desde `ytdlp-service`.

### 📱 Flujo Android

1. El usuario busca una cancion.
2. La app usa el plugin nativo `yt-dlp`.
3. La descarga se resuelve en el dispositivo.

---

## 🧭 Arquitectura actual

- **Frontend:** React + TypeScript + Vite
- **Estado:** Zustand
- **Backend web:** Supabase Edge Functions
- **Servicio de descargas web:** `services/ytdlp-service` desplegado en Railway
- **Android:** Capacitor + plugin nativo `yt-dlp`

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

`YTDLP_SIGNING_SECRET` y `DOWNLOAD_SIGNING_SECRET` deben tener el mismo valor.

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
- No requiere volumen persistente para v1
- `ffmpeg` se instala desde el `Dockerfile`

---

## ✅ Validacion esperada

- la web obtiene ticket desde `yt-stream`
- la descarga final viene del servicio Railway
- los tokens caducados fallan
- Android sigue descargando por el plugin nativo

---

## 🔒 Privacidad

- sin registro obligatorio
- sin secretos en el navegador
- sin audio pesado pasando por Supabase
- arquitectura abierta y auditable desde el repo

---

## 🤖 Contexto para agentes

- fuente principal: `docs/context.md`
- resumen corto para Claude: `claude.md`
