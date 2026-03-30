package com.mhl.music;

import android.util.Base64;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import com.yausername.youtubedl_android.YoutubeDL;
import com.yausername.youtubedl_android.YoutubeDLRequest;
import com.yausername.youtubedl_android.YoutubeDLResponse;
import com.yausername.ffmpeg.FFmpeg;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
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

    @PluginMethod
    public void initialize(PluginCall call) {
        executor.execute(() -> {
            try {
                ensureInitialized();

                JSObject result = new JSObject();
                result.put("success", true);
                call.resolve(result);
            } catch (Exception e) {
                Log.e(TAG, "Init failed", e);
                call.reject("Failed to initialize yt-dlp: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void update(PluginCall call) {
        executor.execute(() -> {
            try {
                ensureInitialized();
                // Try updating yt-dlp binary
                YoutubeDL.getInstance().updateYoutubeDL(getContext(), YoutubeDL.UpdateChannel.STABLE.INSTANCE);
                JSObject result = new JSObject();
                result.put("success", true);
                result.put("status", "DONE");
                call.resolve(result);
            } catch (Exception e) {
                Log.w(TAG, "Update failed (non-critical): " + e.getMessage());
                // Update failure is not critical — resolve anyway
                JSObject result = new JSObject();
                result.put("success", true);
                result.put("status", "SKIPPED");
                call.resolve(result);
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
                        call.resolve(result);
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
                call.resolve(result);
            } catch (Exception e) {
                Log.e(TAG, "Search failed: " + e.getMessage(), e);
                call.reject("Search failed: " + e.getMessage());
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
                    call.reject("No stream URL found");
                    return;
                }

                Log.i(TAG, "Got stream URL length: " + streamUrl.length());
                JSObject result = new JSObject();
                result.put("success", true);
                result.put("url", streamUrl);
                call.resolve(result);
            } catch (Exception e) {
                Log.e(TAG, "getStreamUrl failed: " + e.getMessage(), e);
                call.reject("Stream extraction failed: " + e.getMessage());
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
                String outputTemplate = new File(cacheDir, videoId + ".%(ext)s").getAbsolutePath();

                YoutubeDLRequest request = new YoutubeDLRequest(url);
                if (format != null && format.equalsIgnoreCase("aac")) {
                    // Prefer m4a containers (AAC) if available
                    request.addOption("-f", "bestaudio[ext=m4a]/bestaudio");
                    // No extraction (-x) so original container kept
                } else {
                    // Default: mp3 conversion
                    request.addOption("-f", "bestaudio");
                    request.addOption("-x");
                    request.addOption("--audio-format", "mp3");
                    // Map quality words to yt-dlp numeric scale (lower is better)
                    String q = "2";
                    if (quality != null) {
                        if (quality.equalsIgnoreCase("alta")) q = "2";
                        else if (quality.equalsIgnoreCase("media")) q = "5";
                        else if (quality.equalsIgnoreCase("baja")) q = "9";
                    }
                    request.addOption("--audio-quality", q);
                }
                request.addOption("-o", outputTemplate);
                request.addOption("--no-playlist");
                request.addOption("--no-part"); // Don't use .part files

                Log.i(TAG, "Downloading audio for: " + videoId);
                YoutubeDLResponse response = YoutubeDL.getInstance().execute(request);
                Log.i(TAG, "Download stdout: " + (response.getOut() != null ? response.getOut().substring(0, Math.min(200, response.getOut().length())) : "null"));
                String errOutput = response.getErr();
                if (errOutput != null && !errOutput.isEmpty()) {
                    Log.i(TAG, "Download stderr: " + errOutput.substring(0, Math.min(500, errOutput.length())));
                }

                // Find any audio file produced
                File outputFile = null;

                // First try exact mp3
                File mp3File = new File(cacheDir, videoId + ".mp3");
                if (mp3File.exists() && mp3File.length() > 0) {
                    outputFile = mp3File;
                    Log.i(TAG, "Found MP3: " + mp3File.length() + " bytes");
                }

                // If no mp3, check for any file
                if (outputFile == null) {
                    File[] allFiles = cacheDir.listFiles();
                    if (allFiles != null) {
                        for (File f : allFiles) {
                            Log.i(TAG, "Found file: " + f.getName() + " (" + f.length() + " bytes)");
                            if (f.length() > 0) {
                                outputFile = f;
                                break;
                            }
                        }
                    }
                }

                if (outputFile == null || !outputFile.exists() || outputFile.length() == 0) {
                    call.reject("No audio file produced after download");
                    return;
                }

                Log.i(TAG, "Reading file: " + outputFile.getName() + " (" + outputFile.length() + " bytes)");

                // Read file as base64
                byte[] fileData = readFileBytes(outputFile);
                String base64 = Base64.encodeToString(fileData, Base64.NO_WRAP);

                // Cleanup
                File[] cleanup = cacheDir.listFiles();
                if (cleanup != null) {
                    for (File f : cleanup) f.delete();
                }

                JSObject result = new JSObject();
                result.put("success", true);
                result.put("data", base64);
                result.put("size", fileData.length);
                result.put("fileName", outputFile.getName());
                call.resolve(result);
            } catch (Exception e) {
                Log.e(TAG, "downloadAudio failed: " + e.getMessage(), e);
                call.reject("Download failed: " + e.getMessage());
            }
        });
    }

    // Keep old method name for compatibility
    @PluginMethod
    public void downloadAsMp3(PluginCall call) {
        downloadAudio(call);
    }

    private byte[] readFileBytes(File file) throws Exception {
        FileInputStream fis = new FileInputStream(file);
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int len;
        while ((len = fis.read(buffer)) != -1) {
            bos.write(buffer, 0, len);
        }
        fis.close();
        return bos.toByteArray();
    }
}
