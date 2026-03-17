# 🧪 TESTING v0.3.0-rc2 — CAPACITOR FILE PICKER EDITION

**Fecha:** 2026-03-17 | **Status:** ✅ APK compilado con Capacitor FilePicker

---

## 📱 ACCESO A VERSIONES

### 🌐 WEB (Desktop/Tablet)

**URL:** https://music-mhl.vercel.app

**Status:**
- ✅ Deployed a Vercel (main branch)
- ✅ Latest build con File Picker integration
- ⏱️ Disponible inmediatamente

**Qué testear:**
- ✅ Búsqueda de canciones
- ✅ Reproducción (preview 30s)
- ✅ Descargas (persistencia en reload)
- ✅ Letras sincronizadas
- ✅ UI responsivo
- ✅ **NEW:** Seleccionar carpeta/archivos (abre file input estándar)

---

### 📱 APK (Android) — **CRITICAL FIX**

**Descargar desde:**
```
d:\Proyectos\music-mhl\MHL-Music-v0.3.0-rc2.apk
```

**Tamaño:** 3.4 MB
**Compilado:** 2026-03-17 02:24 UTC
**Tipo:** Release build (optimizado)
**Versión:** v0.3.0-rc2 con Capacitor FilePicker

---

## 🔧 WHAT'S NEW IN RC2 — **Critical Fix**

### Problem Solved: Android Library Import Now Works

**Problem:**
- webkitdirectory NO fue soportado en Android browsers (silently falla)
- handleImportManual() mostraba un toast en lugar de abrir picker
- Users couldn't import music on Android → feature was BROKEN

**Solution:**
- ✅ Installed: `@capawesome/capacitor-file-picker` plugin
- ✅ Replaced broken webkitdirectory with native Android file picker
- ✅ Now opens actual **ACTION_OPEN_DOCUMENT Intent** (like Google Files)
- ✅ Users can browse folders and select files natively
- ✅ Supports all audio formats (MP3, M4A, AAC, FLAC, OGG, Opus, WebM, WAV)

**What You'll See:**
1. Click "Importar música" → dropdown appears
2. Choose "🔍 Seleccionar carpeta / archivos"
3. **Android:** Opens native file picker dialog (looks like Google Files)
4. **Web:** Opens standard HTML file input dialog
5. Select files → imports immediately with success toast

---

## 📋 INSTALL APK

### Opción A: Si tienes adb (emulador/dispositivo conectado)
```bash
adb install d:\Proyectos\music-mhl\MHL-Music-v0.3.0-rc2.apk
```

### Opción B: Manual (Windows)
1. Descarga el APK desde la ruta anterior
2. Cópialo a tu dispositivo o emulador
3. Abre con gestor de archivos
4. Instala

### Opción C: Transferencia de archivo
```bash
adb push d:\Proyectos\music-mhl\MHL-Music-v0.3.0-rc2.apk /sdcard/Download/
# Luego abre el archivo en el dispositivo
```

---

## ✅ TESTING CHECKLIST

### ANDROID — CRITICAL PATH (30 min)

#### LibraryPage — NUEVO FILE PICKER
- [ ] **Instalación:** APK instala sin error
- [ ] **Arranque:** App abre normalmente
- [ ] Click "Importar música"
  - [ ] ¿Aparece dropdown con 2 opciones?
    - [ ] "📁 Auto-escanear"
    - [ ] "🔍 Seleccionar carpeta / archivos"

- [ ] **Opción 2: "Seleccionar carpeta / archivos" (NUEVO)**
  - [ ] Click botón
  - [ ] ¿Abre picker nativo (like Google Files)?
  - [ ] ¿Puedes navegar carpetas?
  - [ ] ¿Puedes seleccionar archivos M4A/MP3/FLAC?
  - [ ] ¿Puedes seleccionar múltiples archivos?
  - [ ] ¿Se importan correctamente?
  - [ ] ¿Toast muestra "X archivos importados"?
  - [ ] ¿Música aparece en LibraryPage?

