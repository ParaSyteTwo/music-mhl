# 🧪 TESTING v0.3.0-rc1 — ACCESO PARA VALIDACIÓN

**Fecha:** 2026-03-17 | **Status:** ✅ Deployado + APK compilado con fix

---

## 📱 ACCESO A VERSIONES

### 🌐 WEB (Desktop/Tablet)

**URL:** https://music-mhl.vercel.app

**Status:**
- ✅ Deployed a Vercel (main branch)
- ✅ Latest fix aplicado (library permissions)
- ⏱️ Disponible inmediatamente

**Qué testear:**
- ✅ Búsqueda de canciones
- ✅ Reproducción (preview 30s)
- ✅ Descargas (persistencia en reload)
- ✅ Letras sincronizadas
- ✅ UI responsivo

---

### 📱 APK (Android)

**Descargar desde:**
```
d:\Proyectos\music-mhl\MHL-Music-v0.3.0-rc3.apk
```

**Tamaño:** 3.4 MB
**Compilado:** 2026-03-17 01:54 UTC
**Tipo:** Release build (optimizado)

**Soporta ahora:**
- MP3, M4A, AAC, FLAC, OGG, WebM, WAV, Opus
- **Dual import:** Auto-scan OR manual selection

**Instalación:**

**Opción A: Si tienes adb (emulador/dispositivo conectado)**
```bash
adb install d:\Proyectos\music-mhl\MHL-Music-v0.3.0-rc1-UPDATED.apk
```

**Opción B: Manual (Windows)**
1. Descarga el APK desde la ruta anterior
2. Cópialo a tu dispositivo o emulador
3. Abre con gestor de archivos
4. Instala

**Opción C: Transferencia de archivo**
```bash
adb push d:\Proyectos\music-mhl\MHL-Music-v0.3.0-rc1-UPDATED.apk /sdcard/Download/
# Luego abre el archivo en el dispositivo
```

---

## 🔧 FIXES APLICADOS EN ESTA SESIÓN

### Fix #1: Android Library Permissions
**Problema:** Biblioteca deshabilitada en Android (solo descarga funcionaba)

**Causa:** Falta de permisos de runtime + carpeta no existía

**Solución:**
- Solicita permisos con `Filesystem.requestPermissions()`
- Mensajes de error claros: guía para Settings, crear carpeta, etc.
- Better exception handling

### Fix #2: Audio Format Support
**Problema:** Solo aceptaba MP3, pero usuario tiene M4A

**Solución:** Soporte multi-formato + MIME type detection
- ✅ MP3, M4A, AAC, FLAC, OGG, Opus, WebM, WAV

### Fix #3: Dual Import Options (NUEVO - LO QUE PEDISTE)
**Problema:** Auto-scan de Documents/MHL Music/ no detectaba archivos existentes

**Causa:** Carpeta fija hardcodeada, user quería flexibilidad

**Solución:**
```typescript
// LibraryPage.tsx - dos opciones en dropdown

// Opción 1: Auto-escanear
handleImportAuto()
  → Filesystem.readdir('MHL Music', Directory.Documents)
  → Lee archivos pre-existentes

// Opción 2: Manual (seleccionar)
handleImportManual()
  → webkitdirectory file picker (Android)
  → Permite elegir carpeta/archivos manuales
  → Guía user si webkitdirectory no funciona
```

**UI:**
- Click "Importar música" → muestra 2 opciones
- "📁 Auto-escanear" → Documents/MHL Music/
- "🔍 Seleccionar carpeta/archivos" → file picker o manual

**Cambios:**
- ✅ Dual import modes con dropdown
- ✅ webkitdirectory support en file input
- ✅ Mensajes contextuales para cada opción
- ✅ Better UX: user controla dónde buscar

---

## ✅ CHECKLIST DE TESTING

### WEB (15 min)
- [ ] Abre https://music-mhl.vercel.app
- [ ] **Búsqueda:** "Blinding Lights The Weeknd"
  - [ ] Resultados aparecen
  - [ ] Preview muestra cover, artist, duration
- [ ] **Reproducción:** Click play
  - [ ] Audio suena (30s preview)
  - [ ] Progresión visual en progress bar
  - [ ] Controles funcionan (pause, next, prev)
- [ ] **Letras:** Click lyrics icon
  - [ ] Letras sincronizadas en tiempo real
  - [ ] Traducción disponible (si existe)
- [ ] **Descarga:** Click download
  - [ ] Status: "Downloading..." → "✓ Descargado"
  - [ ] Toast de confirmación
- [ ] **Persistencia:** F5 reload
  - [ ] Descargas aún visibles en DownloadsPage
  - [ ] Metadata intacto (cover, artist, etc)
