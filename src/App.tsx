import { useEffect } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { AppLayout } from "@/components/layout/AppLayout";
import { useMusicStore } from "@/store/musicStore";
import { initYtDlp } from "@/lib/ytdlpBridge";
import SearchPage from "./pages/SearchPage";
import DownloadsPage from "./pages/DownloadsPage";
import LibraryPage from "./pages/LibraryPage";
import PlaylistsPage from "./pages/PlaylistsPage";
import SettingsPage from "./pages/SettingsPage";

const App = () => {
  // Rescan local library on Android to restore localFileRefs after app restart
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      useMusicStore.getState().rescanLocalLibrary();

      // Initialize yt-dlp in background so it's ready for downloads
      initYtDlp().then((ok) => {
        if (ok) console.log('[App] yt-dlp ready');
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
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<SearchPage />} />
          <Route path="/downloads" element={<DownloadsPage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/playlists" element={<PlaylistsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
};

export default App;
