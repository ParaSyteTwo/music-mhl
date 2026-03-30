RELEASE 1.2.2 — MHL Music
=========================

Fecha: 2026-03-30
Versión: 1.2.2

Resumen
------
Pequeña actualización para mejorar la gestión de descargas en Android:
- Forzar intento de actualización del binario `yt-dlp` en el plugin Android al inicializar.
- Simplificación de la estrategia de almacenamiento: ahora el plugin guarda las descargas públicamente en Downloads/MHL Music mediante MediaStore (se eliminó el flujo de Storage Access Framework/picker en esta release).
- Ajustes en la UI de Ajustes: se eliminó el selector de carpeta (Android) y se muestra una nota informativa indicando la carpeta de destino.
- Añadidos logs de diagnóstico durante desarrollo; algunos deberían limpiarse antes del siguiente release (ver limpieza abajo).

Cambios clave (archivos editados)
-------------------------------
- android/app/src/main/java/com/mhl/music/YtDlpPlugin.java — inicialización + actualización de yt-dlp; copia a MediaStore; manejo básico de flujo de descarga.
- android/app/build.gradle — actualización de dependencias y tareas de integración de yt-dlp (se eliminó documentfile dependency).
- src/pages/SettingsPage.tsx — se eliminó UI del picker/SAF y se sustituyó por mensaje informativo.

Instrucciones para generar la APK release
----------------------------------------
(desde la raíz del proyecto `music-mhl`)

1) Preparar el entorno (Windows / PowerShell):

```powershell
# Ejecutar el script que integra el binario yt-dlp en assets (si no está presente)
.\scripts\download-and-integrate-yt-dlp.ps1

# Construir release
cd android
.\gradlew assembleRelease
```

2) APK resultante:
- `android/app/build/outputs/apk/release/app-release.apk`

3) Instalar en un dispositivo conectado:

```powershell
& "D:\PROGRAMAS\scrcpy-win64-v3.3.4\adb.exe" install -r "android/app/build/outputs/apk/release/app-release.apk"
```

Verificación (QA)
------------------
1. Abrir la app en el dispositivo.
2. Realizar una descarga de audio (desde una entrada válida).
3. Comprobar que el archivo aparece en la carpeta del dispositivo: `Descargas/MHL Music` (o Downloads/MHL Music).
4. Si es necesario, inspeccionar logs con `adb logcat` para buscar etiquetas: `YTDLP_MEDIA`, `YTDLP_COPY`, `YtDlpPlugin`.

```powershell
& "D:\PROGRAMAS\scrcpy-win64-v3.3.4\adb.exe" logcat | Select-String "YTDLP_"
```

Notas importantes y recomendaciones antes de publicar
---------------------------------------------------
- Limpiar logs de diagnóstico / mensajes `Log.d`/`Log.i` que no sean necesarios en producción.
- Confirmar comportamiento al intentar guardar un archivo con nombre duplicado (actualmente los nombres se generan con timestamp para evitar colisiones; revisar si se desea otra estrategia).
- Verificar que la licencia/atribuciones de `youtubedl-android` y `ffmpeg` cumplen requisitos del proyecto antes de distribuir.
- Actualizar `versionCode` en `android/app/build.gradle` si corresponde y confirmar `versionName` = `1.2.2`.
- Generar checksum SHA256 del APK para adjuntarlo al release:

```powershell
Get-FileHash android\app\build\outputs\apk\release\app-release.apk -Algorithm SHA256
```

Publicación (Git + GitHub)
-------------------------
1. Commit de cambios con mensaje sugerido:

```
fix(android): yt-dlp update on init, MediaStore-only downloads, remove SAF picker

- Force yt-dlp update at plugin init
- Save downloads to Downloads/MHL Music via MediaStore
- Remove SAF/picker UI and code
```

2. Tag y push:

```bash
git add -A
git commit -m "fix(android): yt-dlp update on init, MediaStore-only downloads, remove SAF picker"
git tag -a v1.2.2 -m "Release v1.2.2"
git push origin main --tags
```

3. Crear release en GitHub y adjuntar `app-release.apk` + checksum + notas (usar este archivo `RELEASE_1.2.2.md` como base para el texto del release).

Checklist rápido antes de publicar
---------------------------------
- [ ] Revisar y eliminar logs de desarrollo.
- [ ] Probar descarga en 2-3 dispositivos Android con distintas versiones.
- [ ] Verificar que `yt-dlp` integrado se actualiza correctamente o documentar cómo actualizar manualmente.
- [ ] Generar checksum y adjuntarlo en la release.
- [ ] Actualizar Play Store / entrega según el proceso del proyecto (si aplica).

Si quieres, puedo:
- Limpiar los logs de diagnóstico y preparar un commit listo para push.
- Generar el SHA256 del APK aquí (si me confirmas mantener el APK actual en la ruta de build).
- Preparar la descripción del release en formato listo para pegar en GitHub.

---
Archivo creado: `RELEASE_1.2.2.md` en la raíz del proyecto.
