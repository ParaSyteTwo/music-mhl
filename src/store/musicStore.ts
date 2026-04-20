import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Track, Download, LocalTrack } from '@/types/music';
import { audioEngine } from '@/lib/audioEngine';
import { searchDeezer, downloadTrackAudio, getDeezerTrackMeta, getLyrics } from '@/lib/api/musicApi';
import { writeID3Tags } from '@/lib/id3Writer';
import {
  type ImportedAudioFile,
  resolveImportedTrackMeta,
  resolveLocalPlaybackUrl,
  shouldPersistLocalPath,
} from '@/lib/localTrackRuntime';
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

function cleanTrackTitleForFileName(title: string): string {
  const normalized = title
    .replace(/\s+/g, ' ')
    .replace(/\b(opening|ending)\s+theme\s+song\b/gi, '')
    .replace(/\b(opening|ending)\s+theme\b/gi, '')
    .replace(/\btheme\s+song\b/gi, '')
    .replace(/\b(ost|original soundtrack|soundtrack)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  const parts = normalized.split(/\s[-–—]\s/);
  if (parts.length > 1) {
    const [first, ...rest] = parts;
    const suffix = rest.join(' - ');
    if (/(opening|ending|theme|ost|soundtrack|season|anime|ver\.?|version)/i.test(suffix)) {
      return first.trim() || normalized;
    }
  }

  return normalized || title.trim();
}

function buildDownloadFileName(track: Track, fileExtension: string): string {
  const preferredTitle = track.canonicalTitle?.trim() || track.title;
  const cleanTitle = cleanTrackTitleForFileName(preferredTitle);
  return `${cleanTitle} - ${track.artist}.${fileExtension}`
    .replace(/[/\\?%*:|"<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getPreferredAlbumName(track: Track): string {
  return track.canonicalAlbum?.trim() || track.album;
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
  downloadQueue: string[];
  activeDownloads: number;
  startDownload: (track: Track) => void;
  startDownloadWithVideoId: (track: Track, videoId: string) => void;
  removeDownload: (id: string) => void;
  processDownloadQueue: () => Promise<void>;
  _executeDownload: (track: Track, id: string, videoIdOverride?: string) => Promise<void>;

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

  // ─── yt-dlp status ───
  ytDlpVersion: string | null;
  ytDlpUpdateAvailable: boolean;
  ytDlpUpdating: boolean;
  setYtDlpVersion: (version: string | null) => void;
  setYtDlpUpdateAvailable: (v: boolean) => void;
  setYtDlpUpdating: (v: boolean) => void;

  // ─── Maintenance mode ───
  isMaintenanceMode: boolean;
  maintenanceUntil: number | null;
  setMaintenanceMode: (active: boolean, until?: number | null) => void;

  // ─── Local Library ───
  localLibrary: LocalTrack[];
  localFileRefs: Map<string, File>;
  isImporting: boolean;
  savedLocalPaths: string[];

  importLocalFiles: (files: FileList | File[], options?: { silent?: boolean }) => Promise<void>;
  importScannedTracks: (tracks: LocalTrack[], options?: { silent?: boolean }) => void;
  rescanLocalLibrary: () => Promise<void>;
  playLocalTrack: (id: string) => Promise<void>;
  removeLocalTrack: (id: string) => void;
  clearLocalLibrary: () => void;
  incrementPlayCount: (id: string) => void;

  // ─── Download history for suggestions ───
  mostDownloadedArtists: string[];
  addMostDownloadedArtist: (artist: string) => void;
}

// WiFi-only detection (web Network Information API)
function isOnWifi(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

      audioEngine.onLoadedMetadata = () => {
        set({
          duration: audioEngine.duration || get().currentTrack?.duration || 0,
        });
      };

      audioEngine.onWaiting = () => {
        if (get().currentTrack) set({ isLoading: true });
      };

      audioEngine.onStalled = () => {
        if (get().currentTrack) set({ isLoading: true });
      };

      audioEngine.onPlay = () => {
        set({ isPlaying: true, isLoading: false });
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
        downloadQueue: [],
        activeDownloads: 0,

        processDownloadQueue: async () => {
          const { downloadQueue, activeDownloads, downloads } = get();
          if (downloadQueue.length === 0 || activeDownloads >= 2) return;

          // Delay de 3s entre descargas para no golpear rate limit
          await new Promise((r) => setTimeout(r, 3000));

          const [nextId, ...rest] = downloadQueue;
          set({ downloadQueue: rest });

          const dl = get().downloads.find((d) => d.id === nextId);
          if (dl && dl.status === 'queued') {
            await get()._executeDownload(dl.track, nextId);
          }
        },

        _executeDownload: async (track: Track, id: string, videoIdOverride?: string) => {
          set((s) => ({ activeDownloads: s.activeDownloads + 1 }));

          const updateDl = (patch: Partial<Download>) =>
            set((s) => ({
              downloads: s.downloads.map((d) => (d.id === id ? { ...d, ...patch } : d)),
            }));

          updateDl({ status: 'downloading', progress: 5 });

          const { downloadFormat, mp3Quality } = get();
          const maxAttempts = 3;
          const fileExtension = downloadFormat === 'aac' ? 'm4a' : 'mp3';
          const resolvedFileName = buildDownloadFileName(track, fileExtension);

          // Listener de progreso real de yt-dlp (Android): conecta 0-100% nativo → 25-80% UI
          let progressHandle: { remove: () => void } | null = null;
          if (Capacitor.isNativePlatform()) {
            import('@/lib/ytdlpBridge').then(({ addDownloadProgressListener }) => {
              addDownloadProgressListener((evt) => {
                const mapped = Math.round(25 + (evt.progress / 100) * 55);
                updateDl({ progress: mapped, speed: evt.speed || undefined, eta: evt.eta > 0 ? evt.eta : undefined });
              }).then((handle) => { progressHandle = handle; }).catch(() => {});
            }).catch(() => {});
          }

          try {
          for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
              const attemptLabel = maxAttempts > 1 ? ` (intento ${attempt}/${maxAttempts})` : '';
              updateDl({ progress: 10, error: attempt > 1 ? `Reintentando...${attemptLabel}` : undefined });

              const audioBuffer = await downloadTrackAudio(track, (progress) => {
                updateDl({ progress });
              }, { format: downloadFormat, quality: mp3Quality }, videoIdOverride);
              updateDl({ progress: 80 });

              // Obtener metadatos extendidos y letra en paralelo
              const [trackMeta, lyricsResult] = await Promise.all([
                track.deezerId ? getDeezerTrackMeta(track.deezerId).catch(() => ({ genre: null, year: null, trackNumber: null })) : Promise.resolve({ genre: null, year: null, trackNumber: null }),
                getLyrics(track.canonicalTitle?.trim() || track.title, track.artist, track.duration).catch(() => ({ synced: null, plain: null })),
              ]);
              const lyrics = lyricsResult.plain || null;

              if (downloadFormat === 'mp3' && Capacitor.isNativePlatform()) {
                const taggedBlob = await writeID3Tags(audioBuffer, {
                  title: track.canonicalTitle?.trim() || track.title,
                  artist: track.artist,
                  album: getPreferredAlbumName(track),
                  coverUrl: track.cover,
                  ...(trackMeta.genre ? { genre: trackMeta.genre } : {}),
                  ...(trackMeta.year ? { year: trackMeta.year } : {}),
                  ...(trackMeta.trackNumber ? { trackNumber: trackMeta.trackNumber } : {}),
                  ...(lyrics ? { lyrics } : {}),
                });
                updateDl({ progress: 95 });

                const arr = await taggedBlob.arrayBuffer();
                const base64 = btoa(new Uint8Array(arr).reduce((data, byte) => data + String.fromCharCode(byte), ''));
                // Guardar en Music/MHL Music (visible en reproductores) via MediaStore
                const { saveTaggedAudioToMusic } = await import('@/lib/ytdlpBridge');
                const mediaUri = await saveTaggedAudioToMusic(resolvedFileName, base64);
                updateDl({ mediaUri });
              } else if (!Capacitor.isNativePlatform()) {
                // Web: escribir ID3 tags y guardar como .mp3
                const taggedBlob = await writeID3Tags(audioBuffer, {
                  title: track.canonicalTitle?.trim() || track.title,
                  artist: track.artist,
                  album: getPreferredAlbumName(track),
                  coverUrl: track.cover,
                  ...(trackMeta.genre ? { genre: trackMeta.genre } : {}),
                  ...(trackMeta.year ? { year: trackMeta.year } : {}),
                  ...(trackMeta.trackNumber ? { trackNumber: trackMeta.trackNumber } : {}),
                  ...(lyrics ? { lyrics } : {}),
                });
                updateDl({ progress: 95 });

                const { downloadFolder } = get();
                if (downloadFolder) {
                  try {
                    const fileHandle = await downloadFolder.getFileHandle(resolvedFileName, { create: true });
                    const writable = await fileHandle.createWritable();
                    await writable.write(taggedBlob);
                    await writable.close();
                  } catch {
                    const blobUrl = URL.createObjectURL(taggedBlob);
                    const a = document.createElement('a');
                    a.href = blobUrl;
                    a.download = resolvedFileName;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
                  }
                } else {
                  const blobUrl = URL.createObjectURL(taggedBlob);
                  const a = document.createElement('a');
                  a.href = blobUrl;
                  a.download = resolvedFileName;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
                }
              } else {
                // AAC — save raw buffer as .m4a
                updateDl({ progress: 95 });

                if (Capacitor.isNativePlatform()) {
                  const base64 = btoa(new Uint8Array(audioBuffer).reduce((data, byte) => data + String.fromCharCode(byte), ''));
                  // Guardar en Music/MHL Music via MediaStore
                  const { saveTaggedAudioToMusic } = await import('@/lib/ytdlpBridge');
                  const mediaUri = await saveTaggedAudioToMusic(resolvedFileName, base64);
                  updateDl({ mediaUri });
                } else {
                  const { downloadFolder } = get();
                  const blob = new Blob([audioBuffer]);
                  if (downloadFolder) {
                    try {
                      const fileHandle = await downloadFolder.getFileHandle(resolvedFileName, { create: true });
                      const writable = await fileHandle.createWritable();
                      await writable.write(blob);
                      await writable.close();
                    } catch {
                      const blobUrl = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = blobUrl;
                      a.download = resolvedFileName;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
                    }
                  } else {
                    const blobUrl = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = blobUrl;
                    a.download = resolvedFileName;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
                  }
                }
              }

              updateDl({ progress: 100, status: 'completed', error: undefined, fileName: resolvedFileName });
              get().addMostDownloadedArtist(track.artist);
              toast.success(`✓ Descargado: ${track.title} - ${track.artist}`, { duration: 4000 });
              return;
            } catch (error) {
              const msg = error instanceof Error ? error.message : 'Download failed';

              if (msg === '__MAINTENANCE__') {
                get().setMaintenanceMode(true);
                updateDl({ status: 'error', error: 'Servicio en mantenimiento (~5 min). Reintenta en breve.' });
                // Polling hasta que el servidor salga de mantenimiento
                const poll = setInterval(async () => {
                  try {
                    const res = await fetch(`${(import.meta as { env: Record<string, string> }).env.VITE_RAILWAY_URL}/health`);
                    const data = await res.json() as { maintenance?: boolean; maintenance_until?: number };
                    if (!data.maintenance) {
                      get().setMaintenanceMode(false, null);
                      clearInterval(poll);
                    }
                  } catch { /* ignorar errores de red */ }
                }, 30_000);
                return;
              }

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
          } finally {
            progressHandle?.remove();
            set((s) => ({ activeDownloads: Math.max(0, s.activeDownloads - 1) }));
            get().processDownloadQueue();
          }
        },

        startDownload: async (track) => {
          // Check WiFi-only setting
          if (get().downloadWifiOnly && !isOnWifi()) {
            toast.error('Descarga cancelada: solo WiFi activado', { duration: 4000 });
            return;
          }

          // Si ya está en cola o descargando, ignorar
          const existing = get().downloads.find((d) => d.track.id === track.id);
          if (existing && (existing.status === 'downloading' || existing.status === 'queued')) return;

          const id = `d${Date.now()}`;
          set((s) => ({
            downloads: [...s.downloads, { id, track, progress: 0, status: 'queued' as const }],
          }));

          if (get().activeDownloads < 2) {
            await get()._executeDownload(track, id);
          } else {
            set((s) => ({ downloadQueue: [...s.downloadQueue, id] }));
          }
        },

        startDownloadWithVideoId: (track, videoId) => {
          if (get().downloadWifiOnly && !isOnWifi()) {
            toast.error('Descarga cancelada: solo WiFi activado', { duration: 4000 });
            return;
          }
          const existing = get().downloads.find((d) => d.track.id === track.id);
          if (existing && (existing.status === 'downloading' || existing.status === 'queued')) return;

          const id = `d${Date.now()}`;
          set((s) => ({
            downloads: [...s.downloads, { id, track, progress: 0, status: 'queued' as const }],
          }));
          if (get().activeDownloads < 2) {
            get()._executeDownload(track, id, videoId);
          } else {
            set((s) => ({ downloadQueue: [...s.downloadQueue, id] }));
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

        // ─── Reproductor externo preferido (Android) ───
        preferredPlayerPackage: null as string | null,
        setPreferredPlayerPackage: (pkg: string | null) => set({ preferredPlayerPackage: pkg }),

        // ─── yt-dlp status ───
        ytDlpVersion: null,
        ytDlpUpdateAvailable: false,
        ytDlpUpdating: false,
        setYtDlpVersion: (version) => set({ ytDlpVersion: version }),
        setYtDlpUpdateAvailable: (v) => set({ ytDlpUpdateAvailable: v }),
        setYtDlpUpdating: (v) => set({ ytDlpUpdating: v }),

        // ─── Maintenance mode ───
        isMaintenanceMode: false,
        maintenanceUntil: null,
        setMaintenanceMode: (active, until = null) => set({ isMaintenanceMode: active, maintenanceUntil: until ?? null }),

        // ─── Local Library ───
        localLibrary: [],
        localFileRefs: new Map(),
        isImporting: false,
        savedLocalPaths: [],

        importLocalFiles: async (files, options) => {
          set({ isImporting: true });
          try {
            const fileArray = Array.from(files) as ImportedAudioFile[];
            const parsed = await parseLocalFiles(fileArray);
            const parsedWithSource = parsed.map((track) => resolveImportedTrackMeta(track, fileArray));
            const existingPaths = new Set(get().localLibrary.map((t) => t.localPath));
            const newTracks = parsedWithSource.filter((t) => !existingPaths.has(t.localPath));

            const newRefs = new Map(get().localFileRefs);
            fileArray.forEach((file) => {
              const match = newTracks.find((t) => t.localPath === file.name || t.localPath === file.__mhlRelativePath);
              if (match && match.localSource !== 'documents') newRefs.set(match.id, file);
            });

            const newPaths = newTracks.filter(shouldPersistLocalPath).map((t) => t.localPath);

            set((s) => ({
              localLibrary: [...s.localLibrary, ...newTracks],
              localFileRefs: newRefs,
              savedLocalPaths: [...new Set([...s.savedLocalPaths, ...newPaths])],
              isImporting: false,
            }));

            const skipped = parsed.length - newTracks.length;
            if (newTracks.length > 0 && !options?.silent) {
              const plural = newTracks.length > 1 ? 's' : '';
              const dupMsg = skipped > 0 ? ` (${skipped} duplicadas)` : '';
              toast.success(`${newTracks.length} pista${plural} importada${plural}${dupMsg}`, { duration: 4000 });
            } else if (!options?.silent) {
              toast('No se anadieron pistas nuevas', { duration: 3000 });
            }
          } catch (e) {
            const errorMsg = e instanceof Error ? e.message : String(e);
            console.error('Import failed:', e);
            set({ isImporting: false });
            if (!options?.silent) {
              toast.error(`Error al importar: ${errorMsg}`, { duration: 5000 });
            }
          }
        },

        importScannedTracks: (tracks, options) => {
          const existingByPath = new Map(get().localLibrary.map((track) => [track.localPath, track]));
          const nextTracks = tracks.map((track) => {
            const existing = existingByPath.get(track.localPath);
            return existing
              ? {
                  ...track,
                  id: existing.id,
                  playCount: existing.playCount ?? track.playCount ?? 0,
                  importedAt: existing.importedAt ?? track.importedAt,
                }
              : track;
          });

          const scannedPaths = new Set(nextTracks.map((track) => track.localPath));
          const nonDocumentTracks = get().localLibrary.filter((track) => track.localSource !== 'documents');
          const mergedLibrary = [
            ...nonDocumentTracks,
            ...nextTracks,
          ];

          set((s) => ({
            localLibrary: mergedLibrary,
            localFileRefs: new Map(
              Array.from(s.localFileRefs.entries()).filter(([id]) =>
                mergedLibrary.some((track) => track.id === id && track.localSource !== 'documents')
              )
            ),
            savedLocalPaths: [
              ...new Set([
                ...s.savedLocalPaths.filter((path) => !path.startsWith('MHL Music/')),
                ...Array.from(scannedPaths),
              ]),
            ],
          }));

          if (!options?.silent) {
            const plural = nextTracks.length === 1 ? '' : 's';
            toast.success(`${nextTracks.length} pista${plural} sincronizada${plural}`, { duration: 3500 });
          }
        },

        rescanLocalLibrary: async () => {
          if (!Capacitor.isNativePlatform() || get().savedLocalPaths.length === 0) return;

          try {
            const filesData = await Promise.all(
              get().savedLocalPaths.map(async (path) => {
                try {
                  const data = await Filesystem.readFile({
                    path,
                    directory: Directory.Documents,
                  });
                  const binaryStr = atob(data.data as string);
                  const bytes = new Uint8Array(binaryStr.length);
                  for (let i = 0; i < binaryStr.length; i++) {
                    bytes[i] = binaryStr.charCodeAt(i);
                  }
                  return {
                    file: new File([bytes], path.split('/').pop() || path, { type: 'audio/mpeg' }),
                    path,
                  };
                } catch (e) {
                  console.warn(`Could not read ${path}:`, e);
                  return null;
                }
              })
            );

            const validFiles = filesData.filter((f) => f !== null) as Array<{ file: File; path: string }>;
            if (validFiles.length === 0) return;

            const restoredFiles = validFiles.map(({ file, path }) => ({
              ...file,
              __mhlRelativePath: path,
              __mhlSource: 'documents',
            } as ImportedAudioFile));
            const parsed = (await parseLocalFiles(restoredFiles)).map((track) =>
              resolveImportedTrackMeta(track, restoredFiles)
            );
            const newRefs = new Map(get().localFileRefs);
            restoredFiles.forEach((file) => {
              const match = parsed.find((t) => t.localPath === file.__mhlRelativePath);
              if (match && match.localSource !== 'documents') newRefs.set(match.id, file);
            });

            set((s) => ({
              localLibrary: parsed.length > 0
                ? s.localLibrary.map((track) => parsed.find((p) => p.localPath === track.localPath) || track)
                : s.localLibrary,
              localFileRefs: newRefs,
            }));
          } catch (e) {
            console.error('Rescan failed:', e);
          }
        },

        playLocalTrack: async (id) => {
          const track = get().localLibrary.find((t) => t.id === id);
          if (!track) return;

          const localPlaybackUrl = await resolveLocalPlaybackUrl(track).catch((error) => {
            console.error('Android local playback failed:', error);
            return null;
          });

          if (localPlaybackUrl) {
            try {
              if (get().currentTrack?.preview?.startsWith('blob:')) {
                URL.revokeObjectURL(get().currentTrack.preview);
              }

              set({
                currentTrack: { ...track, preview: localPlaybackUrl },
                isPlaying: false,
                isLoading: true,
                progress: 0,
                duration: track.duration,
              });

              document.title = `${track.title} · ${track.artist} - MHL Music`;
              set({ dominantColor: null });

              audioEngine.load(localPlaybackUrl);
              audioEngine.setVolume(get().volume);
              audioEngine.updateMediaSession({
                title: track.title,
                artist: track.artist,
                album: track.album,
                artwork: track.cover || undefined,
              });

              let didStart = false;
              const startTimeout = window.setTimeout(() => {
                if (!didStart) {
                  set({ isLoading: false, isPlaying: false });
                  toast.error('La pista tardo demasiado en empezar. Intenta otra vez.');
                }
              }, 4500);

              await audioEngine.play();
              didStart = true;
              window.clearTimeout(startTimeout);
              set({ isPlaying: true, isLoading: false });
              get().incrementPlayCount(id);
              return;
            } catch (error) {
              console.error('Native local playback branch failed:', error);
            }
          }

          const fileRef = get().localFileRefs.get(id);
          if (!fileRef) {
            toast.error('Archivo no disponible. Vuelve a importarlo.');
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
            savedLocalPaths: track ? s.savedLocalPaths.filter((path) => path !== track.localPath) : s.savedLocalPaths,
          }));
        },

        clearLocalLibrary: () => {
          get().localLibrary.forEach((track) => {
            if (track.cover?.startsWith('blob:')) {
              URL.revokeObjectURL(track.cover);
            }
          });
          set({ localLibrary: [], localFileRefs: new Map(), savedLocalPaths: [] });
        },

        incrementPlayCount: (id) =>
          set((s) => ({
            localLibrary: s.localLibrary.map((t) =>
              t.id === id ? { ...t, playCount: (t.playCount ?? 0) + 1 } : t
            ),
          })),

        // ─── Download history for suggestions ───
        mostDownloadedArtists: [],
        addMostDownloadedArtist: (artist) =>
          set((s) => {
            const exists = s.mostDownloadedArtists.includes(artist);
            const updated = exists
              ? s.mostDownloadedArtists
              : [artist, ...s.mostDownloadedArtists].slice(0, 20);
            return { mostDownloadedArtists: updated };
          }),
      };
    },
    {
      name: 'mhl-store',
      partialize: (state) => ({
        downloads: state.downloads.filter((d) => d.status === 'completed' || d.status === 'error'),
        volume: state.volume,
        downloadFolderName: state.downloadFolderName,
        localLibrary: state.localLibrary,
        savedLocalPaths: state.savedLocalPaths,
        downloadFormat: state.downloadFormat,
        mp3Quality: state.mp3Quality,
        downloadWifiOnly: state.downloadWifiOnly,
        appLanguage: state.appLanguage,
        mostDownloadedArtists: state.mostDownloadedArtists,
        preferredPlayerPackage: state.preferredPlayerPackage,
        // localFileRefs excluded — File objects cannot be serialized
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      merge: (persisted: any, current) => ({
        ...current,
        downloads: persisted?.downloads || [],
        volume: persisted?.volume ?? 0.8,
        downloadFolderName: persisted?.downloadFolderName || '',
        localLibrary: persisted?.localLibrary || [],
        savedLocalPaths: persisted?.savedLocalPaths || [],
        downloadFormat: persisted?.downloadFormat ?? 'mp3',
        mp3Quality: persisted?.mp3Quality ?? 'alta',
        downloadWifiOnly: persisted?.downloadWifiOnly ?? false,
        appLanguage: persisted?.appLanguage ?? 'es',
        mostDownloadedArtists: persisted?.mostDownloadedArtists ?? [],
        preferredPlayerPackage: persisted?.preferredPlayerPackage ?? null,
        localFileRefs: new Map(),
      }),
    }
  )
);

