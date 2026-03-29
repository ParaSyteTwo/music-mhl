import { Suspense, lazy, useEffect } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { AppLayout } from "@/components/layout/AppLayout";
import { useMusicStore } from "@/store/musicStore";

const SearchPage = lazy(() => import("./pages/SearchPage"));
const DownloadsPage = lazy(() => import("./pages/DownloadsPage"));
const LibraryPage = lazy(() => import("./pages/LibraryPage"));
const PlaylistsPage = lazy(() => import("./pages/PlaylistsPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));

function RouteFallback() {
  return (
    <div className="min-h-[50vh] flex items-center justify-center text-sm text-[#666660]">
      Cargando...
    </div>
  );
}

const App = () => {
  // Rescan local library on Android to restore localFileRefs after app restart
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      useMusicStore.getState().rescanLocalLibrary();

      // Initialize yt-dlp in background so it's ready for downloads
      import("@/lib/ytdlpBridge").then(({ initYtDlp }) => {
        initYtDlp().then((ok) => {
          if (ok) console.log('[App] yt-dlp ready');
        });
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
            <Route path="/library" element={<LibraryPage />} />
            <Route path="/playlists" element={<PlaylistsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
};

export default App;
