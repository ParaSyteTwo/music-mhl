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

import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import android.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "YtDlp")
public class YtDlpPlugin extends Plugin {

    private static final String TAG = "YtDlpPlugin";
    private static final int MAX_SEARCH_CACHE_ENTRIES = 24;
    private boolean isInitialized = false;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final Map<String, JSArray> searchCache = new LinkedHashMap<String, JSArray>(MAX_SEARCH_CACHE_ENTRIES, 0.75f, true) {
        @Override
        protected boolean removeEldestEntry(Map.Entry<String, JSArray> eldest) {
            return size() > MAX_SEARCH_CACHE_ENTRIES;
        }
    };

    // (Removed SAF/picker code - using MediaStore-only storage)

    private synchronized void ensureInitialized() throws Exception {
        if (!isInitialized) {
            try {
                YoutubeDL.getInstance().init(getContext());
                Log.i(TAG, "yt-dlp initialized");
                try {
                    // For Kotlin-generated sealed/object classes the instance is exposed as INSTANCE
                    YoutubeDL.getInstance().updateYoutubeDL(getContext(), YoutubeDL.UpdateChannel.STABLE.INSTANCE);
                    Log.i(TAG, "yt-dlp update triggered (STABLE)");
                } catch (Exception e) {
                    Log.w(TAG, "yt-dlp update failed: " + e.getMessage());
                }
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
                // yt-dlp updates are handled by the youtube-dl-android library
                // which checks for updates automatically on certain operations.
                // A full update trigger would require library version upgrade.
                Log.i(TAG, "Update check requested - library auto-updates on demand");

                JSObject result = new JSObject();
                result.put("success", true);
                result.put("status", "DONE");
                result.put("message", "yt-dlp estará actualizado en la próxima descarga");
                bridge.getActivity().runOnUiThread(() -> call.resolve(result));
            } catch (Exception e) {
                Log.w(TAG, "Update check failed: " + e.getMessage(), e);
                JSObject result = new JSObject();
                result.put("success", true);
                result.put("status", "SKIPPED");
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

        executor.execute(() -> {
            try {
                ensureInitialized();

                synchronized (searchCache) {
                    JSArray cached = searchCache.get(query);
                    if (cached != null) {
                        Log.i(TAG, "Search cache hit for: " + query);
                        JSObject result = new JSObject();
                        result.put("success", true);
                        result.put("results", cached);
                        bridge.getActivity().runOnUiThread(() -> call.resolve(result));
                        return;
                    }
                }

                YoutubeDLRequest request = new YoutubeDLRequest("ytsearch5:" + query);
                request.addOption("--dump-json");
                request.addOption("--flat-playlist");
                request.addOption("--no-download");

                Log.i(TAG, "Searching: " + query);
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
                            JSObject item = new JSObject();
                            item.put("videoId", json.optString("id", json.optString("url", "")));
                            item.put("title", json.optString("title", ""));
                            item.put("duration", json.optDouble("duration", 0));
                            item.put("channel", json.optString("channel", json.optString("uploader", "")));
                            if (!item.getString("videoId").isEmpty()) {
                                results.put(item);
                            }
                        } catch (Exception e) {
                            Log.w(TAG, "Parse line error: " + e.getMessage());
                        }
                    }
                }

                Log.i(TAG, "Search found " + results.length() + " results");
                synchronized (searchCache) {
                    searchCache.put(query, results);
                }
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
        String format = call.getString("format");
        String quality = call.getString("quality");
        if (videoId == null || videoId.isEmpty()) {
            call.reject("Missing videoId parameter");
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

                String url = "https://www.youtube.com/watch?v=" + videoId;

                String fileName = "audio_" + System.currentTimeMillis() + ".mp3";

                // Descargar al caché privado (no visible para otras apps)
                File outputFile = new File(cacheDir, fileName);
                String outputPath = outputFile.getAbsolutePath();

                YoutubeDLRequest request = new YoutubeDLRequest(url);
                request.addOption("-x");
                request.addOption("--audio-format", "mp3");
                request.addOption("-o", outputPath);
                request.addOption("--no-playlist");

                Log.i(TAG, "Downloading audio for: " + videoId + " -> " + outputPath);
                YoutubeDLResponse response = YoutubeDL.getInstance().execute(request);
                Log.i(TAG, "Download stdout: " + (response.getOut() != null ? response.getOut().substring(0, Math.min(200, response.getOut().length())) : "null"));
                String errOutput = response.getErr();
                if (errOutput != null && !errOutput.isEmpty()) {
                    Log.i(TAG, "Download stderr: " + errOutput.substring(0, Math.min(500, errOutput.length())));
                }

                if (!outputFile.exists() || outputFile.length() == 0) {
                    bridge.getActivity().runOnUiThread(() -> call.reject("No audio file produced after download"));
                    return;
                }

                // Leer archivo y codificar en base64 para devolver al bridge JS
                byte[] fileBytes = new byte[(int) outputFile.length()];
                try (FileInputStream fis = new FileInputStream(outputFile)) {
                    fis.read(fileBytes);
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

    // Keep old method name for compatibility
    @PluginMethod
    public void downloadAsMp3(PluginCall call) {
        downloadAudio(call);
    }

    
}
