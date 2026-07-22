package com.mhl.music;

import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import android.app.Activity;
import android.content.Intent;
import android.content.Context;
import android.net.Uri;
import android.os.Environment;
import com.yausername.youtubedl_android.YoutubeDL;
import com.yausername.youtubedl_android.YoutubeDLRequest;
import com.yausername.youtubedl_android.YoutubeDLResponse;
import com.yausername.ffmpeg.FFmpeg;

import org.json.JSONArray;
import org.json.JSONObject;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.provider.MediaStore;
import android.media.MediaMetadataRetriever;
import java.io.DataInputStream;
import java.io.OutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import android.util.Base64;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "YtDlp")
public class YtDlpPlugin extends Plugin {

    private static final String TAG = "YtDlpPlugin";
    private static final Pattern SPEED_PATTERN =
        Pattern.compile("at\\s+([\\d.]+)\\s*(KiB|MiB|GiB|KB|MB|GB)/s");
    private boolean isInitialized = false;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    // (Removed SAF/picker code - using MediaStore-only storage)

    /** Extrae velocidad de una línea de yt-dlp, e.g. "at 1.23MiB/s" → "1.2 MB/s" */
    private static String parseSpeed(String line) {
        if (line == null || line.isEmpty()) return "";
        Matcher m = SPEED_PATTERN.matcher(line);
        if (m.find()) {
            String val = m.group(1);
            String unit = m.group(2);
            // Normalizar unidades
            String display = unit.replace("iB", "B"); // KiB→KB, MiB→MB, GiB→GB
            return val + " " + display + "/s";
        }
        return "";
    }

    private synchronized void ensureInitialized() throws Exception {
        if (!isInitialized) {
            try {
                YoutubeDL.getInstance().init(getContext());
                Log.i(TAG, "yt-dlp initialized");
            } catch (Exception e) {
                Log.e(TAG, "yt-dlp init error: " + e.getMessage());
                throw e;
            }
            try {
                FFmpeg.getInstance().init(getContext());
                Log.i(TAG, "FFmpeg initialized");
            } catch (Exception e) {
                Log.w(TAG, "FFmpeg init error (non-fatal): " + e.getMessage());
                // FFmpeg init failure is not fatal for basic operations
            }
            isInitialized = true;
            Log.i(TAG, "yt-dlp + FFmpeg ready");
        }

    }

    // Removed SAF/picker helpers — plugin now uses MediaStore to save downloads publicly

    // Writing directly to public Downloads/MHL Music is used instead of copying via MediaStore.
    @PluginMethod
    public void initialize(PluginCall call) {
        executor.execute(() -> {
            try {
                ensureInitialized();

                JSObject result = new JSObject();
                result.put("success", true);
                bridge.getActivity().runOnUiThread(() -> call.resolve(result));
            } catch (Exception e) {
                Log.e(TAG, "Init failed", e);
                bridge.getActivity().runOnUiThread(() -> call.reject("Failed to initialize yt-dlp: " + e.getMessage()));
            }
        });
    }

    @PluginMethod
    public void update(PluginCall call) {
        executor.execute(() -> {
            try {
                ensureInitialized();
                Log.i(TAG, "Updating yt-dlp...");
                YoutubeDL.UpdateStatus status = YoutubeDL.getInstance().updateYoutubeDL(
                    getContext(), YoutubeDL.UpdateChannel.STABLE.INSTANCE
                );
                String statusStr = status != null ? status.toString() : "DONE";
                Log.i(TAG, "yt-dlp update result: " + statusStr);
                String version = YoutubeDL.getInstance().version(getContext());

                JSObject result = new JSObject();
                result.put("success", true);
                result.put("status", statusStr);
                result.put("version", version != null ? version : "unknown");
                bridge.getActivity().runOnUiThread(() -> call.resolve(result));
            } catch (Exception e) {
                Log.w(TAG, "yt-dlp update failed: " + e.getMessage(), e);
                JSObject result = new JSObject();
                result.put("success", false);
                result.put("status", "FAILED");
                result.put("error", e.getMessage());
                bridge.getActivity().runOnUiThread(() -> call.resolve(result));
            }
        });
    }

