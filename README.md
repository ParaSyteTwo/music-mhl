# 🎵 MHL Music

## Tu música. Sin límites.

MHL Music es una aplicación de código abierto para buscar, reproducir, descargar y organizar música. Comparte una interfaz React entre Android y Windows y está pensada para funcionar sin cuentas, anuncios ni seguimiento.

**[📱 Descargar para Android](../../releases/latest)** · **[💻 Descargar para Windows](../../releases/latest)**

[![Latest Release](https://img.shields.io/github/v/release/ParaSyteTwo/music-mhl?label=versión&color=C8F04B)](../../releases/latest)
[![License](https://img.shields.io/badge/licencia-MIT-green)](LICENSE)

---

## ✨ Funciones

- Búsqueda musical y reproducción de previews.
- Descarga de audio con `yt-dlp` y conversión mediante `ffmpeg`.
- Metadatos ID3 automáticos para los archivos descargados.
- Letras sincronizadas con texto original, romanización y traducción.
- Biblioteca local organizada por álbumes, artistas y géneros.
- Historial de búsqueda y sugerencias personalizadas.
- Apertura de canciones con reproductores externos compatibles.
- Interfaz disponible en español e inglés.
- Detección automática del idioma del dispositivo y selección manual.

---

## 🚀 Plataformas

| Plataforma | Tecnología | Distribución | Estado |
|---|---|---|---|
| Windows 10/11 x64 | React + pywebview | ZIP portable | ✅ Recomendada |
| Android 7.0+ | React + Capacitor | APK | ✅ Recomendada |
| Web / PWA | React + backend externo | Navegador | ⚠️ Disponibilidad limitada |

### Windows Desktop

La versión de escritorio es autónoma. Incluye Python embebido, pywebview, `yt-dlp.exe` y `ffmpeg.exe`; no necesita instalación, Node, Python ni permisos de administrador.

### Android

La aplicación Android usa Capacitor y un puente nativo para descargar audio, acceder a la biblioteca y abrir canciones con reproductores instalados.

### Web / PWA

La versión web depende de servicios externos. Algunas funciones pueden no estar disponibles si el backend está fuera de servicio.

---

## 📦 Instalación

### Windows

1. Descarga el archivo `MHL-Music-Portable-X.X.X.zip` desde [Releases](../../releases/latest).
2. Descomprime el ZIP.
3. Ejecuta `MHL Music.exe`.

### Android

1. Descarga `MHL-Music-X.X.X.apk` desde [Releases](../../releases/latest).
2. Abre el archivo en el teléfono.
3. Autoriza la instalación desde esa fuente si Android lo solicita.

---

## 🎤 Letras

MHL Music puede combinar tres capas:

- **Original:** texto escrito en el idioma de la canción.
- **Romanización:** conversión de escrituras como japonés, coreano o chino a caracteres latinos.
- **Traducción:** español o inglés según el idioma efectivo de la aplicación.

Las capas pueden activarse individualmente. Cuando el idioma original coincide con el idioma elegido, la aplicación evita traducciones innecesarias. También puede guardar las letras sincronizadas en archivos `.lrc`.

---

## 🏗️ Arquitectura

| Capa | Tecnología |
|---|---|
| Interfaz | React 18 + Vite + TypeScript |
| Estado | Zustand |
| Android | Capacitor |
| Windows | pywebview + PyInstaller |
| Backend Web | FastAPI |
| Pruebas | Vitest + pytest |

```text
music-mhl/
├── src/                         # Frontend compartido
│   ├── components/             # Componentes de interfaz
│   ├── lib/                    # APIs, plataforma, idioma y letras
│   ├── pages/                  # Búsqueda, biblioteca, descargas y ajustes
│   └── store/                  # Estado global Zustand
├── android/                    # Proyecto Capacitor Android
├── mhl-desktop/                # Aplicación Windows con pywebview
├── services/ytdlp-service/     # Backend para Web/PWA
└── release/                    # Artefactos compilados locales
```

### Flujo de Windows

```text
Búsqueda → Deezer API
Audio    → yt-dlp.exe
Proceso  → ffmpeg.exe
Salida   → MP3 con metadatos y letras LRC
```

La versión Desktop no llama al backend Web/Fly.io.

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
python -m pytest tests
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

- Sin registro obligatorio.
- Sin cuentas de usuario.
- Sin anuncios ni tracking.
- Desktop y Android procesan el audio localmente.
- Código abierto y auditable.

---

## 👨‍💻 Autor

**Paul Antonio Díaz Talica**

[paul-dev.vercel.app](https://paul-dev.vercel.app)

¿Encontraste un problema? Abre un [issue](../../issues).
