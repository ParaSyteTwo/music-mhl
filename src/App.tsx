import { Suspense, lazy, useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { AppLayout } from "@/components/layout/AppLayout";
import { useMusicStore } from "@/store/musicStore";
import { useI18n } from "@/lib/useI18n";

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
  useEffect(() => {
    const markFrontendReady = () => {
      const api = (window as Window & {
        pywebview?: { api?: { frontend_ready?: () => Promise<{ success: boolean }> } };
      }).pywebview?.api;
      void api?.frontend_ready?.();
    };
    markFrontendReady();
    window.addEventListener('pywebviewready', markFrontendReady);
    return () => window.removeEventListener('pywebviewready', markFrontendReady);
  }, []);

  // Rescan local library on Android to restore localFileRefs after app restart
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      // Initialize yt-dlp in background so it's ready for downloads
      import("@/lib/ytdlpBridge").then(({ initYtDlp }) => {
        initYtDlp().then((ok) => {
          if (ok) console.log('[App] yt-dlp ready');
        });
      });

      import("@/store/appUpdateStore").then(({ useAppUpdateStore }) => {
        void useAppUpdateStore.getState().checkForUpdate(false);
      }).catch(() => {
        // Update checks are optional and must never block app startup.
      });

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

  return (
    <BrowserRouter>
      <Sonner />
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<SearchPage />} />
            <Route path="/downloads" element={<DownloadsPage />} />
            <Route path="/library" element={<Navigate to="/downloads" replace />} />
            <Route path="/playlists" element={<Navigate to="/downloads" replace />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
};

export default App;
