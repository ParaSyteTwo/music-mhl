# MHL Music v1.3.0

⚡ MHL Music v1.3.0 — APK más ligero, sin comprometer compatibilidad

Actualización enfocada en reducir el tamaño del APK manteniendo compatibilidad con el 99%+ de dispositivos Android reales.

---

## ✨ Novedades principales

### 📦 APK reducido de ~229MB a ~130MB

Se ha optimizado el empaquetamiento del APK eliminando soporte para arquitecturas innecesarias (x86/x86_64):

- **Antes:** APK universal con soporte para ARM64, ARMv7, x86, x86_64
- **Ahora:** APK optimizado con solo ARM64 (arm64-v8a) y ARMv7 (armeabi-v7a)
- **Cobertura:** 99%+ de dispositivos Android reales

**Por qué:** Los emuladores de Android Studio usan x86/x86_64, pero los dispositivos reales (smartphones, tablets) usan solo arquitecturas ARM. Esta reducción no afecta a ningún dispositivo de usuario final.

---

## 🚀 Compatibilidad

| Característica | Estado |
|---|---|
| **Versión Android mínima** | 7.0 (API 24) |
| **Dispositivos cubiertos** | 99%+ (ARM64 + ARMv7) |
| **Descarga y reproducción** | Sin cambios |
| **Búsqueda en YouTube** | Sin cambios |
| **Actualización yt-dlp** | Sin cambios |

---

## 📱 Instalación APK (Android)

1. Descarga el APK de esta versión
2. Abre el archivo en tu dispositivo
3. Instala la app

> ⚠️ Puede que necesites habilitar "Fuentes desconocidas"

**Requisitos:** Android 7.0 o superior (API 24+)

---

## 🧪 Qué comprobar tras instalar

- Descargar una canción
- Verificar que aparece en: **Documents/MHL Music**
- Confirmar que el archivo es reproducible

---

## 🔒 Privacidad

- Sin tracking
- Sin cuentas
- Sin recopilación de datos
- Código abierto
- Sin anuncios

---

## ⚙️ Cambios técnicos

- Filtro de ABIs en build.gradle: solo `arm64-v8a` y `armeabi-v7a`
- Tamaño de APK optimizado para distribución
- Sin cambios en funcionalidad o dependencias
