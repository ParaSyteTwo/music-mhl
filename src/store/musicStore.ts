import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Track, Download } from '@/types/music';
import { audioEngine } from '@/lib/audioEngine';
import { searchDeezer, searchYouTube, getYouTubeStream } from '@/lib/api/musicApi';
import { writeID3Tags } from '@/lib/id3Writer';
import { extractDominantColor } from '@/lib/colorExtractor';
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

  // Download folder (web only, not persisted)
  downloadFolder: FileSystemDirectoryHandle | null;
  downloadFolderName: string;
  setDownloadFolder: (handle: FileSystemDirectoryHandle, name: string) => void;
  clearDownloadFolder: () => void;

  // Dynamic color
  dominantColor: string | null;
  setDominantColor: (color: string | null) => void;
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
          set({
            currentTrack: track,
            isPlaying: false,
            isLoading: true,
            progress: 0,
            duration: track.duration,
          });

          document.title = `${track.title} · ${track.artist} — MHL Music`;

          // Extract dominant color from cover
          if (track.cover) {
            extractDominantColor(track.cover).then((color) => {
              set({ dominantColor: color });
            });
          } else {
            set({ dominantColor: null });
          }

          if (track.preview) {
            audioEngine.load(track.preview);
            audioEngine.setVolume(get().volume);
            audioEngine.updateMediaSession({
              title: track.title,
              artist: track.artist,
              album: track.album,
              artwork: track.cover,
            });
            audioEngine.play().then(() => set({ isPlaying: true, isLoading: false }));
          } else {
            set({ isLoading: false });
          }
        },

        togglePlay: () => {
          const { isPlaying, currentTrack } = get();
          if (!currentTrack) return;
          if (isPlaying) {
            audioEngine.pause();
          } else {
            audioEngine.play();
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
            // Save to recent searches
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
            // Deduplicate by id
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
          const id = `d${Date.now()}`;
          set((s) => ({
            downloads: [...s.downloads, { id, track, progress: 0, status: 'downloading' as const }],
          }));

          const updateDl = (patch: Partial<Download>) =>
            set((s) => ({
              downloads: s.downloads.map((d) => (d.id === id ? { ...d, ...patch } : d)),
            }));

          const maxAttempts = 3;

          for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
              const attemptLabel = maxAttempts > 1 ? ` (intento ${attempt}/${maxAttempts})` : '';

              updateDl({ progress: 10, error: attempt > 1 ? `Reintentando...${attemptLabel}` : undefined });
              const results = await searchYouTube(`${track.title} ${track.artist}`);
              if (!results.length) throw new Error('No se encontró en YouTube');
              updateDl({ progress: 30 });

              const streamData = await getYouTubeStream(results[0].videoId);
              const mp3Url = streamData.stream?.url;
              if (!mp3Url) throw new Error('No se pudo obtener el MP3');
              updateDl({ progress: 60 });

              const response = await fetch(mp3Url);
              if (!response.ok) throw new Error('Error descargando el archivo');
              const mp3Buffer = await response.arrayBuffer();
              updateDl({ progress: 80 });

              const taggedBlob = await writeID3Tags(mp3Buffer, {
                title: track.title,
                artist: track.artist,
                album: track.album,
                coverUrl: track.cover,
              });
              updateDl({ progress: 95 });

              const fileName = `${track.title} - ${track.artist}.mp3`.replace(/[/\\?%*:|"<>]/g, '');

              if (Capacitor.isNativePlatform()) {
                const buffer = await taggedBlob.arrayBuffer();
                const base64 = btoa(
                  new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
                );
                await Filesystem.writeFile({
                  path: `MHL Music/${fileName}`,
                  data: base64,
                  directory: Directory.Documents,
                  recursive: true,
                });
              } else {
                const { downloadFolder } = get();
                if (downloadFolder) {
                  try {
                    const fileHandle = await downloadFolder.getFileHandle(fileName, { create: true });
                    const writable = await fileHandle.createWritable();
                    await writable.write(taggedBlob);
                    await writable.close();
                  } catch {
                    // Fallback to anchor-tag download if folder access fails
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

              updateDl({ progress: 100, status: 'completed', error: undefined });
              toast.success(`✓ Descargado: ${track.title} - ${track.artist}`, { duration: 4000 });
              return; // Success — exit retry loop
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
      };
    },
    {
      name: 'mhl-store',
      partialize: (state) => ({
        downloads: state.downloads.filter((d) => d.status === 'completed' || d.status === 'error'),
        volume: state.volume,
        downloadFolderName: state.downloadFolderName,
      }),
      merge: (persisted: any, current) => ({
        ...current,
        downloads: persisted?.downloads || [],
        volume: persisted?.volume ?? 0.8,
        downloadFolderName: persisted?.downloadFolderName || '',
      }),
    }
  )
);
