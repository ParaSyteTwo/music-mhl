## ⚡ MHL Music v1.2.0 — Búsqueda de candidatos más rápida y precisa

Actualización centrada en reducir el tiempo de espera al elegir qué versión descargar, y mejorar la calidad de los resultados que aparecen en el picker.

---

### ✨ Novedades principales

#### ⚡ Búsqueda en paralelo — hasta 3× más rápida

Antes, las queries a YouTube se lanzaban una por una.
Ahora todas corren al mismo tiempo.

- **Antes:** ~10–15 segundos
- **Ahora:** ~4–6 segundos

Sin cambios en la interfaz, solo el picker abre mucho antes.

#### 🔍 Más queries, mejores candidatos

El picker ahora busca con múltiples variantes simultáneas:

- `título artista` (base)
- `título artista official audio`
- Para canciones de anime: `título full` y `título álbum`

Más variedad de búsqueda → candidatos más representativos en el top 3.

#### 👆 Precarga al tocar el botón

En Android, la búsqueda empieza en el instante en que el dedo toca el botón de descarga, antes de soltarlo.

Si la respuesta llega antes de que abras el picker, este aparece con los datos ya listos — sin espera visible.

#### 🎯 Top 3 candidatos bien puntuados

El picker muestra los 3 mejores resultados puntuados por:
- coincidencia de título y artista
- diferencia de duración
- tipo de contenido (official audio, cover, live, karaoke, etc.)

3 opciones bien elegidas son suficientes. Menos ruido, decisión más fácil.

#### 🛡️ Timeout de seguridad

Si yt-dlp se cuelga o tarda demasiado, la búsqueda aborta a los 10 segundos en vez de esperar indefinidamente.

---

### 🧹 Ajustes técnicos

- `ytsearch3` → `ytsearch5` en el plugin nativo (más candidatos por query al mismo coste de red)
- Resultados deduplicados por `videoId` al combinar múltiples queries
- Versión del proyecto actualizada a `1.2.0`

---

### 📱 Instalación APK (Android)

Descarga el archivo `MHL Music v1.2.0.apk` de abajo.

1. En tu Android ve a **Ajustes → Seguridad → Fuentes desconocidas**
2. Actívalo si hace falta
3. Abre el APK descargado
4. Instala la app
5. ¡Listo!

> ⚠️ Requiere Android 8.0 o superior (API 26+)

---

### 🌐 Versión Web

Disponible en: `music-mhl.vercel.app`

> ⚠️ En web, la experiencia de descarga depende del flujo web + backend activo
> ⚠️ En Android, la descarga sigue siendo la experiencia más completa

---

### 🐛 Bugs corregidos

| Problema | Estado |
|---|---|
| El picker tardaba 10–15s en mostrar candidatos | ✅ Corregido |
| Solo se lanzaba 1 query sin variantes | ✅ Corregido |
| Si yt-dlp se colgaba, la app esperaba sin límite | ✅ Corregido |

---

### 🔒 Privacidad

- Sin tracking ni telemetría
- Sin registro ni autenticación
- Sin almacenamiento de datos personales
- Open source — código completo en GitHub
- Gratis para siempre — sin ads, sin paywalls

---

¿Encontraste un bug? Abre un issue en este repositorio.
