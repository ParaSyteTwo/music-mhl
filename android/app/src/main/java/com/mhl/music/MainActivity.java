package com.mhl.music;

import android.content.SharedPreferences;
import android.os.Build;
import android.os.Bundle;
import android.webkit.ServiceWorkerController;
import android.webkit.WebSettings;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String MIGRATION_PREFERENCES = "mhl_native_migrations";
    private static final String PWA_CACHE_CLEANUP_PREFIX = "pwa_cache_cleanup_";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        if (BuildConfig.MHL_EMULATOR_BUILD) {
            WebView.setWebContentsDebuggingEnabled(true);
        }
        registerPlugin(YtDlpPlugin.class);
        registerPlugin(OpenFilePlugin.class);
        registerPlugin(AppUpdaterPlugin.class);
        registerPlugin(DeviceContextPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    protected void load() {
        SharedPreferences migrations = getSharedPreferences(
            MIGRATION_PREFERENCES,
            MODE_PRIVATE
        );
        String cleanupKey = PWA_CACHE_CLEANUP_PREFIX + BuildConfig.VERSION_CODE;
        boolean requiresCleanup = !migrations.getBoolean(cleanupKey, false);
        WebView webView = findViewById(com.getcapacitor.android.R.id.webview);

        if (requiresCleanup) {
            webView.clearCache(true);
            webView.getSettings().setCacheMode(WebSettings.LOAD_NO_CACHE);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                ServiceWorkerController
                    .getInstance()
                    .getServiceWorkerWebSettings()
                    .setCacheMode(WebSettings.LOAD_NO_CACHE);
            }
        }

        super.load();

        if (requiresCleanup) {
            bridge.getWebView().postDelayed(() ->
                bridge.getWebView().evaluateJavascript(
                    "(()=>{" +
                    "(async()=>{" +
                    "if('serviceWorker' in navigator){" +
                    "const registrations=await navigator.serviceWorker.getRegistrations();" +
                    "await Promise.all(registrations.map(item=>item.unregister()));" +
                    "}" +
                    "if('caches' in window){" +
                    "const keys=await caches.keys();" +
                    "await Promise.all(keys.map(key=>caches.delete(key)));" +
                    "}" +
                    "window.location.reload();" +
                    "})().catch(()=>window.location.reload());" +
                    "return true;" +
                    "})()",
                    result -> {
                        if (!"true".equals(result)) return;
                        migrations.edit().putBoolean(cleanupKey, true).apply();
                        bridge.getWebView().getSettings().setCacheMode(WebSettings.LOAD_DEFAULT);
                    }
                ),
                1000
            );
        }
    }
}
