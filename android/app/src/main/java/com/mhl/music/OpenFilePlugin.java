package com.mhl.music;

import android.content.ContentUris;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.content.res.AssetFileDescriptor;
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

import org.jaudiotagger.audio.AudioFile;
import org.jaudiotagger.audio.AudioFileIO;
import org.jaudiotagger.tag.FieldKey;
import org.jaudiotagger.tag.Tag;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "OpenFile")
public class OpenFilePlugin extends Plugin {

    private static final String TAG = "OpenFilePlugin";
    private static final long MAX_LOCAL_AUDIO_BYTES = 128L * 1024L * 1024L;
    private final ExecutorService ioExecutor = Executors.newSingleThreadExecutor();

    /** Devuelve todas las apps instaladas que pueden reproducir audio. */
    @PluginMethod
    public void getAudioPlayers(PluginCall call) {
        PackageManager pm = getContext().getPackageManager();
        JSArray players = new JSArray();
        java.util.Set<String> seen = new java.util.HashSet<>();

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

    private boolean isAllowedContentUri(Uri uri) {
        if (uri == null || !"content".equalsIgnoreCase(uri.getScheme())) return false;
        String auth = uri.getAuthority();
        if (auth == null) return false;
        if (MediaStore.AUTHORITY.equals(auth)) return true;
        String ownAuthority = getContext().getPackageName() + ".fileprovider";
        if (ownAuthority.equals(auth)) {
            String path = uri.getPath();
            return path != null && (path.startsWith("/legacy_mhl_music/") || path.startsWith("/mhl_videos/"));
        }
        return false;
    }

    private Uri upgradeLegacyFileUri(Uri uri) {
        if (uri == null || !"file".equalsIgnoreCase(uri.getScheme()) || uri.getPath() == null) {
            return null;
        }
        try {
            File f = new File(uri.getPath()).getCanonicalFile();
            if (!f.exists() || !f.isFile()) return null;
            File docDir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS), "MHL Music").getCanonicalFile();
            File vidDir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MOVIES), "MHL Music").getCanonicalFile();
            String fPath = f.getPath();
            if (fPath.startsWith(docDir.getPath() + File.separator) || fPath.startsWith(vidDir.getPath() + File.separator)) {
                return FileProvider.getUriForFile(
                    getContext(),
                    getContext().getPackageName() + ".fileprovider",
                    f
                );
            }
        } catch (Exception e) {
            Log.w(TAG, "Failed upgrading legacy file URI: " + e.getMessage());
        }
        return null;
    }

    private Uri resolveTargetUri(String fileName, String mediaUriStr) {
        Uri targetUri = null;
        if (mediaUriStr != null && !mediaUriStr.isEmpty()) {
            try {
                Uri parsed = Uri.parse(mediaUriStr);
                if ("file".equalsIgnoreCase(parsed.getScheme())) {
                    parsed = upgradeLegacyFileUri(parsed);
                }
                if (isAllowedContentUri(parsed) && isUriReadable(parsed)) {
                    targetUri = parsed;
                }
            } catch (Exception e) {
                Log.w(TAG, "Could not parse stored URI: " + e.getMessage());
            }
        }

        if (targetUri == null && fileName != null && !fileName.isEmpty()) {
            Uri byName = queryMediaStoreByName(fileName);
            if (isAllowedContentUri(byName) && isUriReadable(byName)) {
                targetUri = byName;
            }
        }

        if (targetUri == null && fileName != null && !fileName.isEmpty()) {
            String safeName = new File(fileName).getName();
            File[] legacyRoots = new File[] {
                new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS), "MHL Music"),
                new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MOVIES), "MHL Music"),
            };
            for (File baseDir : legacyRoots) {
                File legacyFile = new File(baseDir, safeName);
                if (legacyFile.exists() && legacyFile.isFile()) {
                    try {
                        Uri fp = FileProvider.getUriForFile(
                            getContext(),
                            getContext().getPackageName() + ".fileprovider",
                            legacyFile
                        );
                        if (isUriReadable(fp)) {
                            targetUri = fp;
                            break;
                        }
                    } catch (Exception e) {
                        Log.w(TAG, "FileProvider failed: " + e.getMessage());
                    }
                }
            }
        }

        return targetUri;
    }

    private boolean isUriReadable(Uri uri) {
        if (uri == null) return false;
        try (AssetFileDescriptor afd = getContext().getContentResolver().openAssetFileDescriptor(uri, "r")) {
            return afd != null && afd.getLength() != 0;
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * Copia de forma segura el audio local a caché privada para reproducirlo vía HTTP local de Capacitor
     * sin cargar Base64 en el heap Dalvik y extrae letras embebidas.
     */
    @PluginMethod
    public void readLocalAudio(PluginCall call) {
        String fileName = call.getString("fileName");
        String mediaUriStr = call.getString("mediaUri");

        ioExecutor.execute(() -> {
            File tempAudioFile = null;
            try {
                Uri targetUri = resolveTargetUri(fileName, mediaUriStr);
                if (targetUri == null) {
                    bridge.getActivity().runOnUiThread(() -> call.reject("Local audio file not found"));
                    return;
                }

                String mime = fileName != null ? resolveMimeType(fileName) : "audio/mp4";
                String ext = ".m4a";
                if (fileName != null) {
                    String lower = fileName.toLowerCase(Locale.ROOT);
                    if (lower.endsWith(".mp3")) ext = ".mp3";
                    else if (lower.endsWith(".aac")) ext = ".aac";
                    else if (lower.endsWith(".ogg")) ext = ".ogg";
                    else if (lower.endsWith(".opus")) ext = ".opus";
                    else if (lower.endsWith(".flac")) ext = ".flac";
                    else if (lower.endsWith(".wav")) ext = ".wav";
                }

                File playDir = new File(getContext().getCacheDir(), "mhl_local_play");
                if (!playDir.exists()) {
                    playDir.mkdirs();
                } else {
                    File[] oldFiles = playDir.listFiles();
                    if (oldFiles != null) {
                        for (File old : oldFiles) {
                            old.delete();
                        }
                    }
                }

                tempAudioFile = File.createTempFile("mhl_play_", ext, playDir);
                try (InputStream is = getContext().getContentResolver().openInputStream(targetUri);
                     FileOutputStream fos = new FileOutputStream(tempAudioFile)) {
                    if (is == null) {
                        tempAudioFile.delete();
                        bridge.getActivity().runOnUiThread(() -> call.reject("Cannot open local audio stream"));
                        return;
                    }
                    byte[] buffer = new byte[16384];
                    int read;
                    long total = 0L;
                    while ((read = is.read(buffer)) != -1) {
                        total += read;
                        if (total > MAX_LOCAL_AUDIO_BYTES) {
                            tempAudioFile.delete();
                            bridge.getActivity().runOnUiThread(() -> call.reject("Audio file exceeds 128 MB safe limit"));
                            return;
                        }
                        fos.write(buffer, 0, read);
                    }
                }

                String extractedLyrics = "";
                try {
                    AudioFile audioFile = AudioFileIO.read(tempAudioFile);
                    Tag tag = audioFile != null ? audioFile.getTag() : null;
                    if (tag != null) {
                        String lyr = tag.getFirst(FieldKey.LYRICS);
                        if (lyr != null) {
                            extractedLyrics = lyr;
                        }
                    }
                } catch (Throwable tagEx) {
                    Log.w(TAG, "Failed extracting embedded lyrics: " + tagEx.getMessage());
                }

                JSObject result = new JSObject();
                result.put("success", true);
                result.put("mime", mime);
                result.put("filePath", tempAudioFile.getAbsolutePath());
                result.put("lyrics", extractedLyrics);
                bridge.getActivity().runOnUiThread(() -> call.resolve(result));
            } catch (Throwable e) {
                if (tempAudioFile != null && tempAudioFile.exists()) {
                    tempAudioFile.delete();
                }
                Log.w(TAG, "readLocalAudio failed: " + e.getMessage());
                String msg = e.getMessage() != null ? e.getMessage() : "readLocalAudio failed";
                bridge.getActivity().runOnUiThread(() -> call.reject(msg));
            }
        });
    }

    /**
     * Comprueba en MediaStore qué descargas faltan en el dispositivo para poder re-encolarlas.
     */
    @PluginMethod
    public void checkLocalFiles(PluginCall call) {
        JSArray items = call.getArray("items");
        ioExecutor.execute(() -> {
            JSArray missingIds = new JSArray();
            if (items != null) {
                for (int i = 0; i < items.length(); i++) {
                    JSONObject obj = items.optJSONObject(i);
                    if (obj == null) continue;
                    String id = obj.optString("id", "");
                    if (id.isEmpty()) continue;
                    String fileName = obj.optString("fileName", "");
                    String mediaUri = obj.optString("mediaUri", "");

                    Uri uri = null;
                    if (!mediaUri.isEmpty()) {
                        try {
                            Uri parsed = Uri.parse(mediaUri);
                            if ("file".equalsIgnoreCase(parsed.getScheme())) {
                                parsed = upgradeLegacyFileUri(parsed);
                            }
                            if (isAllowedContentUri(parsed) && isUriReadable(parsed)) {
                                uri = parsed;
                            }
                        } catch (Exception ignored) {}
                    }
                    if (uri == null && !fileName.isEmpty()) {
                        Uri byName = queryMediaStoreByName(fileName);
                        if (isUriReadable(byName)) {
                            uri = byName;
                        }
                    }
                    if (uri == null) {
                        missingIds.put(id);
                    }
                }
            }

            JSObject result = new JSObject();
            result.put("success", true);
            result.put("missingIds", missingIds);
            bridge.getActivity().runOnUiThread(() -> call.resolve(result));
        });
    }

    /**
     * Abre un archivo de audio o vídeo en un reproductor externo.
     */
    @PluginMethod
    public void openDownloadedFile(PluginCall call) {
        String fileName        = call.getString("fileName");
        String mediaUriStr     = call.getString("mediaUri");
        String preferredPkg    = call.getString("preferredPackage");

        Uri targetUri = resolveTargetUri(fileName, mediaUriStr);
        String mime   = fileName != null ? resolveMimeType(fileName) : "audio/mpeg";

        if (targetUri == null) {
            Log.e(TAG, "File not found for: " + fileName);
            call.reject("Archivo no encontrado. Prueba a descargarlo de nuevo.");
            return;
        }

        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(targetUri, mime);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        intent.putExtra("position", 0);
        intent.putExtra("start_from", 0);

        try {
            if (preferredPkg != null && !preferredPkg.isEmpty()) {
                intent.setPackage(preferredPkg);
                getContext().startActivity(intent);
            } else {
                getContext().startActivity(Intent.createChooser(intent, "Abrir con…"));
            }
            call.resolve();
        } catch (Exception e) {
            Log.w(TAG, "Preferred player failed, falling back to chooser: " + e.getMessage());
            try {
                intent.setPackage(null);
                getContext().startActivity(Intent.createChooser(intent, "Abrir con…"));
                call.resolve();
            } catch (Exception e2) {
                call.reject("No hay ninguna app disponible para abrir el archivo.");
            }
        }
    }

    /** Busca un archivo en MediaStore por nombre de display. Devuelve content URI o null. */
    private Uri queryMediaStoreByName(String displayName) {
        String lower = displayName.toLowerCase(Locale.ROOT);
        boolean isVideo = lower.endsWith(".mp4") || lower.endsWith(".webm") || lower.endsWith(".mkv");
        Uri collectionUri = isVideo
            ? MediaStore.Video.Media.EXTERNAL_CONTENT_URI
            : MediaStore.Audio.Media.EXTERNAL_CONTENT_URI;
        String idCol = isVideo ? MediaStore.Video.Media._ID : MediaStore.Audio.Media._ID;
        String nameCol = isVideo ? MediaStore.Video.Media.DISPLAY_NAME : MediaStore.Audio.Media.DISPLAY_NAME;
        String sortCol = isVideo ? MediaStore.Video.Media.DATE_ADDED : MediaStore.Audio.Media.DATE_ADDED;

        String[] projection    = { idCol };
        String selection       = nameCol + " = ?";
        String[] selectionArgs = { displayName };

        try (Cursor cursor = getContext().getContentResolver().query(
                collectionUri,
                projection, selection, selectionArgs,
                sortCol + " DESC"
        )) {
            if (cursor != null && cursor.moveToFirst()) {
                long id = cursor.getLong(cursor.getColumnIndexOrThrow(idCol));
                return ContentUris.withAppendedId(collectionUri, id);
            }
        } catch (Exception e) {
            Log.w(TAG, "MediaStore query failed: " + e.getMessage());
        }
        return null;
    }

    private String resolveMimeType(String fileName) {
        String lower = fileName.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".mp4"))  return "video/mp4";
        if (lower.endsWith(".webm")) return "video/webm";
        if (lower.endsWith(".mkv"))  return "video/x-matroska";
        if (lower.endsWith(".mp3"))  return "audio/mpeg";
        if (lower.endsWith(".m4a"))  return "audio/mp4";
        if (lower.endsWith(".aac"))  return "audio/aac";
        if (lower.endsWith(".ogg"))  return "audio/ogg";
        if (lower.endsWith(".flac")) return "audio/flac";
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
