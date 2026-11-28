package com.mhl.music;

import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import android.net.Uri;
import com.yausername.youtubedl_android.YoutubeDL;
import com.yausername.youtubedl_android.YoutubeDLRequest;
import com.yausername.youtubedl_android.YoutubeDLResponse;
import com.yausername.ffmpeg.FFmpeg;

import org.json.JSONArray;
import org.json.JSONObject;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.media.MediaMetadataRetriever;
import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.OutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import android.util.Base64;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.URI;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "YtDlp")
public class YtDlpPlugin extends Plugin {

    private static final String TAG = "YtDlpPlugin";
    private static final Pattern SPEED_PATTERN =
        Pattern.compile("at\\s+([\\d.]+)\\s*(KiB|MiB|GiB|KB|MB|GB)/s");
    private static final long STALE_CACHE_TTL_MS = 3600_000L; // 1 hour
    private static final int COVER_CACHE_MAX_ENTRIES = 12;
    private static final int COVER_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
    private static final long COVER_CACHE_MAX_TOTAL_BYTES = 16L * 1024 * 1024; // 16 MB global cap
    private static final int COVER_MAX_REDIRECTS = 3;

    private boolean isInitialized = false;
    private final ExecutorService executor = Executors.newFixedThreadPool(4);
    private final ExecutorService videoExecutor = Executors.newSingleThreadExecutor();
    private final ExecutorService searchExecutor = Executors.newFixedThreadPool(3);
    private final ExecutorService enrichExecutor = Executors.newFixedThreadPool(2);
    private final ExecutorService playlistExecutor = Executors.newFixedThreadPool(2);
    private final Map<String, byte[]> coverCache = new LinkedHashMap<String, byte[]>(16, 0.75f, true);
    private long coverCacheTotalBytes = 0L;

    private final Object updateLock = new Object();
    private long lastAutoUpdateTimestamp = 0;
    private static final long AUTO_UPDATE_COOLDOWN_MS = 12 * 60 * 60 * 1000L; // 12 hours

    private static final Pattern OUTDATED_PATTERNS = Pattern.compile(
        "(bot|403|forbidden|extractor|n-sig|cipher|signature|unable to extract)",
        Pattern.CASE_INSENSITIVE
    );
    private static final Pattern PLAYLIST_ID_PATTERN = Pattern.compile("\\A[a-zA-Z0-9_-]{8,128}\\z");
    private static final Pattern VIDEO_ID_PATTERN = Pattern.compile("\\A[a-zA-Z0-9_-]+\\z");
    private static final Pattern STRICT_VIDEO_ID_PATTERN = Pattern.compile("\\A[a-zA-Z0-9_-]{11}\\z");

    private static boolean isOutdatedYtDlpError(String errorMsg) {
        if (errorMsg == null || errorMsg.isEmpty()) return false;
        return OUTDATED_PATTERNS.matcher(errorMsg).find();
    }

    private boolean tryReactiveAutoUpdate() {
        long now = System.currentTimeMillis();
        synchronized (updateLock) {
            if (now - lastAutoUpdateTimestamp < AUTO_UPDATE_COOLDOWN_MS) {
                return false;
            }
            lastAutoUpdateTimestamp = now;
            try {
                Log.i(TAG, "Triggering reactive auto-update for yt-dlp...");
                YoutubeDL.UpdateStatus status = YoutubeDL.getInstance().updateYoutubeDL(
                    getContext().getApplicationContext(), YoutubeDL.UpdateChannel.STABLE.INSTANCE
                );
                Log.i(TAG, "Reactive auto-update result: " + status);
                return status == YoutubeDL.UpdateStatus.DONE;
            } catch (Exception e) {
                Log.w(TAG, "Reactive auto-update failed: " + e.getMessage());
                return false;
            }
        }
    }

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

    private static void deleteRecursively(File target) {
        if (target == null || !target.exists()) return;
        if (target.isDirectory()) {
            File[] children = target.listFiles();
            if (children != null) {
                for (File child : children) {
                    deleteRecursively(child);
                }
            }
        }
        target.delete();
    }

    private void cleanupStaleCache(File cacheDir) {
        if (cacheDir == null || !cacheDir.exists() || !cacheDir.isDirectory()) return;
        long cutoff = System.currentTimeMillis() - STALE_CACHE_TTL_MS;
        File[] entries = cacheDir.listFiles();
        if (entries == null) return;
        for (File entry : entries) {
            try {
                if (entry.lastModified() < cutoff) {
                    deleteRecursively(entry);
                }
            } catch (Exception e) {
                Log.w(TAG, "Failed to cleanup stale cache entry: " + e.getMessage());
            }
        }
    }

    private File resolveValidatedTempFile(String tempPath, boolean requireExists) throws IOException {
        if (tempPath == null || tempPath.isEmpty()) {
            return null;
        }
        File ytdlpRoot = new File(getContext().getCacheDir(), "ytdlp");
        String rootCanonical = ytdlpRoot.getCanonicalPath();
        String rootPrefix = rootCanonical.endsWith(File.separator)
            ? rootCanonical
            : rootCanonical + File.separator;

        File candidate = new File(tempPath);
        String candidateCanonical = candidate.getCanonicalPath();
        if (!candidateCanonical.startsWith(rootPrefix)) {
            return null;
        }
        if (requireExists && (!candidate.exists() || !candidate.isFile())) {
            return null;
        }
        return candidate;
    }