    @PluginMethod
    public void getVersion(PluginCall call) {
        executor.execute(() -> {
            try {
                ensureInitialized();
                String version = YoutubeDL.getInstance().version(getContext());
                JSObject result = new JSObject();
                result.put("success", true);
                result.put("version", version != null ? version : "unknown");
                bridge.getActivity().runOnUiThread(() -> call.resolve(result));
            } catch (Exception e) {
                Log.w(TAG, "getVersion failed: " + e.getMessage());
                JSObject result = new JSObject();
                result.put("success", false);
                result.put("version", "unknown");
                bridge.getActivity().runOnUiThread(() -> call.resolve(result));
            }
        });
    }

    @PluginMethod
    public void search(PluginCall call) {
        String query = call.getString("query");
        if (query == null || query.isEmpty()) {
            call.reject("Missing query parameter");
            return;
        }
        Integer requestedLimit = call.getInt("limit");
        int limit = requestedLimit != null ? Math.max(1, Math.min(requestedLimit, 20)) : 10;
        String source = call.getString("source", "youtube_music");
        Boolean requestedEnrich = call.getBoolean("enrich", false);
        boolean enrich = requestedEnrich != null && requestedEnrich;

        executor.execute(() -> {
            try {
                ensureInitialized();
                JSArray results = runSearch(query, limit, source, enrich);
                JSObject result = new JSObject();
                result.put("success", true);
                result.put("results", results);
                bridge.getActivity().runOnUiThread(() -> call.resolve(result));
            } catch (Exception e) {
                Log.e(TAG, "Search failed: " + e.getMessage(), e);
                bridge.getActivity().runOnUiThread(() -> call.reject("Search failed: " + e.getMessage()));
            }
        });
    }

    @PluginMethod
    public void searchMany(PluginCall call) {
        JSArray rawQueries = call.getArray("queries");
        if (rawQueries == null || rawQueries.length() == 0) {
            call.reject("Missing queries parameter");
            return;
        }
        Integer requestedLimit = call.getInt("limit");
        int limit = requestedLimit != null ? Math.max(1, Math.min(requestedLimit, 20)) : 5;

        List<String> queries = new ArrayList<>();
        for (int i = 0; i < rawQueries.length(); i++) {
            String query = rawQueries.optString(i, "").trim();
            if (!query.isEmpty()) {
                queries.add(query);
            }
        }
        if (queries.isEmpty()) {
            call.reject("No valid queries");
            return;
        }

        executor.execute(() -> {
            try {
                ensureInitialized();
                JSArray batches = new JSArray();
                for (String query : queries) {
                    batches.put(runSearch(query, limit, "youtube", false));
                }

                JSObject result = new JSObject();
                result.put("success", true);
                result.put("results", batches);
                bridge.getActivity().runOnUiThread(() -> call.resolve(result));
            } catch (Exception e) {
                Log.e(TAG, "searchMany failed: " + e.getMessage(), e);
                bridge.getActivity().runOnUiThread(() -> call.reject("Search failed: " + e.getMessage()));
            }
        });
    }

