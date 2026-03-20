import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Track, Download, LocalTrack } from '@/types/music';
import { audioEngine } from '@/lib/audioEngine';
import { searchDeezer, downloadTrackAudio } from '@/lib/api/musicApi';
import { writeID3Tags } from '@/lib/id3Writer';
import { parseLocalFiles } from '@/lib/metadataEnricher';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { toast } from 'sonner';

function getProgressLabel(progress: number): string {
  if (progress >= 100) return '✓ Completado';
  if (progress >= 90) return 'Guardando archivo...';
  if (progress >= 70) return 'Escribiendo metadatos...';
  if (progress >= 30) return 'Obteniendo audio...';
  return 'Buscando en YouTube...';
}

export { getProgressLabel };

interface MusicStore {
  // Player
  currentTrack: Track | null;
  isPlaying: boolean;
  isLoading: boolean;
  volume: number;
  progress: number;
  duration: number;

  playTrack: (track: Track) => void;
  togglePlay: () => void;
  setVolume: (v: number) => void;
  seekTo: (time: number) => void;

  // Search
  searchQuery: string;
  searchResults: Track[];
  isSearching: boolean;
  searchOffset: number;
  hasMoreResults: boolean;
  isLoadingMore: boolean;
  performSearch: (query: string) => Promise<void>;
  loadMoreResults: () => Promise<void>;

  // Downloads
  downloads: Download[];
  startDownload: (track: Track) => void;
  removeDownload: (id: string) => void;

  // Download folder (web only, not persisted across sessions)
  downloadFolder: FileSystemDirectoryHandle | null;
  downloadFolderName: string;
  setDownloadFolder: (handle: FileSystemDirectoryHandle, name: string) => void;
  clearDownloadFolder: () => void;

  // Dynamic color
  dominantColor: string | null;
  setDominantColor: (color: string | null) => void;

  // ─── Settings ───
  downloadFormat: 'mp3' | 'aac';
  setDownloadFormat: (format: 'mp3' | 'aac') => void;
  mp3Quality: 'alta' | 'media' | 'baja';
  setMp3Quality: (q: 'alta' | 'media' | 'baja') => void;
  downloadWifiOnly: boolean;
  setDownloadWifiOnly: (v: boolean) => void;
  appLanguage: 'es' | 'en';
  setAppLanguage: (lang: 'es' | 'en') => void;

  // ─── Local Library ───
  localLibrary: LocalTrack[];
  localFileRefs: Map<string, File>;
  isImporting: boolean;
  savedLocalPaths: string[];

  importLocalFiles: (files: FileList | File[]) => Promise<void>;
  rescanLocalLibrary: () => Promise<void>;
  playLocalTrack: (id: string) => Promise<void>;
  removeLocalTrack: (id: string) => void;
  clearLocalLibrary: () => void;
  incrementPlayCount: (id: string) => void;
}

// WiFi-only detection (web Network Information API)
function isOnWifi(): boolean {
  try {
    const nav = navigator as any;
    const conn = nav.connection || nav.mozConnection || nav.webkitConnection;
    if (!conn) return true; // unknown → allow
    const type = (conn.type || conn.effectiveType || '').toString().toLowerCase();
    if (!type) return true;
    return type.includes('wifi') || type.includes('ethernet');
  } catch {
    return true;
  }
}