    private void deleteTempFileAndTaskDir(File tempFile) {
        if (tempFile == null) return;
        try {
            File ytdlpRoot = new File(getContext().getCacheDir(), "ytdlp");
            String rootCanonical = ytdlpRoot.getCanonicalPath();
            String rootPrefix = rootCanonical.endsWith(File.separator)
                ? rootCanonical
                : rootCanonical + File.separator;

            String fileCanonical = tempFile.getCanonicalPath();
            if (!fileCanonical.startsWith(rootPrefix)) {
                return;
            }
            if (tempFile.isDirectory()) {
                deleteRecursively(tempFile);
                return;
            }
            if (tempFile.exists()) {
                tempFile.delete();
            }
            File parentDir = tempFile.getParentFile();
            if (parentDir != null) {
                String parentCanonical = parentDir.getCanonicalPath();
                if (parentCanonical.startsWith(rootPrefix) && !parentCanonical.equals(rootCanonical)) {
                    deleteRecursively(parentDir);
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "Failed to cleanup temp file/taskDir: " + e.getMessage());
        }
    }

    private static boolean isSafeCoverUrl(URL url) {
        if (url == null) return false;
        if (!"https".equalsIgnoreCase(url.getProtocol())) {
            return false;
        }
        String host = url.getHost();
        if (host == null || host.isEmpty()) {
            return false;
        }
        String lowerHost = host.toLowerCase(Locale.ROOT);
        while (lowerHost.endsWith(".")) {
            lowerHost = lowerHost.substring(0, lowerHost.length() - 1);
        }
        if (lowerHost.isEmpty()
                || "localhost".equals(lowerHost)
                || lowerHost.endsWith(".localhost")
                || lowerHost.endsWith(".local")
                || lowerHost.endsWith(".internal")) {
            return false;
        }
        try {
            InetAddress[] addresses = InetAddress.getAllByName(host);
            if (addresses == null || addresses.length == 0) {
                return false;
            }
            for (InetAddress addr : addresses) {
                if (addr.isLoopbackAddress()
                        || addr.isSiteLocalAddress()
                        || addr.isLinkLocalAddress()
                        || addr.isAnyLocalAddress()
                        || addr.isMulticastAddress()) {
                    return false;
                }
                byte[] raw = addr.getAddress();
                if (raw != null && raw.length == 16 && (raw[0] & 0xfe) == 0xfc) {
                    // IPv6 Unique Local Address (fc00::/7)
                    return false;
                }
            }
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private static boolean isJpegBytes(byte[] bytes) {
        return bytes != null
                && bytes.length > 32
                && (bytes[0] & 0xFF) == 0xFF
                && (bytes[1] & 0xFF) == 0xD8
                && (bytes[2] & 0xFF) == 0xFF;
    }

    private static boolean isPngBytes(byte[] bytes) {
        return bytes != null
                && bytes.length > 32
                && (bytes[0] & 0xFF) == 0x89
                && (bytes[1] & 0xFF) == 0x50
                && (bytes[2] & 0xFF) == 0x4E
                && (bytes[3] & 0xFF) == 0x47
                && (bytes[4] & 0xFF) == 0x0D
                && (bytes[5] & 0xFF) == 0x0A
                && (bytes[6] & 0xFF) == 0x1A
                && (bytes[7] & 0xFF) == 0x0A;
    }

    private static boolean isValidCoverImage(byte[] bytes) {
        return isJpegBytes(bytes) || isPngBytes(bytes);
    }

    private byte[] fetchCoverBytes(String coverUrl) {
        if (coverUrl == null || coverUrl.isEmpty()) return null;
        URL initialUrl;
        try {
            initialUrl = new URL(coverUrl);
        } catch (Exception e) {
            return null;
        }
        if (!isSafeCoverUrl(initialUrl)) {
            return null;
        }
        synchronized (coverCache) {
            byte[] cached = coverCache.get(coverUrl);
            if (cached != null) {
                return cached;
            }
        }
        HttpURLConnection conn = null;
        try {
            URL currentUrl = initialUrl;
            int status = -1;
            for (int hop = 0; hop <= COVER_MAX_REDIRECTS; hop++) {
                if (hop > 0 && !isSafeCoverUrl(currentUrl)) {
                    return null;
                }
                conn = (HttpURLConnection) currentUrl.openConnection();
                conn.setConnectTimeout(8000);
                conn.setReadTimeout(10000);
                conn.setInstanceFollowRedirects(false);
                conn.setRequestMethod("GET");
                status = conn.getResponseCode();
                if (status == HttpURLConnection.HTTP_MOVED_PERM
                        || status == HttpURLConnection.HTTP_MOVED_TEMP
                        || status == HttpURLConnection.HTTP_SEE_OTHER
                        || status == 307
                        || status == 308) {
                    String location = conn.getHeaderField("Location");
                    conn.disconnect();
                    conn = null;
                    if (location == null || location.isEmpty() || hop == COVER_MAX_REDIRECTS) {
                        return null;
                    }
                    currentUrl = new URL(currentUrl, location);
                    continue;
                }
                break;
            }
            if (conn == null || status < 200 || status >= 300) {
                return null;
            }
            int contentLength = conn.getContentLength();
            if (contentLength > COVER_MAX_BYTES) {
                return null;
            }
            try (InputStream in = conn.getInputStream();
                 ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[8192];
                int bytesRead;
                int total = 0;
                while ((bytesRead = in.read(buffer)) != -1) {
                    total += bytesRead;
                    if (total > COVER_MAX_BYTES) {
                        return null;
                    }
                    baos.write(buffer, 0, bytesRead);
                }
                byte[] bytes = baos.toByteArray();
                if (!isValidCoverImage(bytes)) {
                    return null;
                }
                synchronized (coverCache) {
                    byte[] previous = coverCache.put(coverUrl, bytes);
                    if (previous != null) {
                        coverCacheTotalBytes -= previous.length;
                    }
                    coverCacheTotalBytes += bytes.length;
                    Iterator<Map.Entry<String, byte[]>> it = coverCache.entrySet().iterator();
                    while (it.hasNext()
                            && (coverCache.size() > COVER_CACHE_MAX_ENTRIES
                                || coverCacheTotalBytes > COVER_CACHE_MAX_TOTAL_BYTES)) {
                        Map.Entry<String, byte[]> eldest = it.next();
                        if (eldest.getValue() != null) {
                            coverCacheTotalBytes -= eldest.getValue().length;
                        }
                        it.remove();
                    }
                    if (coverCacheTotalBytes < 0) {
                        coverCacheTotalBytes = 0;
                    }
                }
                return bytes;
            }
        } catch (Exception e) {
            Log.w(TAG, "Cover download failed: " + e.getMessage());
        } finally {
            if (conn != null) {
                conn.disconnect();
            }
        }
        return null;
    }

    private synchronized void ensureInitialized() throws Exception {
        if (!isInitialized) {
            try {
                YoutubeDL.getInstance().init(getContext().getApplicationContext());
                Log.i(TAG, "yt-dlp initialized");
            } catch (Exception e) {
                Log.e(TAG, "yt-dlp init error: " + e.getMessage());
                throw e;
            }
            try {
                FFmpeg.getInstance().init(getContext().getApplicationContext());
                Log.i(TAG, "FFmpeg initialized");
            } catch (Exception e) {
                Log.w(TAG, "FFmpeg init error (non-fatal): " + e.getMessage());
                // FFmpeg init failure is not fatal for basic operations
            }
            cleanupStaleCache(new File(getContext().getCacheDir(), "ytdlp"));
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
    public void startForegroundService(PluginCall call) {
        String title = call.getString("title", "MHL Music");
        String text = call.getString("text", "Descargando en segundo plano...");
        
        Intent intent = new Intent(getContext(), DownloadForegroundService.class);
        intent.putExtra("title", title);
        intent.putExtra("text", text);
        
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            getContext().startForegroundService(intent);
        } else {
            getContext().startService(intent);
        }
        
        call.resolve();
    }

    @PluginMethod
    public void stopForegroundService(PluginCall call) {
        Intent intent = new Intent(getContext(), DownloadForegroundService.class);
        intent.setAction("STOP");
        
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            getContext().startForegroundService(intent);
        } else {
            getContext().startService(intent);
        }
        
        call.resolve();
    }

    @PluginMethod
    public void update(PluginCall call) {
        executor.execute(() -> {
            synchronized (updateLock) {
                try {
                    ensureInitialized();
                    Log.i(TAG, "Updating yt-dlp...");
                    YoutubeDL.UpdateStatus status = YoutubeDL.getInstance().updateYoutubeDL(
                        getContext().getApplicationContext(), YoutubeDL.UpdateChannel.STABLE.INSTANCE
                    );
                    String statusStr = status != null ? status.toString() : "DONE";
                    Log.i(TAG, "yt-dlp update result: " + statusStr);
                    String version = YoutubeDL.getInstance().version(getContext().getApplicationContext());
                    lastAutoUpdateTimestamp = System.currentTimeMillis();

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

        searchExecutor.execute(() -> {
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
        YoutubeDLResponse response;
        try {
            response = YoutubeDL.getInstance().execute(request);
        } catch (Exception e) {
            if (isOutdatedYtDlpError(e.getMessage()) && tryReactiveAutoUpdate()) {
                response = YoutubeDL.getInstance().execute(request);
            } else {
                throw e;
            }
        }
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
            int enrichCount = Math.min(2, results.length());
            List<CompletableFuture<Void>> futures = new ArrayList<>(enrichCount);
            for (int i = 0; i < enrichCount; i++) {
                Object rawItem = results.get(i);
                if (rawItem instanceof JSONObject) {
                    final JSONObject itemObj = (JSONObject) rawItem;
                    futures.add(CompletableFuture.runAsync(() -> enrichCandidate(itemObj), enrichExecutor));
                }
            }
            if (!futures.isEmpty()) {
                CompletableFuture.allOf(futures.toArray(new CompletableFuture[0])).join();
            }
        }
        return results;
    }

    private static String extractValidatedPlaylistId(String rawUrl) {
        if (rawUrl == null) return null;
        String trimmed = rawUrl.trim();
        if (trimmed.isEmpty() || trimmed.indexOf('\\') >= 0) return null;
        try {
            Uri uri = Uri.parse(trimmed);
            if (uri == null) return null;
            if (!"https".equalsIgnoreCase(uri.getScheme())) return null;
            if (uri.getUserInfo() != null) return null;
            int port = uri.getPort();
            if (port != -1 && port != 443) return null;
            String host = uri.getHost();
            if (host == null || host.isEmpty()) return null;
            String authority = uri.getAuthority();
            if (authority == null
                    || (!authority.equalsIgnoreCase(host) && !authority.equalsIgnoreCase(host + ":443"))) {
                return null;
            }
            String lowerHost = host.toLowerCase(Locale.ROOT);
            boolean allowedHost = "youtube.com".equals(lowerHost)
                || "www.youtube.com".equals(lowerHost)
                || "m.youtube.com".equals(lowerHost)
                || "music.youtube.com".equals(lowerHost);
            if (!allowedHost) return null;
            String listId = uri.getQueryParameter("list");
            if (listId == null || !PLAYLIST_ID_PATTERN.matcher(listId).matches()) {
                return null;
            }
            return listId;
        } catch (Exception ignored) {
            return null;
        }
    }

    private static String extractBestThumbnail(JSONObject json) {
        if (json == null) return "";
        JSONArray thumbnails = json.optJSONArray("thumbnails");
        String bestUrl = "";
        long bestScore = -1L;
        if (thumbnails != null) {
            for (int i = 0; i < thumbnails.length(); i++) {
                JSONObject thumb = thumbnails.optJSONObject(i);
                if (thumb == null || thumb.isNull("url")) continue;
                String url = thumb.optString("url", "").trim();
                if (url.isEmpty()) continue;
                long width = thumb.optLong("width", 0L);
                long height = thumb.optLong("height", 0L);
                long score = (width > 0 && height > 0) ? (width * height) : i;
                if (score >= bestScore) {
                    bestScore = score;
                    bestUrl = url;
                }
            }
        }
        if (!bestUrl.isEmpty()) {
            return bestUrl;
        }
        if (!json.isNull("thumbnail")) {
            String direct = json.optString("thumbnail", "").trim();
            if (!direct.isEmpty()) {
                return direct;
            }
        }
        return "";
    }

    @PluginMethod
    public void getPlaylistItems(PluginCall call) {
        String url = call.getString("url");
        Integer requestedLimit = call.getInt("limit");
        int limit = requestedLimit != null ? Math.max(1, Math.min(requestedLimit, 50)) : 50;

        String listId = extractValidatedPlaylistId(url);
        if (listId == null) {
            call.reject("Invalid YouTube playlist URL");
            return;
        }
        String canonicalUrl = "https://www.youtube.com/playlist?list=" + listId;

        playlistExecutor.execute(() -> {
            try {
                ensureInitialized();

                YoutubeDLRequest request = new YoutubeDLRequest(canonicalUrl);
                request.addOption("--dump-json");
                request.addOption("--flat-playlist");
                request.addOption("--playlist-end", String.valueOf(limit));
                request.addOption("--no-download");
                request.addOption("--socket-timeout", "12");
                request.addOption("--retries", "2");

                Log.i(TAG, "Fetching playlist items: list=" + listId + " limit=" + limit);
                YoutubeDLResponse response;
                try {
                    response = YoutubeDL.getInstance().execute(request);
                } catch (Exception e) {
                    if (isOutdatedYtDlpError(e.getMessage()) && tryReactiveAutoUpdate()) {
                        response = YoutubeDL.getInstance().execute(request);
                    } else {
                        throw e;
                    }
                }

                String output = response.getOut();
                String errOutput = response.getErr();
                Log.i(TAG, "Playlist stdout length: " + (output != null ? output.length() : 0));
                if (errOutput != null && !errOutput.isEmpty()) {
                    Log.w(TAG, "Playlist stderr: " + errOutput.substring(0, Math.min(500, errOutput.length())));
                }

                String playlistTitle = "";
                JSArray items = new JSArray();
                if (output != null && !output.isEmpty()) {
                    String[] lines = output.split("\n");
                    for (String line : lines) {
                        if (items.length() >= limit) break;
                        line = line.trim();
                        if (line.isEmpty() || !line.startsWith("{")) continue;
                        try {
                            JSONObject json = new JSONObject(line);
                            if (playlistTitle.isEmpty()) {
                                String detectedTitle = metadataText(json, "playlist_title", "playlist");
                                if (!detectedTitle.isEmpty()) {
                                    playlistTitle = detectedTitle;
                                }
                            }
                            String videoId = json.isNull("id") ? "" : json.optString("id", "").trim();
                            if (videoId.isEmpty() && !json.isNull("url")) {
                                videoId = json.optString("url", "").trim();
                            }
                            if (videoId.isEmpty()) continue;

                            String title = json.isNull("title") ? "" : json.optString("title", "").trim();
                            String channel = metadataText(
                                json, "channel", "uploader", "artist", "artists", "creator"
                            );
                            double duration = json.optDouble("duration", 0);
                            if (Double.isNaN(duration) || Double.isInfinite(duration) || duration < 0) {
                                duration = 0;
                            }
                            String thumbnail = extractBestThumbnail(json);

                            JSObject item = new JSObject();
                            item.put("videoId", videoId);
                            item.put("title", title);
                            item.put("channel", channel);
                            item.put("duration", duration);
                            item.put("thumbnail", thumbnail);
                            items.put(item);
                        } catch (Exception e) {
                            Log.w(TAG, "Parse playlist line error: " + e.getMessage());
                        }
                    }
                }

                Log.i(TAG, "Playlist found " + items.length() + " items");
                JSObject result = new JSObject();
                result.put("success", true);
                result.put("title", playlistTitle);
                result.put("items", items);
                bridge.getActivity().runOnUiThread(() -> call.resolve(result));
            } catch (Exception e) {
                Log.e(TAG, "getPlaylistItems failed: " + e.getMessage(), e);
                bridge.getActivity().runOnUiThread(() -> call.reject("Playlist fetch failed: " + e.getMessage()));
            }
        });
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
                ArrayList<String> texts = new ArrayList<>();
                for (int i = 0; i < values.length(); i++) {
                    Object entry = values.opt(i);
                    if (entry instanceof String && !((String) entry).trim().isEmpty()) {
                        texts.add(((String) entry).trim());
                    }
                    if (entry instanceof JSONObject) {
                        String text = ((JSONObject) entry).optString("name", "").trim();
                        if (text.isEmpty()) text = ((JSONObject) entry).optString("title", "").trim();
                        if (!text.isEmpty()) texts.add(text);
                    }
                }
                if (!texts.isEmpty()) return String.join(", ", new LinkedHashSet<>(texts));
            }
        }
        return "";
    }

    private void enrichCandidate(JSONObject item) {
        try {
            String videoId = item.getString("videoId");
            if (videoId == null || videoId.isEmpty() || !VIDEO_ID_PATTERN.matcher(videoId).matches()) return;
            YoutubeDLRequest detailRequest = new YoutubeDLRequest("https://www.youtube.com/watch?v=" + videoId);
            detailRequest.addOption("--dump-single-json");
            detailRequest.addOption("--skip-download");
            detailRequest.addOption("--no-playlist");
            detailRequest.addOption("--socket-timeout", "12");
            detailRequest.addOption("--retries", "1");
            YoutubeDLResponse detailResponse;
            try {
                detailResponse = YoutubeDL.getInstance().execute(detailRequest);
            } catch (Exception detailEx) {
                if (isOutdatedYtDlpError(detailEx.getMessage()) && tryReactiveAutoUpdate()) {
                    detailResponse = YoutubeDL.getInstance().execute(detailRequest);
                } else {
                    throw detailEx;
                }
            }
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
    public void downloadAudio(PluginCall call) {
        String videoId = call.getString("videoId");
        String sourceUrl = call.getString("sourceUrl");
        Double expectedDurationValue = call.getDouble("expectedDuration");
        double expectedDuration = expectedDurationValue != null ? expectedDurationValue : 0;
        boolean skipBase64 = Boolean.TRUE.equals(call.getBoolean("skipBase64", false));
        String downloadId = call.getString("downloadId");
        if ((videoId == null || videoId.isEmpty()) && (sourceUrl == null || sourceUrl.isEmpty())) {
            call.reject("Missing videoId or sourceUrl parameter");
            return;
        }
        if (videoId != null && !videoId.isEmpty() && !VIDEO_ID_PATTERN.matcher(videoId).matches()) {
            call.reject("Invalid videoId format");
            return;
        }
        if (sourceUrl != null && !sourceUrl.isEmpty() && !isAllowedAnimeThemesAudioUrl(sourceUrl)) {
            call.reject("Unsupported sourceUrl");
            return;
        }

        executor.execute(() -> {
            File taskDir = null;
            boolean keepOutput = false;
            try {
                ensureInitialized();

                File cacheDir = new File(getContext().getCacheDir(), "ytdlp");
                cacheDir.mkdirs();
                taskDir = new File(cacheDir, UUID.randomUUID().toString());
                taskDir.mkdirs();

                String url = sourceUrl != null && !sourceUrl.isEmpty()
                    ? sourceUrl
                    : "https://www.youtube.com/watch?v=" + videoId;

                String format = call.getString("format", "m4a");
                boolean isMp3 = "mp3".equalsIgnoreCase(format);
                String fileName = "audio_" + System.currentTimeMillis() + (isMp3 ? ".mp3" : ".m4a");

                // Descargar en subcarpeta aislada dentro del caché privado (seguro para concurrencia)
                File outputFile = new File(taskDir, fileName);
                String outputPath = outputFile.getAbsolutePath();

                YoutubeDLRequest request = new YoutubeDLRequest(url);
                if (isMp3) {
                    request.addOption("-f", "bestaudio/best");
                    request.addOption("-x");
                    request.addOption("--audio-format", "mp3");
                    request.addOption("--audio-quality", "320K");
                } else {
                    request.addOption("-f", "bestaudio[ext=m4a]/bestaudio/best");
                    request.addOption("-x");
                    request.addOption("--audio-format", "m4a");
                    request.addOption("--audio-quality", "0");
                }
                request.addOption("-o", outputPath);
                request.addOption("--no-playlist");
                request.addOption("--no-part");               // sin archivos .part (menos I/O)
                request.addOption("--socket-timeout", "15");
                request.addOption("--retries", "2");
                request.addOption("--fragment-retries", "2");
                // Usar cliente Android para evitar SABR streaming forzado por YouTube (403)
                request.addOption("--extractor-args", "youtube:player_client=android,web");
                request.addOption("--concurrent-fragments", "4");

                Log.i(TAG, "Downloading audio for: " + videoId + " -> " + outputPath);

                // Callback de progreso: reporta %, ETA y velocidad en tiempo real al JS bridge
                kotlin.jvm.functions.Function3<Float, Long, String, kotlin.Unit> progressCallback =
                    new kotlin.jvm.functions.Function3<Float, Long, String, kotlin.Unit>() {
                        @Override
                        public kotlin.Unit invoke(Float progress, Long etaInSeconds, String line) {
                            try {
                                if (progress == null || progress < 0f) {
                                    return kotlin.Unit.INSTANCE;
                                }
                                int clampedProgress = Math.max(0, Math.min(100, Math.round(progress)));
                                JSObject data = new JSObject();
                                data.put("progress", clampedProgress);
                                data.put("eta", etaInSeconds);
                                data.put("speed", parseSpeed(line));
                                if (downloadId != null && !downloadId.isEmpty()) {
                                    data.put("downloadId", downloadId);
                                }
                                notifyListeners("downloadProgress", data);
                            } catch (Exception ignored) {}
                            return kotlin.Unit.INSTANCE;
                        }
                    };

                YoutubeDLResponse response;
                try {
                    response = YoutubeDL.getInstance().execute(request, (String) null, progressCallback);
                } catch (Exception e) {
                    if (isOutdatedYtDlpError(e.getMessage()) && tryReactiveAutoUpdate()) {
                        response = YoutubeDL.getInstance().execute(request, (String) null, progressCallback);
                    } else {
                        throw e;
                    }
                }
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
                    if (rawDuration == null) throw new IllegalStateException("Missing M4A duration");
                    durationMs = Long.parseLong(rawDuration);
                } catch (Exception validationError) {
                    bridge.getActivity().runOnUiThread(() -> call.reject("conversion: M4A is not decodable"));
                    return;
                } finally {
                    retriever.release();
                }
                if (expectedDuration > 0) {
                    double tolerance = Math.max(5.0, expectedDuration * 0.05);
                    if (Math.abs(durationMs / 1000.0 - expectedDuration) > tolerance) {
                        bridge.getActivity().runOnUiThread(() -> call.reject("candidate_invalid: downloaded duration mismatch"));
                        return;
                    }
                }

                if (skipBase64) {
                    JSObject result = new JSObject();
                    result.put("success", true);
                    result.put("tempPath", outputFile.getAbsolutePath());
                    result.put("fileName", fileName);
                    result.put("size", outputFile.length());
                    keepOutput = true;
                    bridge.getActivity().runOnUiThread(() -> call.resolve(result));
                } else {
                    // Leer archivo completo y codificar en base64 para devolver al bridge JS
                    // IMPORTANTE: usar DataInputStream.readFully() para garantizar lectura completa.
                    // FileInputStream.read() puede devolver menos bytes de los pedidos (bug 88KB).
                    byte[] fileBytes = new byte[(int) outputFile.length()];
                    try (DataInputStream dis = new DataInputStream(new FileInputStream(outputFile))) {
                        dis.readFully(fileBytes);
                    }
                    String base64Data = Base64.encodeToString(fileBytes, Base64.NO_WRAP);

                    JSObject result = new JSObject();
                    result.put("success", true);
                    result.put("data", base64Data);
                    result.put("fileName", fileName);
                    result.put("size", fileBytes.length);
                    bridge.getActivity().runOnUiThread(() -> call.resolve(result));
                }
            } catch (Exception e) {
                keepOutput = false;
                Log.e(TAG, "downloadAudio failed: " + e.getMessage(), e);
                bridge.getActivity().runOnUiThread(() -> call.reject("Download failed: " + e.getMessage()));
            } finally {
                if (!keepOutput && taskDir != null) {
                    deleteRecursively(taskDir);
                }
            }
        });
    }

    @PluginMethod
    public void cleanupTempAudio(PluginCall call) {
        String tempPath = call.getString("tempPath");
        if (tempPath == null || tempPath.isEmpty()) {
            call.reject("Invalid tempPath");
            return;
        }
        executor.execute(() -> {
            try {
                File validated = resolveValidatedTempFile(tempPath, false);
                if (validated == null) {
                    bridge.getActivity().runOnUiThread(() -> call.reject("Invalid tempPath"));
                    return;
                }
                deleteTempFileAndTaskDir(validated);
                JSObject result = new JSObject();
                result.put("success", true);
                bridge.getActivity().runOnUiThread(() -> call.resolve(result));
            } catch (Exception e) {
                Log.w(TAG, "cleanupTempAudio failed: " + e.getMessage());
                bridge.getActivity().runOnUiThread(() -> call.reject("Invalid tempPath"));
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

    /**
     * Guarda audio ya procesado (con ID3 tags) en Music/MHL Music via MediaStore.
     * Recibe: fileName (string), tempPath (string opcional) o data (base64 string opcional)
     * Devuelve: uri (string)
     */
    @PluginMethod
    public void tagAndSaveM4A(PluginCall call) {
        String fileName = call.getString("fileName");
        String base64Data = call.getString("data");
        String tempPath = call.getString("tempPath");
        String coverUrl = call.getString("coverUrl");
        String title = call.getString("title", "");
        String artist = call.getString("artist", "");
        String album = call.getString("album", "");
        String lyrics = call.getString("lyrics", "");
        String albumArtist = call.getString("albumArtist", "");
        String composer = call.getString("composer", "");
        String genre = call.getString("genre", "");
        String year = call.getString("year", "");
        String trackNumber = call.getString("trackNumber", "");
        String trackTotal = call.getString("trackTotal", "");
        String discNumber = call.getString("discNumber", "");
        String discTotal = call.getString("discTotal", "");

        boolean hasTempPath = tempPath != null && !tempPath.isEmpty();
        boolean hasBase64Data = base64Data != null && !base64Data.isEmpty();
        if (fileName == null || fileName.isEmpty() || (!hasTempPath && !hasBase64Data)) {
            call.reject("fileName and either tempPath or data are required");
            return;
        }

        executor.execute(() -> {
            File tempAudio = null;
            File tempCover = null;
            boolean fromTempPath = false;
            try {
                boolean isMp3 = fileName.toLowerCase().endsWith(".mp3");
                if (hasTempPath) {
                    File validated = resolveValidatedTempFile(tempPath, true);
                    if (validated == null) {
                        bridge.getActivity().runOnUiThread(() -> call.reject("Invalid tempPath"));
                        return;
                    }
                    tempAudio = validated;
                    fromTempPath = true;
                } else {
                    // Escribir audio base64 a archivo temporal
                    tempAudio = File.createTempFile("untagged", isMp3 ? ".mp3" : ".m4a", getContext().getCacheDir());
                    byte[] audioBytes = Base64.decode(base64Data, Base64.NO_WRAP);
                    try (FileOutputStream fos = new FileOutputStream(tempAudio)) {
                        fos.write(audioBytes);
                    }
                }

                // Descargar cover si existe (con caché LRU y timeouts)
                if (coverUrl != null && !coverUrl.isEmpty()) {
                    byte[] coverBytes = fetchCoverBytes(coverUrl);
                    if (coverBytes != null && coverBytes.length > 0) {
                        String coverExt = isPngBytes(coverBytes) ? ".png" : ".jpg";
                        tempCover = File.createTempFile("cover", coverExt, getContext().getCacheDir());
                        try (FileOutputStream fos = new FileOutputStream(tempCover)) {
                            fos.write(coverBytes);
                        }
                    }
                }

                // Tag usando jaudiotagger (MP3 ID3v2.3 o M4A MP4Tag)
                try {
                    org.jaudiotagger.audio.AudioFile audioFile = org.jaudiotagger.audio.AudioFileIO.read(tempAudio);
                    org.jaudiotagger.tag.Tag tag = audioFile.getTag();
                    if (tag == null) {
                        tag = isMp3 ? new org.jaudiotagger.tag.id3.ID3v23Tag() : new org.jaudiotagger.tag.mp4.Mp4Tag();
                        audioFile.setTag(tag);
                    }
                    if (title != null && !title.isEmpty()) tag.setField(org.jaudiotagger.tag.FieldKey.TITLE, title);
                    if (artist != null && !artist.isEmpty()) tag.setField(org.jaudiotagger.tag.FieldKey.ARTIST, artist);
                    if (album != null && !album.isEmpty()) tag.setField(org.jaudiotagger.tag.FieldKey.ALBUM, album);
                    if (albumArtist != null && !albumArtist.isEmpty()) tag.setField(org.jaudiotagger.tag.FieldKey.ALBUM_ARTIST, albumArtist);
                    if (composer != null && !composer.isEmpty()) tag.setField(org.jaudiotagger.tag.FieldKey.COMPOSER, composer);
                    if (genre != null && !genre.isEmpty()) tag.setField(org.jaudiotagger.tag.FieldKey.GENRE, genre);
                    if (year != null && !year.isEmpty()) tag.setField(org.jaudiotagger.tag.FieldKey.YEAR, year);
                    if (trackNumber != null && !trackNumber.isEmpty()) tag.setField(org.jaudiotagger.tag.FieldKey.TRACK, trackNumber);
                    if (trackTotal != null && !trackTotal.isEmpty()) tag.setField(org.jaudiotagger.tag.FieldKey.TRACK_TOTAL, trackTotal);
                    if (discNumber != null && !discNumber.isEmpty()) tag.setField(org.jaudiotagger.tag.FieldKey.DISC_NO, discNumber);
                    if (discTotal != null && !discTotal.isEmpty()) tag.setField(org.jaudiotagger.tag.FieldKey.DISC_TOTAL, discTotal);
                    if (lyrics != null && !lyrics.isEmpty()) tag.setField(org.jaudiotagger.tag.FieldKey.LYRICS, lyrics);

                    if (tempCover != null && tempCover.length() > 0) {
                        try {
                            org.jaudiotagger.tag.images.Artwork artwork = org.jaudiotagger.tag.images.ArtworkFactory.createArtworkFromFile(tempCover);
                            tag.deleteArtworkField();
                            tag.setField(artwork);
                        } catch (Exception coverErr) {
                            Log.w(TAG, "Skipping invalid artwork: " + coverErr.getMessage());
                        }
                    }
                    org.jaudiotagger.audio.AudioFileIO.write(audioFile);
                } catch (Exception e) {
                    Log.w(TAG, "Failed to tag audio with jaudiotagger", e);
                }

                // Guardar en MediaStore
                ContentValues values = new ContentValues();
                values.put(MediaStore.Audio.Media.DISPLAY_NAME, fileName);
                values.put(MediaStore.Audio.Media.MIME_TYPE, isMp3 ? "audio/mpeg" : "audio/mp4");
                values.put(MediaStore.Audio.Media.RELATIVE_PATH, "Music/MHL Music");
                values.put(MediaStore.Audio.Media.IS_PENDING, 1);
                if (title != null && !title.isEmpty()) values.put(MediaStore.Audio.Media.TITLE, title);
                if (artist != null && !artist.isEmpty()) values.put(MediaStore.Audio.Media.ARTIST, artist);
                if (album != null && !album.isEmpty()) values.put(MediaStore.Audio.Media.ALBUM, album);
                if (albumArtist != null && !albumArtist.isEmpty()) values.put(MediaStore.Audio.Media.ALBUM_ARTIST, albumArtist);
                if (composer != null && !composer.isEmpty()) values.put(MediaStore.Audio.Media.COMPOSER, composer);
                if (genre != null && !genre.isEmpty()) values.put(MediaStore.Audio.Media.GENRE, genre);
                if (year != null && !year.isEmpty()) {
                    try {
                        values.put(MediaStore.Audio.Media.YEAR, Integer.parseInt(year));
                    } catch (Exception ignored) {}
                }
                if (trackNumber != null && !trackNumber.isEmpty()) {
                    try {
                        values.put(MediaStore.Audio.Media.TRACK, Integer.parseInt(trackNumber));
                    } catch (Exception ignored) {}
                }

                ContentResolver resolver = getContext().getContentResolver();
                Uri itemUri = null;
                try {
                    itemUri = resolver.insert(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, values);

                    if (itemUri == null) {
                        bridge.getActivity().runOnUiThread(() -> call.reject("MediaStore insert failed"));
                        return;
                    }

                    try (OutputStream os = resolver.openOutputStream(itemUri);
                         FileInputStream in = new FileInputStream(tempAudio)) {
                        byte[] buffer = new byte[8192];
                        int len;
                        while ((len = in.read(buffer)) > 0) {
                            os.write(buffer, 0, len);
                        }
                    }

                    values.clear();
                    values.put(MediaStore.Audio.Media.IS_PENDING, 0);
                    resolver.update(itemUri, values, null, null);

                    Log.i(TAG, "Saved tagged " + fileName + " to Music/MHL Music");

                    JSObject result = new JSObject();
                    result.put("success", true);
                    result.put("uri", itemUri.toString());
                    bridge.getActivity().runOnUiThread(() -> call.resolve(result));
                } catch (Throwable writeErr) {
                    if (itemUri != null) {
                        try {
                            resolver.delete(itemUri, null, null);
                        } catch (Exception ignored) {}
                    }
                    throw writeErr;
                }
            } catch (Throwable e) {
                Log.e(TAG, "tagAndSaveM4A failed", e);
                bridge.getActivity().runOnUiThread(() -> call.reject(e.getMessage() != null ? e.getMessage() : "Tagging failed"));
            } finally {
                if (tempAudio != null) {
                    if (fromTempPath) {
                        deleteTempFileAndTaskDir(tempAudio);
                    } else {
                        tempAudio.delete();
                    }
                }
                if (tempCover != null) tempCover.delete();
            }
        });
    }

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

    private static String buildVideoFormatSelector(String quality, String codec) {
        String h = "720p".equals(quality)
            ? "[height<=720]"
            : "1080p".equals(quality)
                ? "[height<=1080]"
                : "";
        if ("av1".equals(codec)) {
            return "bestvideo[vcodec^=av01]" + h + "+bestaudio[ext=m4a]/"
                + "bestvideo[vcodec^=avc1]" + h + "+bestaudio[ext=m4a]/"
                + "bestvideo[ext=mp4]" + h + "+bestaudio[ext=m4a]/"
                + "best[ext=mp4]" + h + "/best" + h;
        }
        return "bestvideo[vcodec^=avc1]" + h + "+bestaudio[ext=m4a]/"
            + "bestvideo[ext=mp4]" + h + "+bestaudio[ext=m4a]/"
            + "best[ext=mp4]" + h + "/best" + h;
    }

    private static String sanitizeVideoFileName(String rawName, String fallbackId) {
        String cleaned = rawName == null ? "" : rawName.replaceAll("[<>:\"/\\\\|?*\\x00-\\x1f]", "_").trim();
        while (cleaned.startsWith(".") || cleaned.endsWith(".")) {
            cleaned = cleaned.replaceAll("^\\.+|\\.+$", "").trim();
        }
        if (cleaned.isEmpty()) {
            cleaned = fallbackId + ".mp4";
        } else if (!cleaned.toLowerCase(Locale.ROOT).endsWith(".mp4")) {
            cleaned = cleaned + ".mp4";
        }
        if (cleaned.length() > 120) {
            cleaned = cleaned.substring(0, 116) + ".mp4";
        }
        return cleaned;
    }

    @PluginMethod
    public void downloadVideo(PluginCall call) {
        String rawVideoId = call.getString("videoId");
        String videoId = rawVideoId != null ? rawVideoId.trim() : "";
        if (!STRICT_VIDEO_ID_PATTERN.matcher(videoId).matches()) {
            call.reject("Invalid videoId format");
            return;
        }

        String rawQuality = call.getString("quality", "1080p");
        String quality = rawQuality != null ? rawQuality.trim().toLowerCase(Locale.ROOT) : "1080p";
        if (!"720p".equals(quality) && !"1080p".equals(quality) && !"best".equals(quality)) {
            quality = "1080p";
        }

        String rawCodec = call.getString("codec", "av1");
        String codec = rawCodec != null ? rawCodec.trim().toLowerCase(Locale.ROOT) : "av1";
        if (!"av1".equals(codec) && !"h264".equals(codec)) {
            codec = "av1";
        }

        String finalFileName = sanitizeVideoFileName(call.getString("fileName"), videoId);
        String downloadId = call.getString("downloadId");

        final String selectedQuality = quality;
        final String selectedCodec = codec;
        videoExecutor.execute(() -> {
            File taskDir = null;
            try {
                ensureInitialized();

                File cacheDir = new File(getContext().getCacheDir(), "ytdlp_video");
                cacheDir.mkdirs();
                taskDir = new File(cacheDir, UUID.randomUUID().toString());
                taskDir.mkdirs();

                File tempVideo = new File(taskDir, "video_" + System.currentTimeMillis() + ".mp4");
                String url = "https://www.youtube.com/watch?v=" + videoId;
                YoutubeDLRequest request = new YoutubeDLRequest(url);
                request.addOption("-f", buildVideoFormatSelector(selectedQuality, selectedCodec));
                request.addOption("--merge-output-format", "mp4");
                request.addOption("--no-playlist");
                request.addOption("--no-part");
                request.addOption("--concurrent-fragments", "4");
                request.addOption("--socket-timeout", "20");
                request.addOption("--retries", "2");
                request.addOption("--fragment-retries", "2");
                request.addOption("--extractor-args", "youtube:player_client=android,web");
                request.addOption("-o", tempVideo.getAbsolutePath());

                kotlin.jvm.functions.Function3<Float, Long, String, kotlin.Unit> progressCallback =
                    new kotlin.jvm.functions.Function3<Float, Long, String, kotlin.Unit>() {
                        @Override
                        public kotlin.Unit invoke(Float progress, Long etaInSeconds, String line) {
                            try {
                                if (progress == null || progress < 0f) {
                                    return kotlin.Unit.INSTANCE;
                                }
                                int clampedProgress = Math.max(0, Math.min(100, Math.round(progress)));
                                JSObject data = new JSObject();
                                data.put("progress", clampedProgress);
                                data.put("eta", etaInSeconds);
                                data.put("speed", parseSpeed(line));
                                if (downloadId != null && !downloadId.isEmpty()) {
                                    data.put("downloadId", downloadId);
                                }
                                notifyListeners("downloadProgress", data);
                            } catch (Exception ignored) {}
                            return kotlin.Unit.INSTANCE;
                        }
                    };

                try {
                    YoutubeDL.getInstance().execute(request, (String) null, progressCallback);
                } catch (Exception e) {
                    if (isOutdatedYtDlpError(e.getMessage()) && tryReactiveAutoUpdate()) {
                        YoutubeDL.getInstance().execute(request, (String) null, progressCallback);
                    } else {
                        throw e;
                    }
                }

                if (!tempVideo.exists() || tempVideo.length() == 0) {
                    bridge.getActivity().runOnUiThread(() -> call.reject("Downloaded video file not found"));
                    return;
                }

                long fileSize = tempVideo.length();
                String resultUriStr;

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.Video.Media.DISPLAY_NAME, finalFileName);
                    values.put(MediaStore.Video.Media.MIME_TYPE, "video/mp4");
                    values.put(MediaStore.Video.Media.RELATIVE_PATH, Environment.DIRECTORY_MOVIES + "/MHL Music");
                    values.put(MediaStore.Video.Media.IS_PENDING, 1);

                    ContentResolver resolver = getContext().getContentResolver();
                    Uri itemUri = resolver.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, values);
                    if (itemUri == null) {
                        bridge.getActivity().runOnUiThread(() -> call.reject("MediaStore Video insert failed"));
                        return;
                    }
                    try {
                        try (OutputStream os = resolver.openOutputStream(itemUri);
                             FileInputStream in = new FileInputStream(tempVideo)) {
                            if (os == null) {
                                throw new IOException("Cannot open MediaStore Video OutputStream");
                            }
                            byte[] buffer = new byte[16384];
                            int len;
                            while ((len = in.read(buffer)) > 0) {
                                os.write(buffer, 0, len);
                            }
                        }
                        values.clear();
                        values.put(MediaStore.Video.Media.IS_PENDING, 0);
                        resolver.update(itemUri, values, null, null);
                        resultUriStr = itemUri.toString();
                    } catch (Throwable writeErr) {
                        try {
                            resolver.delete(itemUri, null, null);
                        } catch (Exception ignored) {}
                        throw writeErr;
                    }
                } else {
                    File moviesDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MOVIES);
                    File targetDir = new File(moviesDir, "MHL Music");
                    targetDir.mkdirs();
                    File destFile = new File(targetDir, finalFileName);
                    try (FileInputStream in = new FileInputStream(tempVideo);
                         FileOutputStream os = new FileOutputStream(destFile)) {
                        byte[] buffer = new byte[16384];
                        int len;
                        while ((len = in.read(buffer)) > 0) {
                            os.write(buffer, 0, len);
                        }
                    }
                    resultUriStr = Uri.fromFile(destFile).toString();
                }

                JSObject result = new JSObject();
                result.put("success", true);
                result.put("uri", resultUriStr);
                result.put("fileName", finalFileName);
                result.put("size", fileSize);
                bridge.getActivity().runOnUiThread(() -> call.resolve(result));
            } catch (Throwable e) {
                Log.e(TAG, "downloadVideo failed", e);
                String msg = e.getMessage() != null ? e.getMessage() : "Video download failed";
                bridge.getActivity().runOnUiThread(() -> call.reject(msg));
            } finally {
                if (taskDir != null) {
                    deleteRecursively(taskDir);
                }
            }
        });
    }

}