- [ ] **DownloadsPage:** Tabs "Completadas" / "Fallidas"
  - [ ] Descarga en sección correcta
  - [ ] Botón Reproducir funciona
  - [ ] Botón Eliminar funciona

### ANDROID (45 min)
- [ ] **Instalación:** APK instala sin error
- [ ] **Arranque:** App abre normalmente
- [ ] **SearchPage:** Busca "Bohemian Rhapsody Queen"
  - [ ] Resultados aparecen
  - [ ] Preview visible
- [ ] **Reproducción:** Click play
  - [ ] Audio suena 30s
  - [ ] Controles funcionan
- [ ] **Descarga M4A/AAC - NUEVO:** Click download (si M4A disponible)
  - [ ] Status progresa (soporta M4A ahora)
  - [ ] Toast al completar
  - [ ] Archivo en: `Documents/MHL Music/`
  - [ ] Puedes reproducir desde DownloadsPage
- [ ] **LibraryPage - CRÍTICO:** Click "Importar música"
  - [ ] ¿Aparece dropdown con 2 opciones?
    - [ ] "📁 Auto-escanear"
    - [ ] "🔍 Seleccionar carpeta/archivos"
  - [ ] **Opción 1: Auto-escanear**
    - [ ] ¿Solicita permiso?
    - [ ] ¿Detecta pre-descargadas en Documents/MHL Music/?
    - [ ] ¿Soporta M4A/AAC/FLAC/OGG?
  - [ ] **Opción 2: Seleccionar (NUEVA)**
    - [ ] Click "Seleccionar carpeta/archivos"
    - [ ] ¿Abre file picker?
    - [ ] ¿Puedes seleccionar archivos M4A directamente?
    - [ ] ¿Se importan correctamente?
  - [ ] Si pre-descargadas fallan con auto-scan:
    - [ ] Usa "Seleccionar carpeta/archivos"
    - [ ] ¿Funciona mejor así?
- [ ] **App Restart - CRÍTICO:** Cierra app completamente
  - [ ] Swipe close desde recent apps (no home button)
  - [ ] Reabre app
  - [ ] Ve a DownloadsPage
    - [ ] ¿Descargas pre-existentes persisten? (metadata visible)
    - [ ] ¿Puedes reproducir?
  - [ ] Ve a LibraryPage
    - [ ] ¿Música importada aún visible?
    - [ ] ¿Todos los formatos aún funcionan?

---

## 📋 REPORTE A ENTREGAR

Cuando termines testing, proporciona:

**1. Tabla de Resultados**
```
| Funcionalidad | Web | Android | Status |
|---------------|-----|---------|--------|
| Búsqueda | ✅ | ? | |
| Reproducción | ✅ | ? | |
| Descargas | ✅ | ? | |
| Biblioteca | ✅ | ? | |
| Persistencia | ✅ | ? | |
```

**2. Bugs Encontrados** (si alguno)
- Descripción clara
- Pasos para reproducir
- Severidad (critical/major/minor)

**3. Observaciones Positivas**
- Qué funcionó bien

**4. Screenshots** (opcional pero útil)
- DownloadsPage completa
- LibraryPage con música
- Error messages si hay

---

## 🆘 SI ENCUENTRAS PROBLEMAS

### Error: "Permiso denegado"
**Solución:**
1. Abre **Configuración > Aplicaciones > MHL Music**
2. Ve a **Permisos**
3. Activa **Almacenamiento** (o Archivos)
4. Vuelve a la app e intenta nuevamente

### Error: "Carpeta no encontrada"
**Solución:**
1. Abre gestor de archivos
2. Ve a **Documents/** (raíz de Documentos)
3. Crea carpeta llamada **MHL Music**
4. Copia archivos MP3 en esa carpeta
5. En la app: LibraryPage > click "Importar música"

### Descarga "Colgada" (30%)
**Solución:**
1. Verifica tu conexión a internet
2. Intenta descargar otra canción
3. Si persiste, click "Reintentar"

### App se abre pero está vacía
**Solución:**
1. Es normal en primera ejecución
2. Usa SearchPage para buscar música
3. Descarga o importa locales

---

## 📞 INFO ADICIONAL

**Versión:** v0.3.0-rc1
**Commit:** 52a0de2 (library permissions fix)
**Rama:** main
**Build date:** 2026-03-17

**Cambios en esta versión:**
- ✅ 3 bugs críticos solucionados (v0.3.0-rc1)
- ✅ 62/62 tests pasando
- ✅ Android library permissions fix (NEW)
- ✅ Mejor error handling en descargas
- ✅ MediaSession sync para lock screen

**Próxima fase:**
- YouTube full-stream (no solo 30s preview)
- Android background audio
- Media notifications

---

**¿Preguntas durante testing?** Revisa este doc o pregunta directamente.

**¡Gracias por testear! 🙏**