    private JSArray runSearch(String query, int limit, String source, boolean enrich) throws Exception {
        boolean youtubeMusic = "youtube_music".equals(source);
        String target = youtubeMusic
            ? "https://music.youtube.com/search?q=" + URLEncoder.encode(query, StandardCharsets.UTF_8.toString()) + "#songs"
            : "ytsearch" + limit + ":" + query;
        YoutubeDLRequest request = new YoutubeDLRequest(target);
        request.addOption("--dump-json");
        request.addOption("--flat-playlist");
        request.addOption("--playlist-end", String.valueOf(limit));
        request.addOption("--no-download");
        request.addOption("--socket-timeout", "12");
        request.addOption("--retries", "2");

        Log.i(TAG, "Searching: " + query + " limit=" + limit);
        YoutubeDLResponse response = YoutubeDL.getInstance().execute(request);
        String output = response.getOut();
        String errOutput = response.getErr();
        Log.i(TAG, "Search stdout length: " + (output != null ? output.length() : 0));
        if (errOutput != null && !errOutput.isEmpty()) {
            Log.w(TAG, "Search stderr: " + errOutput.substring(0, Math.min(500, errOutput.length())));
        }

        JSArray results = new JSArray();
        if (output != null && !output.isEmpty()) {
            String[] lines = output.split("\n");
            for (String line : lines) {
                line = line.trim();
                if (line.isEmpty() || !line.startsWith("{")) continue;
                try {
                    JSONObject json = new JSONObject(line);
                    String artist = metadataText(
                        json, "artist", "artists", "creator", "creators",
                        "album_artist", "album_artists"
                    );
                    String channel = metadataText(json, "channel", "uploader");
                    if (channel.isEmpty()) channel = artist;
                    JSObject item = new JSObject();
                    item.put("videoId", json.optString("id", json.optString("url", "")));
                    item.put("title", json.optString("title", ""));
                    item.put("duration", json.optDouble("duration", 0));
                    item.put("channel", channel);
                    item.put("source", youtubeMusic ? "youtube_music" : "youtube");
                    item.put("resultType", youtubeMusic ? "song" : "video");
                    item.put("artist", artist);
                    item.put("album", json.optString("album", ""));
                    item.put("isrc", json.optString("isrc", ""));
                    item.put("edition", "unknown");
                    item.put("sourceCodec", json.optString("acodec", ""));
                    item.put("sourceAbr", json.optDouble("abr", 0));
                    if (!item.getString("videoId").isEmpty()) {
                        results.put(item);
                    }
                } catch (Exception e) {
                    Log.w(TAG, "Parse line error: " + e.getMessage());
                }
            }
        }

        Log.i(TAG, "Search found " + results.length() + " results");
        if (enrich) {
            for (int i = 0; i < Math.min(2, results.length()); i++) {
                Object rawItem = results.get(i);
                if (rawItem instanceof JSObject) enrichCandidate((JSObject) rawItem);
            }
        }
        return results;
    }

    private String metadataText(JSONObject json, String... keys) {
        for (String key : keys) {
            Object value = json.opt(key);
            if (value instanceof String) {
                String text = ((String) value).trim();
                if (!text.isEmpty()) return text;
            }
            if (value instanceof JSONArray) {
                JSONArray values = (JSONArray) value;
                for (int i = 0; i < values.length(); i++) {
                    Object entry = values.opt(i);
                    if (entry instanceof String && !((String) entry).trim().isEmpty()) {
                        return ((String) entry).trim();
                    }
                    if (entry instanceof JSONObject) {
                        String text = ((JSONObject) entry).optString("name", "").trim();
                        if (text.isEmpty()) text = ((JSONObject) entry).optString("title", "").trim();
                        if (!text.isEmpty()) return text;
                    }
                }
            }
        }
        return "";
    }

    private void enrichCandidate(JSObject item) {
        try {
            String videoId = item.getString("videoId");
            if (videoId == null || videoId.isEmpty()) return;
            YoutubeDLRequest detailRequest = new YoutubeDLRequest("https://www.youtube.com/watch?v=" + videoId);
            detailRequest.addOption("--dump-single-json");
            detailRequest.addOption("--skip-download");
            detailRequest.addOption("--no-playlist");
            detailRequest.addOption("--socket-timeout", "12");
            detailRequest.addOption("--retries", "1");
            YoutubeDLResponse detailResponse = YoutubeDL.getInstance().execute(detailRequest);
            JSONObject detail = new JSONObject(detailResponse.getOut().trim());
            String detailArtist = metadataText(
                detail, "artist", "artists", "creator", "creators",
                "album_artist", "album_artists"
            );
            String detailChannel = metadataText(detail, "channel", "uploader");
            if (detailChannel.isEmpty()) detailChannel = detailArtist;
            item.put("duration", detail.optDouble("duration", item.optDouble("duration", 0)));
            if (!detailChannel.isEmpty()) item.put("channel", detailChannel);
            if (!detailArtist.isEmpty()) item.put("artist", detailArtist);
            item.put("album", detail.optString("album", item.optString("album", "")));
            item.put("isrc", detail.optString("isrc", ""));
            item.put("sourceCodec", detail.optString("acodec", ""));
            item.put("sourceAbr", detail.optDouble("abr", 0));
        } catch (Exception detailError) {
            Log.w(TAG, "Candidate enrichment failed: " + detailError.getMessage());
        }
    }