export const useMusicStore = create<MusicStore>()(
  persist(
    (set, get) => {
      audioEngine.onTimeUpdate = (time) => set({ progress: time });

      audioEngine.onCanPlay = () => {
        set({
          isLoading: false,
          duration: audioEngine.duration || get().currentTrack?.duration || 0,
        });
      };

      audioEngine.onEnded = () => set({ isPlaying: false, progress: 0 });

      audioEngine.onError = (error) => {
        console.error('Audio error:', error);
        set({ isLoading: false, isPlaying: false });
      };

      return {
        // ─── Player ───
        currentTrack: null,
        isPlaying: false,
        isLoading: false,
        volume: 0.8,
        progress: 0,
        duration: 0,

        playTrack: (track) => {
          audioEngine.pause();
          set({
            currentTrack: track,
            isPlaying: false,
            isLoading: true,
            progress: 0,
            duration: track.duration,
          });

          document.title = `${track.title} · ${track.artist} — MHL Music`;

          set({ dominantColor: null });

          if (track.preview) {
            audioEngine.load(track.preview);
            audioEngine.setVolume(get().volume);
            audioEngine.updateMediaSession({
              title: track.title,
              artist: track.artist,
              album: track.album,
              artwork: track.cover,
            });
            audioEngine.play()
              .then(() => set({ isPlaying: true, isLoading: false }))
              .catch((error) => {
                console.error('Play failed:', error);
                set({ isLoading: false, isPlaying: false });
                toast.error('No se pudo reproducir la canción');
              });
          } else {
            set({ isLoading: false });
          }
        },

        togglePlay: () => {
          const { isPlaying, currentTrack } = get();
          if (!currentTrack) return;
          if (isPlaying) {
            audioEngine.pause();
            audioEngine.setPlaybackState('paused');
          } else {
            audioEngine.play();
            audioEngine.setPlaybackState('playing');
          }
          set({ isPlaying: !isPlaying });
        },

        setVolume: (v) => {
          audioEngine.setVolume(v);
          set({ volume: v });
        },

        seekTo: (time) => {
          audioEngine.seek(time);
          set({ progress: time });
        },

        // ─── Search ───
        searchQuery: '',
        searchResults: [],
        isSearching: false,
        searchOffset: 0,
        hasMoreResults: true,
        isLoadingMore: false,

        performSearch: async (query) => {
          if (!query.trim()) {
            set({ searchResults: [], isSearching: false, searchQuery: '', searchOffset: 0, hasMoreResults: true });
            document.title = 'MHL Music';
            return;
          }
          set({ isSearching: true, searchQuery: query, searchOffset: 0, hasMoreResults: true });
          try {
            const tracks = await searchDeezer(query, 0, 25);
            set({ searchResults: tracks, isSearching: false, hasMoreResults: tracks.length >= 25 });
            try {
              const stored = JSON.parse(localStorage.getItem('mhl-recent-searches') || '[]') as string[];
              const updated = [query, ...stored.filter((s) => s.toLowerCase() !== query.toLowerCase())].slice(0, 5);
              localStorage.setItem('mhl-recent-searches', JSON.stringify(updated));
            } catch { /* ignore */ }
          } catch (error) {
            console.error('Search error:', error);
            set({ isSearching: false });
          }
        },

        loadMoreResults: async () => {
          const { isLoadingMore, hasMoreResults, searchQuery, searchOffset, searchResults } = get();
          if (isLoadingMore || !hasMoreResults || !searchQuery.trim()) return;
          set({ isLoadingMore: true });
          try {
            const newOffset = searchOffset + 25;
            const tracks = await searchDeezer(searchQuery, newOffset, 25);
            if (tracks.length < 25) set({ hasMoreResults: false });
            const existingIds = new Set(searchResults.map((t) => t.id));
            const newTracks = tracks.filter((t) => !existingIds.has(t.id));
            set({ searchResults: [...searchResults, ...newTracks], searchOffset: newOffset, isLoadingMore: false });
          } catch (error) {
            console.error('Load more error:', error);
            set({ isLoadingMore: false });
          }
        },

        // ─── Downloads ───
        downloads: [],

        startDownload: async (track) => {
          // Check WiFi-only setting
          if (get().downloadWifiOnly && !isOnWifi()) {
            toast.error('Descarga cancelada: solo WiFi activado', { duration: 4000 });
            return;
          }

          const id = `d${Date.now()}`;
          set((s) => ({
            downloads: [...s.downloads, { id, track, progress: 0, status: 'downloading' as const }],
          }));

          const updateDl = (patch: Partial<Download>) =>
            set((s) => ({
              downloads: s.downloads.map((d) => (d.id === id ? { ...d, ...patch } : d)),
            }));

          const { downloadFormat, mp3Quality } = get();
          const maxAttempts = 3;

          for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
              const attemptLabel = maxAttempts > 1 ? ` (intento ${attempt}/${maxAttempts})` : '';
              updateDl({ progress: 10, error: attempt > 1 ? `Reintentando...${attemptLabel}` : undefined });

              const audioBuffer = await downloadTrackAudio(track, (progress) => {
                updateDl({ progress });
              }, { format: downloadFormat, quality: mp3Quality });
              updateDl({ progress: 80 });

              if (downloadFormat === 'mp3') {
                const taggedBlob = await writeID3Tags(audioBuffer, {
                  title: track.title,
                  artist: track.artist,
                  album: track.album,
                  coverUrl: track.cover,
                });
                updateDl({ progress: 95 });

                const fileName = `${track.title} - ${track.artist}.mp3`.replace(/[/\\?%*:|"<>]/g, '');

                if (Capacitor.isNativePlatform()) {
                  const arr = await taggedBlob.arrayBuffer();
                  const base64 = btoa(new Uint8Array(arr).reduce((data, byte) => data + String.fromCharCode(byte), ''));
                  await Filesystem.writeFile({ path: `MHL Music/${fileName}`, data: base64, directory: Directory.Documents, recursive: true });
                } else {
                  const { downloadFolder } = get();
                  if (downloadFolder) {
                    try {
                      const fileHandle = await downloadFolder.getFileHandle(fileName, { create: true });
                      const writable = await fileHandle.createWritable();
                      await writable.write(taggedBlob);
                      await writable.close();
                    } catch {
                      const blobUrl = URL.createObjectURL(taggedBlob);
                      const a = document.createElement('a');
                      a.href = blobUrl;
                      a.download = fileName;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
                    }
                  } else {
                    const blobUrl = URL.createObjectURL(taggedBlob);
                    const a = document.createElement('a');
                    a.href = blobUrl;
                    a.download = fileName;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
                  }
                }
              } else {
                // AAC — save raw buffer as .m4a
                const fileName = `${track.title} - ${track.artist}.m4a`.replace(/[/\\?%*:|"<>]/g, '');
                updateDl({ progress: 95 });

                if (Capacitor.isNativePlatform()) {
                  const base64 = btoa(new Uint8Array(audioBuffer).reduce((data, byte) => data + String.fromCharCode(byte), ''));
                  await Filesystem.writeFile({ path: `MHL Music/${fileName}`, data: base64, directory: Directory.Documents, recursive: true });
                } else {
                  const { downloadFolder } = get();
                  const blob = new Blob([audioBuffer]);
                  if (downloadFolder) {
                    try {
                      const fileHandle = await downloadFolder.getFileHandle(fileName, { create: true });
                      const writable = await fileHandle.createWritable();
                      await writable.write(blob);
                      await writable.close();
                    } catch {
                      const blobUrl = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = blobUrl;
                      a.download = fileName;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
                    }
                  } else {
                    const blobUrl = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = blobUrl;
                    a.download = fileName;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
                  }
                }
              }

              updateDl({ progress: 100, status: 'completed', error: undefined });
              toast.success(`✓ Descargado: ${track.title} - ${track.artist}`, { duration: 4000 });
              return;
            } catch (error) {
              const msg = error instanceof Error ? error.message : 'Download failed';
              console.error(`Download attempt ${attempt}/${maxAttempts} failed:`, msg);

              if (attempt === maxAttempts) {
                updateDl({ status: 'error', error: `Error tras ${maxAttempts} intentos: ${msg}` });
              } else {
                updateDl({
                  status: 'downloading',
                  progress: 0,
                  error: `Reintentando... (intento ${attempt + 1}/${maxAttempts})`,
                });
                await new Promise((resolve) => setTimeout(resolve, 2000));
              }
            }
          }
        },

        removeDownload: (id) =>
          set((s) => ({ downloads: s.downloads.filter((d) => d.id !== id) })),

        // ─── Download Folder ───
        downloadFolder: null,
        downloadFolderName: '',
        setDownloadFolder: (handle, name) => set({ downloadFolder: handle, downloadFolderName: name }),
        clearDownloadFolder: () => set({ downloadFolder: null, downloadFolderName: '' }),

        // ─── Dynamic Color ───
        dominantColor: null,
        setDominantColor: (color) => set({ dominantColor: color }),

        // ─── Settings ───
        downloadFormat: 'mp3',
        setDownloadFormat: (format) => set({ downloadFormat: format }),
        mp3Quality: 'alta',
        setMp3Quality: (q) => set({ mp3Quality: q }),
        downloadWifiOnly: false,
        setDownloadWifiOnly: (v) => set({ downloadWifiOnly: v }),
        appLanguage: 'es',
        setAppLanguage: (lang) => set({ appLanguage: lang }),

        // ─── Local Library ───
        localLibrary: [],
        localFileRefs: new Map(),
        isImporting: false,
        savedLocalPaths: [],

        importLocalFiles: async (files) => {
          set({ isImporting: true });
          try {
            const parsed = await parseLocalFiles(files);
            const existingPaths = new Set(get().localLibrary.map((t) => t.localPath));
            const newTracks = parsed.filter((t) => !existingPaths.has(t.localPath));

            const newRefs = new Map(get().localFileRefs);
            Array.from(files).forEach((file) => {
              const match = newTracks.find((t) => t.localPath === file.name);
              if (match) newRefs.set(match.id, file);
            });

            const newPaths = newTracks.map((t) => t.localPath);

            set((s) => ({
              localLibrary: [...s.localLibrary, ...newTracks],
              localFileRefs: newRefs,
              savedLocalPaths: [...s.savedLocalPaths, ...newPaths],
              isImporting: false,
            }));

            const skipped = parsed.length - newTracks.length;
            if (newTracks.length > 0) {
              const plural = newTracks.length > 1 ? 's' : '';
              const dupMsg = skipped > 0 ? ` (${skipped} duplicadas)` : '';
              toast.success(`${newTracks.length} pista${plural} importada${plural}${dupMsg}`, { duration: 4000 });
            } else {
              toast('No se añadieron pistas nuevas', { duration: 3000 });
            }
          } catch (e) {
            const errorMsg = e instanceof Error ? e.message : String(e);
            console.error('Import failed:', e);
            set({ isImporting: false });
            toast.error(`Error al importar: ${errorMsg}`, { duration: 5000 });
          }
        },

        rescanLocalLibrary: async () => {
          if (!Capacitor.isNativePlatform() || get().savedLocalPaths.length === 0) return;

          try {
            const filesData = await Promise.all(
              get().savedLocalPaths.map(async (path) => {
                try {
                  const data = await Filesystem.readFile({
                    path: `MHL Music/${path}`,
                    directory: Directory.Documents,
                  });
                  const binaryStr = atob(data.data as string);
                  const bytes = new Uint8Array(binaryStr.length);
                  for (let i = 0; i < binaryStr.length; i++) {
                    bytes[i] = binaryStr.charCodeAt(i);
                  }
                  return new File([bytes], path, { type: 'audio/mpeg' });
                } catch (e) {
                  console.warn(`Could not read ${path}:`, e);
                  return null;
                }
              })
            );

            const validFiles = filesData.filter((f) => f !== null) as File[];
            if (validFiles.length === 0) return;

            const parsed = await parseLocalFiles(validFiles);
            const newRefs = new Map(get().localFileRefs);
            validFiles.forEach((file) => {
              const match = parsed.find((t) => t.localPath === file.name);
              if (match) newRefs.set(match.id, file);
            });

            set((s) => ({
              localLibrary: parsed.length > 0 ? parsed : s.localLibrary,
              localFileRefs: newRefs,
            }));
          } catch (e) {
            console.error('Rescan failed:', e);
          }
        },

        playLocalTrack: async (id) => {
          const track = get().localLibrary.find((t) => t.id === id);
          if (!track) return;

          const fileRef = get().localFileRefs.get(id);
          if (!fileRef) {
            toast.error('Archivo no disponible — vuelve a importarlo');
            return;
          }

          const objectUrl = URL.createObjectURL(fileRef);

          if (get().currentTrack?.preview?.startsWith('blob:')) {
            URL.revokeObjectURL(get().currentTrack.preview);
          }

          set({
            currentTrack: { ...track, preview: objectUrl },
            isPlaying: false,
            isLoading: true,
            progress: 0,
            duration: track.duration,
          });

          document.title = `${track.title} · ${track.artist} — MHL Music`;

          set({ dominantColor: null });

          audioEngine.load(objectUrl);
          audioEngine.setVolume(get().volume);
          audioEngine.updateMediaSession({
            title: track.title,
            artist: track.artist,
            album: track.album,
            artwork: track.cover || undefined,
          });

          audioEngine.play().then(() => {
            set({ isPlaying: true, isLoading: false });
            get().incrementPlayCount(id);
          });
        },

        removeLocalTrack: (id) => {
          const track = get().localLibrary.find((t) => t.id === id);
          if (track?.cover?.startsWith('blob:')) {
            URL.revokeObjectURL(track.cover);
          }
          const newRefs = new Map(get().localFileRefs);
          newRefs.delete(id);
          set((s) => ({
            localLibrary: s.localLibrary.filter((t) => t.id !== id),
            localFileRefs: newRefs,
          }));
        },

        clearLocalLibrary: () => {
          get().localLibrary.forEach((track) => {
            if (track.cover?.startsWith('blob:')) {
              URL.revokeObjectURL(track.cover);
            }
          });
          set({ localLibrary: [], localFileRefs: new Map() });
        },

        incrementPlayCount: (id) =>
          set((s) => ({
            localLibrary: s.localLibrary.map((t) =>
              t.id === id ? { ...t, playCount: (t.playCount ?? 0) + 1 } : t
            ),
          })),
      };
    },
    {
      name: 'mhl-store',
      partialize: (state) => ({
        downloads: state.downloads.filter((d) => d.status === 'completed' || d.status === 'error'),
        volume: state.volume,
        downloadFolderName: state.downloadFolderName,
        localLibrary: state.localLibrary,
        downloadFormat: state.downloadFormat,
        mp3Quality: state.mp3Quality,
        downloadWifiOnly: state.downloadWifiOnly,
        appLanguage: state.appLanguage,
        // localFileRefs excluded — File objects cannot be serialized
      }),
      merge: (persisted: any, current) => ({
        ...current,
        downloads: persisted?.downloads || [],
        volume: persisted?.volume ?? 0.8,
        downloadFolderName: persisted?.downloadFolderName || '',
        localLibrary: persisted?.localLibrary || [],
        downloadFormat: persisted?.downloadFormat ?? 'mp3',
        mp3Quality: persisted?.mp3Quality ?? 'alta',
        downloadWifiOnly: persisted?.downloadWifiOnly ?? false,
        appLanguage: persisted?.appLanguage ?? 'es',
        localFileRefs: new Map(),
      }),
    }
  )
);