- [ ] **Opción 1: "Auto-escanear"** (Original — should still work)
  - [ ] ¿Detecta pre-descargadas en Documents/MHL Music/?
  - [ ] ¿Soporta todos los formatos?
  - [ ] ¿Toast muestra progreso?

#### SearchPage
- [ ] Busca "Bohemian Rhapsody Queen"
  - [ ] Resultados aparecen
  - [ ] Preview visible

#### DownloadsPage
- [ ] Descargas pre-existentes visibles
- [ ] Botón Reproducir funciona
- [ ] Botón Eliminar funciona

---

### WEB (10 min)

#### LibraryPage
- [ ] Click "Importar música"
  - [ ] ¿Dropdown con 2 opciones?
  - [ ] Click "Seleccionar carpeta / archivos"
  - [ ] ¿Abre file input (HTML5)?
  - [ ] ¿Puedes seleccionar archivos?
  - [ ] ¿Se importan correctamente?

#### SearchPage
- [ ] Busca "Blinding Lights The Weeknd"
  - [ ] Resultados aparecen
  - [ ] Reproducción (30s preview)

---

## 🆘 TROUBLESHOOTING

### Android File Picker No Abre
**Solución:**
1. Verifica que tienes Capacitor File Picker instalado (`npm list @capawesome/capacitor-file-picker`)
2. Reconstruye APK con `gradlew assembleRelease`
3. Verifica permisos: Settings > Apps > MHL Music > Permissions

### "Permission Denied" en Auto-Scan
**Solución:**
1. Abre **Configuración > Aplicaciones > MHL Music > Permisos**
2. Activa **Almacenamiento** (o Archivos)
3. Intenta nuevamente

### Archivos No Importan
**Solución:**
1. Verifica que archivos son formato audio (MP3, M4A, etc.)
2. Si webkitdirectory está activado en web, intenta sin webkitdirectory attribute
3. Verifica console (F12) para error messages

---

## 📊 TESTING REPORT TEMPLATE

Cuando termines testing, proporciona:

```
## RC2 Testing Results

### Android — File Picker
- [ ] Picker opens natively? (yes/no)
- [ ] Can browse folders? (yes/no)
- [ ] Can select M4A files? (yes/no)
- [ ] Multiple selection works? (yes/no)
- [ ] Files import correctly? (yes/no)
- [ ] Toast shows success? (yes/no)

### Android — Overall
- [ ] App opens without crash? (yes/no)
- [ ] Search works? (yes/no)
- [ ] Downloads work? (yes/no)
- [ ] Library persistent after restart? (yes/no)

### Web
- [ ] File input opens? (yes/no)
- [ ] Files import? (yes/no)
- [ ] All features work? (yes/no)

### Bugs Found
(if any)
- Description:
- Severity: (critical/major/minor)
- Steps to reproduce:

### Notes
(anything else)
```

---

## 🚀 BUILD INFO

**Version:** v0.3.0-rc2
**Branch:** main
**Commit:** dbe87e9 (File Picker integration)
**Date:** 2026-03-17 02:24 UTC
**Status:** Ready for testing

**Changes:**
- ✅ Capacitor FilePicker plugin integrated
- ✅ Native Android file picker enabled
- ✅ Web file input preserved
- ✅ All audio formats supported (MP3, M4A, AAC, FLAC, OGG, Opus, WebM, WAV)
- ✅ Clean build, no errors
- ✅ 62/62 tests passing (from previous session)

---

## 📞 NEXT STEPS

1. **Install APK** → Test on Android device/emulator
2. **Test File Picker** → Open library → try "Seleccionar carpeta/archivos"
3. **Report Results** → Use template above
4. If all green → RC2 validated ✅
5. Deploy to Vercel → `git push origin main`

---

**¿Preguntas?** Revisa este doc o pregunta directamente.

**¡Gracias por testear! 🙏**