    @PluginMethod
    public void getStreamUrl(PluginCall call) {
        String videoId = call.getString("videoId");
        if (videoId == null || videoId.isEmpty()) {
            call.reject("Missing videoId parameter");
            return;
        }

        executor.execute(() -> {
            try {
                ensureInitialized();

                String url = "https://www.youtube.com/watch?v=" + videoId;
                YoutubeDLRequest request = new YoutubeDLRequest(url);
                request.addOption("-f", "bestaudio[ext=m4a]/bestaudio");
                request.addOption("--get-url");
                request.addOption("--no-playlist");

                Log.i(TAG, "Getting stream URL for: " + videoId);
                YoutubeDLResponse response = YoutubeDL.getInstance().execute(request);
                String streamUrl = response.getOut();
                if (streamUrl != null) {
                    streamUrl = streamUrl.trim();
                }
                String errOutput = response.getErr();
                if (errOutput != null && !errOutput.isEmpty()) {
                    Log.w(TAG, "getStreamUrl stderr: " + errOutput.substring(0, Math.min(500, errOutput.length())));
                }

                if (streamUrl == null || streamUrl.isEmpty()) {
                    bridge.getActivity().runOnUiThread(() -> call.reject("No stream URL found"));
                    return;
                }

                Log.i(TAG, "Got stream URL length: " + streamUrl.length());
                JSObject result = new JSObject();
                result.put("success", true);
                result.put("url", streamUrl);
                bridge.getActivity().runOnUiThread(() -> call.resolve(result));
            } catch (Exception e) {
                Log.e(TAG, "getStreamUrl failed: " + e.getMessage(), e);
                bridge.getActivity().runOnUiThread(() -> call.reject("Stream extraction failed: " + e.getMessage()));
            }
        });
    }

