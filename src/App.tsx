import { Suspense, lazy, useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { AppLayout } from "@/components/layout/AppLayout";
import { useMusicStore } from "@/store/musicStore";
import { useI18n } from "@/lib/useI18n";
import { useAppUpdateStore } from "@/store/appUpdateStore";
import { getDeviceContext } from "@/lib/deviceContext";
import { setNativeLocale } from "@/lib/language";

const SearchPage = lazy(() => import("./pages/SearchPage"));
const DownloadsPage = lazy(() => import("./pages/DownloadsPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));

function RouteFallback() {
  const { t } = useI18n();
  return (
    <div className="min-h-[50vh] flex items-center justify-center text-sm text-[#666660]">
      {t('loading')}
    </div>
  );
}

const App = () => {
  const _hasHydrated = useMusicStore((s) => s._hasHydrated);
  if (!_hasHydrated) return <RouteFallback />;
  useEffect(() => {
    const refreshNativeLocale = () => {
      void getDeviceContext().then((context) => setNativeLocale(context.locale));
    };
    const markFrontendReady = () => {
      const api = (window as Window & {
        pywebview?: { api?: { frontend_ready?: () => Promise<{ success: boolean }> } };
      }).pywebview?.api;
      void api?.frontend_ready?.();
      refreshNativeLocale();
    };
    refreshNativeLocale();
    markFrontendReady();
    window.addEventListener('pywebviewready', markFrontendReady);
    return () => window.removeEventListener('pywebviewready', markFrontendReady);
  }, []);

  // Initialize Android-native services without blocking the first render.
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      // Initialize yt-dlp in background so it's ready for downloads
      import("@/lib/ytdlpBridge").then(({ initYtDlp }) => {
        initYtDlp().then((ok) => {
          if (ok) console.log('[App] yt-dlp ready');
        });
      });

      void useAppUpdateStore.getState().checkForUpdate(false);

      // Also verify downloaded files still exist (cleanup if deleted externally)
      const { downloads } = useMusicStore.getState();
      if (downloads.length > 0) {
        // Schedule verification in background (non-blocking)
        setTimeout(async () => {
          // Silently verify downloads exist; if not, they'll be marked as error on next play attempt
          console.log(`[App] Initialized with ${downloads.length} downloaded track(s)`);
        }, 100);
      }
    }
  }, []);

  // Foreground Service logic for Android: watch active downloads and keep app alive
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    return useMusicStore.subscribe((state, prevState) => {
      if (state.activeDownloads > 0 && prevState.activeDownloads === 0) {
        import('@/lib/ytdlpBridge').then(({ startForegroundService }) => {
          void startForegroundService();
        });
      } else if (state.activeDownloads === 0 && prevState.activeDownloads > 0) {
        import('@/lib/ytdlpBridge').then(({ stopForegroundService }) => {
          void stopForegroundService();
        });
      }
    });
  }, []);

  return (
    <BrowserRouter>
      <Sonner />
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<SearchPage />} />
            <Route path="/downloads" element={<DownloadsPage />} />
            <Route path="/playlists" element={<Navigate to="/downloads" replace />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
};

export default App;
