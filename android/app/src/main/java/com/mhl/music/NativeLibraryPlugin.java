package com.mhl.music;

import android.media.MediaMetadataRetriever;
import android.os.Environment;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.util.Locale;

@CapacitorPlugin(name = "NativeLibrary")
public class NativeLibraryPlugin extends Plugin {
    @PluginMethod
    public void scanDocumentsLibrary(PluginCall call) {
        File documentsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS);
        File libraryDir = new File(documentsDir, "MHL Music");

        JSObject result = new JSObject();
        JSArray tracks = new JSArray();

        if (!libraryDir.exists() || !libraryDir.isDirectory()) {
            result.put("tracks", tracks);
            call.resolve(result);
            return;
        }

        File[] files = libraryDir.listFiles();
        if (files == null || files.length == 0) {
            result.put("tracks", tracks);
            call.resolve(result);
            return;
        }

        for (File file : files) {
            if (!file.isFile() || !isSupportedAudio(file.getName())) {
                continue;
            }

            JSObject track = buildTrackObject(file);
            if (track != null) {
                tracks.put(track);
            }
        }

        result.put("tracks", tracks);
        call.resolve(result);
    }

    private boolean isSupportedAudio(String name) {
        String lower = name.toLowerCase(Locale.ROOT);
        return lower.endsWith(".mp3")
            || lower.endsWith(".m4a")
            || lower.endsWith(".aac")
            || lower.endsWith(".flac")
            || lower.endsWith(".ogg")
            || lower.endsWith(".opus")
            || lower.endsWith(".wav")
            || lower.endsWith(".webm");
    }

    private JSObject buildTrackObject(File file) {
        MediaMetadataRetriever mmr = new MediaMetadataRetriever();

        try {
            mmr.setDataSource(file.getAbsolutePath());

            String title = valueOrFallback(
                mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_TITLE),
                stripExtension(file.getName())
            );
            String artist = valueOrFallback(
                mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ARTIST),
                "Unknown Artist"
            );
            String album = valueOrFallback(
                mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ALBUM),
                "Unknown Album"
            );
            String genre = valueOrFallback(
                mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_GENRE),
                ""
            );

            long durationMs = parseLongSafe(mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION));
            int durationSeconds = durationMs > 0 ? (int) Math.max(1, durationMs / 1000L) : 0;

            JSObject track = new JSObject();
            track.put("id", "local-doc-" + Integer.toHexString(file.getAbsolutePath().hashCode()));
            track.put("title", title);
            track.put("artist", artist);
            track.put("album", album);
            track.put("genre", genre);
            track.put("duration", durationSeconds);
            track.put("cover", "");
            track.put("localPath", "MHL Music/" + file.getName());
            track.put("localSource", "documents");
            track.put("isLocal", true);
            track.put("importedAt", System.currentTimeMillis());
            track.put("playCount", 0);
            track.put("modifiedAt", file.lastModified());
            return track;
        } catch (Exception ignored) {
            return null;
        } finally {
            try {
                mmr.release();
            } catch (Exception ignored) {
                // no-op
            }
        }
    }

    private String stripExtension(String fileName) {
        int dotIndex = fileName.lastIndexOf('.');
        return dotIndex > 0 ? fileName.substring(0, dotIndex) : fileName;
    }

    private String valueOrFallback(String value, String fallback) {
        if (value == null) return fallback;
        String trimmed = value.trim();
        return trimmed.isEmpty() ? fallback : trimmed;
    }

    private long parseLongSafe(String value) {
        if (value == null || value.isEmpty()) return 0L;
        try {
            return Long.parseLong(value);
        } catch (NumberFormatException ignored) {
            return 0L;
        }
    }
}