    @PluginMethod
    public void downloadAudio(PluginCall call) {
        String videoId = call.getString("videoId");
        String sourceUrl = call.getString("sourceUrl");
        Double expectedDurationValue = call.getDouble("expectedDuration");
        double expectedDuration = expectedDurationValue != null ? expectedDurationValue : 0;
        if ((videoId == null || videoId.isEmpty()) && (sourceUrl == null || sourceUrl.isEmpty())) {
            call.reject("Missing videoId or sourceUrl parameter");
            return;
        }
        if (sourceUrl != null && !sourceUrl.isEmpty() && !isAllowedAnimeThemesAudioUrl(sourceUrl)) {
            call.reject("Unsupported sourceUrl");
            return;
        }

        executor.execute(() -> {
            File cacheDir = new File(getContext().getCacheDir(), "ytdlp");
            cacheDir.mkdirs();

            // Clean ALL previous files to avoid stale data
            File[] oldFiles = cacheDir.listFiles();
            if (oldFiles != null) {
                for (File f : oldFiles) {
                    f.delete();
                }
            }

                try {
                ensureInitialized();

                String url = sourceUrl != null && !sourceUrl.isEmpty()
                    ? sourceUrl
                    : "https://www.youtube.com/watch?v=" + videoId;

                String fileName = "audio_" + System.currentTimeMillis() + ".mp3";

                // Descargar al caché privado (no visible para otras apps)
                File outputFile = new File(cacheDir, fileName);
                String outputPath = outputFile.getAbsolutePath();

                YoutubeDLRequest request = new YoutubeDLRequest(url);
                request.addOption("-x");
                request.addOption("--audio-format", "mp3");
                request.addOption("--audio-quality", "0");   // mejor calidad (~320kbps VBR)
                request.addOption("-o", outputPath);
                request.addOption("--no-playlist");
                request.addOption("--no-part");               // sin archivos .part (menos I/O)
                request.addOption("--socket-timeout", "15");
                request.addOption("--retries", "2");
                request.addOption("--fragment-retries", "2");
                // Usar cliente Android para evitar SABR streaming forzado por YouTube (403)
                request.addOption("--extractor-args", "youtube:player_client=android,web");
                // 8 fragmentos paralelos: máximo seguro sin triggers de rate-limit de YouTube
                request.addOption("--concurrent-fragments", "2");

                Log.i(TAG, "Downloading audio for: " + videoId + " -> " + outputPath);

                // Callback de progreso: reporta %, ETA y velocidad en tiempo real al JS bridge
                YoutubeDLResponse response = YoutubeDL.getInstance().execute(
                    request,
                    (String) null,
                    new kotlin.jvm.functions.Function3<Float, Long, String, kotlin.Unit>() {
                        @Override
                        public kotlin.Unit invoke(Float progress, Long etaInSeconds, String line) {
                            try {
                                JSObject data = new JSObject();
                                data.put("progress", Math.round(progress));
                                data.put("eta", etaInSeconds);
                                data.put("speed", parseSpeed(line));
                                notifyListeners("downloadProgress", data);
                            } catch (Exception ignored) {}
                            return kotlin.Unit.INSTANCE;
                        }
                    }
                );
                Log.i(TAG, "Download complete stdout: " + (response.getOut() != null ? response.getOut().substring(0, Math.min(200, response.getOut().length())) : "null"));
                String errOutput = response.getErr();
                if (errOutput != null && !errOutput.isEmpty()) {
                    Log.i(TAG, "Download stderr: " + errOutput.substring(0, Math.min(500, errOutput.length())));
                }

                if (!outputFile.exists() || outputFile.length() < 16 * 1024) {
                    bridge.getActivity().runOnUiThread(() -> call.reject("No audio file produced after download"));
                    return;
                }

                MediaMetadataRetriever retriever = new MediaMetadataRetriever();
                long durationMs;
                try {
                    retriever.setDataSource(outputFile.getAbsolutePath());
                    String rawDuration = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION);
                    if (rawDuration == null) throw new IllegalStateException("Missing MP3 duration");
                    durationMs = Long.parseLong(rawDuration);
                } catch (Exception validationError) {
                    outputFile.delete();
                    bridge.getActivity().runOnUiThread(() -> call.reject("conversion: MP3 is not decodable"));
                    return;
                } finally {
                    retriever.release();
                }
                if (expectedDuration > 0) {
                    double tolerance = Math.max(5.0, expectedDuration * 0.05);
                    if (Math.abs(durationMs / 1000.0 - expectedDuration) > tolerance) {
                        outputFile.delete();
                        bridge.getActivity().runOnUiThread(() -> call.reject("candidate_invalid: downloaded duration mismatch"));
                        return;
                    }
                }

                // Leer archivo completo y codificar en base64 para devolver al bridge JS
                // IMPORTANTE: usar DataInputStream.readFully() para garantizar lectura completa.
                // FileInputStream.read() puede devolver menos bytes de los pedidos (bug 88KB).
                byte[] fileBytes = new byte[(int) outputFile.length()];
                try (DataInputStream dis = new DataInputStream(new FileInputStream(outputFile))) {
                    dis.readFully(fileBytes);
                } finally {
                    outputFile.delete();
                }
                String base64Data = Base64.encodeToString(fileBytes, Base64.NO_WRAP);

                JSObject result = new JSObject();
                result.put("success", true);
                result.put("data", base64Data);
                result.put("fileName", fileName);
                result.put("size", fileBytes.length);
                bridge.getActivity().runOnUiThread(() -> call.resolve(result));
            } catch (Exception e) {
                Log.e(TAG, "downloadAudio failed: " + e.getMessage(), e);
                bridge.getActivity().runOnUiThread(() -> call.reject("Download failed: " + e.getMessage()));
            }
        });
    }

    private static boolean isAllowedAnimeThemesAudioUrl(String sourceUrl) {
        try {
            URI uri = URI.create(sourceUrl);
            return "https".equalsIgnoreCase(uri.getScheme())
                && "a.animethemes.moe".equalsIgnoreCase(uri.getHost());
        } catch (Exception ignored) {
            return false;
        }
    }

    // Keep old method name for compatibility
    @PluginMethod
    public void downloadAsMp3(PluginCall call) {
        downloadAudio(call);
    }

    /**
     * Guarda audio ya procesado (con ID3 tags) en Music/MHL Music via MediaStore.
     * Recibe: fileName (string), data (base64 string)
     * Devuelve: uri (string)
     */
    @PluginMethod
    public void saveTaggedAudioToMusic(PluginCall call) {
        String fileName = call.getString("fileName");
        String base64Data = call.getString("data");
        if (fileName == null || fileName.isEmpty() || base64Data == null || base64Data.isEmpty()) {
            call.reject("fileName and data are required");
            return;
        }

        executor.execute(() -> {
            try {
                byte[] audioBytes = Base64.decode(base64Data, Base64.NO_WRAP);

                ContentValues values = new ContentValues();
                values.put(MediaStore.Audio.Media.DISPLAY_NAME, fileName);
                values.put(MediaStore.Audio.Media.MIME_TYPE, fileName.endsWith(".m4a") ? "audio/mp4" : "audio/mpeg");
                values.put(MediaStore.Audio.Media.RELATIVE_PATH, "Music/MHL Music");
                values.put(MediaStore.Audio.Media.IS_PENDING, 1);

                ContentResolver resolver = getContext().getContentResolver();
                Uri itemUri = resolver.insert(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, values);

                if (itemUri == null) {
                    bridge.getActivity().runOnUiThread(() -> call.reject("MediaStore insert failed"));
                    return;
                }

                try (OutputStream os = resolver.openOutputStream(itemUri)) {
                    os.write(audioBytes);
                }

                values.clear();
                values.put(MediaStore.Audio.Media.IS_PENDING, 0);
                resolver.update(itemUri, values, null, null);

                Log.i(TAG, "Saved " + fileName + " to Music/MHL Music (" + audioBytes.length + " bytes)");

                JSObject result = new JSObject();
                result.put("success", true);
                result.put("uri", itemUri.toString());
                bridge.getActivity().runOnUiThread(() -> call.resolve(result));
            } catch (Exception e) {
                Log.e(TAG, "saveTaggedAudioToMusic failed", e);
                bridge.getActivity().runOnUiThread(() -> call.reject(e.getMessage()));
            }
        });
    }

    @PluginMethod
    public void saveAudioToMusicMediaStore(PluginCall call) {
        String videoId = call.getString("videoId");
        String fileNameHint = call.getString("fileName");
        if (videoId == null || videoId.isEmpty()) {
            call.reject("Missing videoId");
            return;
        }

        executor.execute(() -> {
            File cacheDir = new File(getContext().getCacheDir(), "ytdlp");
            cacheDir.mkdirs();
            File[] prevFiles = cacheDir.listFiles();
            if (prevFiles != null) { for (File f : prevFiles) f.delete(); }

            try {
                ensureInitialized();

                String url = "https://www.youtube.com/watch?v=" + videoId;
                String outputPath = new File(cacheDir, "temp_audio.mp3").getAbsolutePath();

                YoutubeDLRequest request = new YoutubeDLRequest(url);
                request.addOption("-x");
                request.addOption("--audio-format", "mp3");
                request.addOption("-o", outputPath);
                request.addOption("--no-playlist");
                // Usar cliente Android para evitar SABR streaming forzado por YouTube (403)
                request.addOption("--extractor-args", "youtube:player_client=android,web");

                YoutubeDL.getInstance().execute(request);

                File audioFile = new File(outputPath);
                if (!audioFile.exists() || audioFile.length() == 0) {
                    bridge.getActivity().runOnUiThread(() -> call.reject("No audio file produced"));
                    return;
                }

                ContentValues values = new ContentValues();
                values.put(MediaStore.Audio.Media.DISPLAY_NAME, fileNameHint != null ? fileNameHint : "audio.mp3");
                values.put(MediaStore.Audio.Media.MIME_TYPE, "audio/mpeg");
                values.put(MediaStore.Audio.Media.RELATIVE_PATH, "Music/MHL Music");
                values.put(MediaStore.Audio.Media.IS_PENDING, 1);

                ContentResolver resolver = getContext().getContentResolver();
                Uri itemUri = resolver.insert(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, values);

                if (itemUri == null) {
                    bridge.getActivity().runOnUiThread(() -> call.reject("MediaStore insert failed"));
                    return;
                }

                try (OutputStream os = resolver.openOutputStream(itemUri);
                     FileInputStream fis = new FileInputStream(audioFile)) {
                    byte[] buffer = new byte[8192];
                    int bytesRead;
                    while ((bytesRead = fis.read(buffer)) != -1) {
                        os.write(buffer, 0, bytesRead);
                    }
                }

                values.clear();
                values.put(MediaStore.Audio.Media.IS_PENDING, 0);
                resolver.update(itemUri, values, null, null);
                audioFile.delete();

                JSObject result = new JSObject();
                result.put("success", true);
                result.put("uri", itemUri.toString());
                bridge.getActivity().runOnUiThread(() -> call.resolve(result));

            } catch (Exception e) {
                Log.e(TAG, "saveAudioToMusicMediaStore failed", e);
                bridge.getActivity().runOnUiThread(() -> call.reject(e.getMessage()));
            }
        });
    }

}
