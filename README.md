Aquí tienes el README completo listo para copiar y pegar:

---

```markdown
# 🎵 MHL Music

> Tu música. Sin límites. Sin suscripciones.

MHL Music es un reproductor de música web y Android que te permite 
buscar, escuchar y descargar música en alta calidad de forma gratuita.
Sin paywalls. Sin anuncios. Sin restricciones artificiales.

![MHL Music](https://music-mhl.vercel.app/og-image.png)

## ✨ Características

### Reproducción
- 🔍 Búsqueda instantánea via Deezer
- ▶️ Reproducción de preview (30s) sin registro
- 🎵 Cola de reproducción con shuffle y repeat
- ⏭️ Skip prev/next con lógica inteligente
- 🔊 Control de volumen y barra de progreso

### Biblioteca personal
- 📚 Biblioteca guardada localmente sin cuenta
- 🎵 Playlists personalizadas ilimitadas
- 📥 Descarga en MP3 con metadatos ID3 automáticos
  (título, artista, álbum, carátula embebida)

### Letras
- 🎤 Letras sincronizadas en tiempo real (modo karaoke)
- 🌍 Traducción automática al idioma de tu sistema
- 📝 Vista de letra completa sin sincronización

### Identificación de canciones
- 🎯 Sube un archivo y detecta qué canción es
- 🏷️ Actualiza los metadatos automáticamente
- 💾 Guarda el archivo actualizado en tu carpeta de música

### Música local
- 📂 Importa tu colección de música local
- 🔄 Lee metadatos ID3 existentes
- 🎵 Reproduce archivos locales junto a los de streaming

## 📱 Descargas

| Plataforma | Enlace |
|------------|--------|
| 🌐 Web | [music-mhl.vercel.app](https://music-mhl.vercel.app) |
| 🤖 Android APK | [Última versión](../../releases/latest) |

> **Android:** Requiere Android 8.0 o superior.
> Activa "Fuentes desconocidas" antes de instalar.

## 🛠️ Stack técnico

- **Frontend:** React + TypeScript + Vite
- **Estado:** Zustand con persistencia
- **Estilos:** Tailwind CSS + shadcn/ui
- **Backend:** Supabase Edge Functions (Deno)
- **Android:** Capacitor
- **Deploy web:** Vercel

## 🔌 APIs utilizadas

| API | Uso | Plan |
|-----|-----|------|
| Deezer | Búsqueda y metadatos | Gratuito |
| YouTube (RapidAPI) | Stream de audio completo | Gratuito |
| Shazam (RapidAPI) | Identificación de canciones | Gratuito |
| LRCLIB | Letras sincronizadas | Gratuito |
| LibreTranslate | Traducción de letras | Gratuito |
| DeepL | Traducción premium (opcional) | Gratuito |

## 🚀 Desarrollo local

### Requisitos
- Node.js 18+
- Bun o npm
- Cuenta en Supabase (gratuita)
- Cuenta en RapidAPI (gratuita)

### Instalación

```bash
# Clonar el repositorio
git clone https://github.com/TU_USUARIO/music-mhl.git
cd music-mhl

# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env
# Edita .env con tus keys (ver sección de configuración)

# Iniciar servidor de desarrollo
npm run dev
```

### Configuración del .env

```env
# Supabase
VITE_SUPABASE_URL=https://tuproyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu_anon_key

# RapidAPI (una sola key para todas las APIs)
VITE_RAPIDAPI_KEY=tu_rapidapi_key

# Traducción (opcional - usa LibreTranslate si no se configura)
VITE_DEEPL_API_KEY=tu_deepl_key
```

### APIs de RapidAPI necesarias
Suscríbete en plan gratuito a estas APIs en rapidapi.com:
- `YouTube-Music-API` by Alex
- `YT-API` by ytjar  
- `Shazam Core` by Tipsters CO
- `MusicAPI` by FreeYourMusic

### Edge Functions de Supabase
```bash
# Instalar Supabase CLI
npm install -g supabase

# Login
supabase login

# Desplegar funciones
supabase functions deploy deezer-search
supabase functions deploy yt-stream

# Añadir secrets
supabase secrets set RAPIDAPI_KEY=tu_key
```

### Build para Android
```bash
# Build de la web
npm run build

# Sincronizar con Capacitor
npx cap sync android

# Abrir en Android Studio
npx cap open android

# Desde Android Studio: Build → Generate Signed APK
```

## 📁 Estructura del proyecto

```
music-mhl/
├── src/
│   ├── components/
│   │   ├── layout/          # AppLayout, Sidebar, BottomPlayer
│   │   ├── music/           # TrackCard, TrackRow, LyricsPanel
│   │   └── ui/              # Componentes shadcn/ui
│   ├── pages/               # HomePage, SearchPage, LibraryPage...
│   ├── store/               # musicStore.ts (Zustand)
│   ├── lib/
│   │   ├── api/             # musicApi.ts (Deezer, YouTube, Letras)
│   │   ├── audioEngine.ts   # Motor de audio con Media Session API
│   │   └── id3Writer.ts     # Escritura de metadatos MP3
│   └── types/               # Tipos TypeScript
├── supabase/
│   └── functions/
│       ├── deezer-search/   # Proxy para API de Deezer
│       └── yt-stream/       # Stream de audio YouTube
├── android/                 # Proyecto Android (Capacitor)
└── public/                  # Assets estáticos
```

## 🗺️ Roadmap

### v0.2.0 (próximamente)
- [ ] Reproducción completa via YouTube
- [ ] Audio en background al bloquear pantalla Android
- [ ] Notificaciones nativas de descarga
- [ ] Páginas de artista y álbum
- [ ] Charts por país en tiempo real

### v0.3.0
- [ ] Modo offline completo
- [ ] Sincronización entre dispositivos
- [ ] Ecualizador de audio
- [ ] Crossfade entre canciones
- [ ] Sleep timer

### Futuro
- [ ] iOS (via Capacitor)
- [ ] Desktop (via Tauri)
- [ ] Importar playlists de Spotify

## 🤝 Contribuir

Las contribuciones son bienvenidas.

1. Fork el repositorio
2. Crea una rama: `git checkout -b feature/nueva-feature`
3. Commit: `git commit -m 'Add: nueva feature'`
4. Push: `git push origin feature/nueva-feature`
5. Abre un Pull Request

## ⚠️ Aviso legal

MHL Music es un proyecto personal de código abierto con fines 
educativos. Utiliza APIs públicas de terceros respetando sus 
términos de servicio. No almacena ni redistribuye contenido 
protegido por derechos de autor.

## 📄 Licencia

MIT License — úsalo, modifícalo y distribúyelo libremente.

---

Hecho con ♥ por [Paul](https://github.com/ParaSyteTwo/)
```
