package com.mhl.music;

import android.content.ContentUris;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.database.Cursor;
import android.net.Uri;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Log;
import android.webkit.MimeTypeMap;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.util.List;

@CapacitorPlugin(name = "OpenFile")
public class OpenFilePlugin extends Plugin {

    private static final String TAG = "OpenFilePlugin";

    /** Devuelve todas las apps instaladas que pueden reproducir audio. */
    @PluginMethod
    public void getAudioPlayers(PluginCall call) {
        PackageManager pm = getContext().getPackageManager();
        JSArray players = new JSArray();
        java.util.Set<String> seen = new java.util.HashSet<>();

        // Probe 1: content:// + audio/* (Retro Music, mayoría de players)
        Intent probe1 = new Intent(Intent.ACTION_VIEW);
        probe1.setDataAndType(Uri.parse("content://com.mhl.music/dummy.mp3"), "audio/*");
        for (ResolveInfo info : pm.queryIntentActivities(probe1, PackageManager.MATCH_ALL)) {
            if (seen.add(info.activityInfo.packageName)) {
                try {
                    JSObject player = new JSObject();
                    player.put("packageName", info.activityInfo.packageName);
                    player.put("label", info.loadLabel(pm).toString());
                    players.put(player);
                } catch (Exception ignored) {}
            }
        }

        // Probe 2: file:// + audio/* (algunos players que prefieren file://)
        Intent probe2 = new Intent(Intent.ACTION_VIEW);
        probe2.setDataAndType(Uri.parse("file://com.mhl.music/dummy.mp3"), "audio/*");
        for (ResolveInfo info : pm.queryIntentActivities(probe2, PackageManager.MATCH_ALL)) {
            if (seen.add(info.activityInfo.packageName)) {
                try {
                    JSObject player = new JSObject();
                    player.put("packageName", info.activityInfo.packageName);
                    player.put("label", info.loadLabel(pm).toString());
                    players.put(player);
                } catch (Exception ignored) {}
            }
        }

        JSObject result = new JSObject();
        result.put("players", players);
        call.resolve(result);
    }

    /**
     * Abre un archivo de audio en un reproductor externo.
     *
     * Parámetros JS:
     *   fileName         — nombre del archivo (para mime type y fallback búsqueda)
     *   mediaUri         — content:// URI de MediaStore (prioritario)
     *   preferredPackage — package name de la app preferida; si se omite muestra chooser
     */
    @PluginMethod
    public void openDownloadedFile(PluginCall call) {
        String fileName        = call.getString("fileName");
        String mediaUriStr     = call.getString("mediaUri");
        String preferredPkg    = call.getString("preferredPackage");

        Uri targetUri = null;
        String mime   = fileName != null ? resolveMimeType(fileName) : "audio/mpeg";

        // ── 1. URI de MediaStore guardada al descargar ────────────────────────────
        if (mediaUriStr != null && !mediaUriStr.isEmpty()) {
            try {
                targetUri = Uri.parse(mediaUriStr);
                Log.i(TAG, "Using stored MediaStore URI: " + targetUri);
            } catch (Exception e) {
                Log.w(TAG, "Could not parse stored URI: " + e.getMessage());
            }
        }

        // ── 2. Buscar en MediaStore por nombre de display ─────────────────────────
        if (targetUri == null && fileName != null && !fileName.isEmpty()) {
            targetUri = queryMediaStoreByName(fileName);
            if (targetUri != null) Log.i(TAG, "Found via MediaStore query: " + targetUri);
        }

        // ── 3. Fallback: Documents/MHL Music (descargas antiguas pre-MediaStore) ──
        if (targetUri == null && fileName != null && !fileName.isEmpty()) {
            File docDir    = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS);
            File legacyFile = new File(new File(docDir, "MHL Music"), fileName);
            if (legacyFile.exists()) {
                try {
                    targetUri = FileProvider.getUriForFile(
                        getContext(),
                        getContext().getPackageName() + ".fileprovider",
                        legacyFile
                    );
                    Log.i(TAG, "Found via legacy Documents path: " + targetUri);
                } catch (Exception e) {
                    Log.w(TAG, "FileProvider failed: " + e.getMessage());
                }
            }
        }

        if (targetUri == null) {
            Log.e(TAG, "File not found for: " + fileName);
            call.reject("Archivo no encontrado. Prueba a descargarlo de nuevo.");
            return;
        }

        // ── Construir Intent ──────────────────────────────────────────────────────
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(targetUri, mime);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);

        // Forzar reproducción desde el inicio para apps que recuerdan posición (VLC, etc.)
        intent.putExtra("position", 0);
        intent.putExtra("start_from", 0);

        try {
            if (preferredPkg != null && !preferredPkg.isEmpty()) {
                // Ir directamente a la app preferida sin chooser
                intent.setPackage(preferredPkg);
                getContext().startActivity(intent);
            } else {
                // Mostrar chooser la primera vez
                getContext().startActivity(Intent.createChooser(intent, "Abrir con…"));
            }
            call.resolve();
        } catch (Exception e) {
            // Si la app preferida no puede abrir (desinstalada, etc.), volver al chooser
            Log.w(TAG, "Preferred player failed, falling back to chooser: " + e.getMessage());
            try {
                intent.setPackage(null); // quitar restricción de paquete
                getContext().startActivity(Intent.createChooser(intent, "Abrir con…"));
                call.resolve();
            } catch (Exception e2) {
                call.reject("No hay ninguna app disponible para abrir el archivo.");
            }
        }
    }

    /** Busca un audio en MediaStore por nombre de display. Devuelve content URI o null. */
    private Uri queryMediaStoreByName(String displayName) {
        String[] projection    = { MediaStore.Audio.Media._ID };
        String selection       = MediaStore.Audio.Media.DISPLAY_NAME + " = ?";
        String[] selectionArgs = { displayName };

        try (Cursor cursor = getContext().getContentResolver().query(
                MediaStore.Audio.Media.EXTERNAL_CONTENT_URI,
                projection, selection, selectionArgs,
                MediaStore.Audio.Media.DATE_ADDED + " DESC"
        )) {
            if (cursor != null && cursor.moveToFirst()) {
                long id = cursor.getLong(
                    cursor.getColumnIndexOrThrow(MediaStore.Audio.Media._ID)
                );
                return ContentUris.withAppendedId(
                    MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, id
                );
            }
        } catch (Exception e) {
            Log.w(TAG, "MediaStore query failed: " + e.getMessage());
        }
        return null;
    }

    private String resolveMimeType(String fileName) {
        if (fileName.endsWith(".mp3"))  return "audio/mpeg";
        if (fileName.endsWith(".m4a"))  return "audio/mp4";
        if (fileName.endsWith(".aac"))  return "audio/aac";
        if (fileName.endsWith(".ogg"))  return "audio/ogg";
        if (fileName.endsWith(".flac")) return "audio/flac";
        String ext = MimeTypeMap.getFileExtensionFromUrl(
            Uri.encode(fileName, "/:@!$&'()*+,;= ")
        );
        if (ext != null && !ext.isEmpty()) {
            String mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext.toLowerCase());
            if (mime != null) return mime;
        }
        return "audio/*";
    }
}
