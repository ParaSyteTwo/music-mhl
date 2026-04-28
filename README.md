# 🎵 MHL Music

## Tu música. Sin límites.

MHL Music es una app multi-plataforma para buscar, escuchar y descargar música — sin cuentas, sin tracking, sin anuncios.

**[🌐 Web/PWA](https://music-mhl.onrender.com)** · **[📱 Android APK](../../releases/latest)** · **[💻 Windows Desktop](../../releases/latest)**

[![Web](https://img.shields.io/badge/web-music--mhl.onrender.com-blue)](https://music-mhl.onrender.com)
[![Latest Release](https://img.shields.io/github/v/release/ParaSyteTwo/music-mhl?label=versión&color=C8F04B)](../../releases/latest)
[![License](https://img.shields.io/badge/licencia-MIT-green)](../../releases/latest)

---

## ✨ ¿Qué puede hacer?

| Plataforma | Buscar | Reproducir | Descargar | Abrir en externo |
|-----------|--------|------------|-----------|-----------------|
| 🌐 Web / PWA | ✅ Deezer | ✅ Previews | ✅ Ticket firmado | ❌ |
| 📱 Android | ✅ 3 fuentes | ✅ Nativo | ✅ yt-dlp local | ✅ VLC, etc. |
| 💻 Windows Desktop | ✅ Deezer | ✅ Nativo | ✅ yt-dlp local | ✅ |

- 🎨 **Colores únicos por artista** — sistema HSL determinístico
- 🔐 **Sin secretos** — sin tracking, sin cuentas, sin anuncios
- 📁 **Sin dependencias externas** — Desktop funciona 100% offline (Deezer API directa)

---

## 📦 Descargas

### 💻 Windows Desktop (v1.3.4)

**Opción 1 — Portable (recomendada)**
> Copia la carpeta a cualquier sitio y ejecuta. Sin instalación, sin admin, sin Python, sin Node.

1. Descarga [`MHL-Music-Portable-1.3.4.zip`](../../releases/latest)
2. Descomprime en cualquier carpeta
3. Ejecuta `MHL Music.exe`

**Opción 2 — Installer**
> Instala en `Program Files` sin necesidad de admin.

1. Descarga [`MHL Music_1.3.4_x64-setup.exe`](../../releases/latest)
2. Ejecuta el installer
3. Listo

**Requisitos:** Windows 10/11 (x64). No requiere nada más instalado.

---

### 📱 Android

1. Descarga [`MHL-Music-vX.X.X.apk`](../../releases/latest)
2. Abre el APK en el dispositivo
3. Si aparece aviso de fuentes desconocidas: Ajustes → Seguridad → Activar

> Requiere Android 7.0+ (API 24+)

---

### 🌐 Web / PWA (iPhone)

1. Abre [music-mhl.onrender.com](https://music-mhl.onrender.com) en **Safari**
2. Pulsa **Compartir → Añadir a pantalla de inicio**
3. Confirma el nombre

> ⚠️ Sin descarga nativa en iOS. Búsqueda y previews sí funcionan.

---

## 🎼 Arquitectura

### Stack por plataforma

| Capa | Web/PWA | Android | Desktop (Windows) |
|------|---------|---------|------------------|
| Frontend | React + Vite | React + Capacitor | React + Vite |
| Estado | Zustand | Zustand | Zustand |
| Motor búsqueda | Fly.io backend | 3 fuentes en paralelo | `api.deezer.com` directo |
| Descarga | Backend + ticket | yt-dlp plugin nativo | yt-dlp.exe local |
| Binarios | N/A | En APK | `win/` junto al exe |
| Hosting | Render | APK directo | NSIS installer |

### Flujo Desktop (100% offline)

```
Búsqueda  →  api.deezer.com  (sin CORS en webview nativo)
YouTube   →  yt-dlp.exe local  (bundleado en win/)
Descarga  →  yt-dlp.exe → ffmpeg.exe  (genera MP3 con ID3 tags)
```

**No usa Fly.io para nada.** Funciona aunque el backend caiga.

---

## 🗂️ Estructura del proyecto

```
music-mhl/
├── src/
│   ├── lib/
│   │   ├── api/musicApi.ts       ← detección platform + branching
│   │   ├── platform/index.ts     ← detectPlatform()
│   │   ├── tauriDownloader.ts    ← Desktop: yt-dlp.exe + ffmpeg.exe
│   │   ├── deezerDirect.ts       ← Desktop: llamadas Deezer directas
│   │   ├── ytdlpBridge.ts        ← Android: Capacitor plugin bridge
│   │   └── openFileBridge.ts     ← Android: abrir en reproductor externo
│   ├── store/musicStore.ts       ← estado global Zustand
│   └── pages/
│       ├── SearchPage.tsx        ← búsqueda + sugerencias affinity
│       ├── DownloadsPage.tsx     ← cola de descarga
│       └── SettingsPage.tsx      ← calidad, carpeta, reproductor
├── src-tauri/                    ← Tauri v2 (Rust desktop)
│   └── src/lib.rs                ← comandos Rust locales
├── resources/win/                 ← yt-dlp.exe + ffmpeg.exe (gitignored)
├── services/ytdlp-service/       ← Backend FastAPI (Fly.io) — solo Web/PWA
└── android/                       ← Capacitor Android — NO TOCAR
```

---

## 🔧 Desarrollo local

```bash
# Web + Desktop
npm install
npm run dev          # http://localhost:8080

# Desktop build
npm run tauri:build  # genera installer en src-tauri/target/release/bundle/nsis/

# Descargar binarios Desktop (si no existen)
npm run download-binaries
```

```bash
# Backend (solo para Web/PWA)
cd services/ytdlp-service
pip install -r requirements.txt
uvicorn app:app --reload --port 8080
```

---

## 🔒 Privacidad

- Sin registro obligatorio
- Sin tracking ni cuentas de usuario
- Desktop no transmite datos a ningún servidor externo
- Audio no pasa por servidores intermedios
- Código abierto y auditable

---

## 👨‍💻 Creado por

**Paul Antonio Díaz Talica**
[paul-dev.vercel.app](https://paul-dev.vercel.app)

---

¿Encontraste un bug? Abre un [issue](../../issues).
