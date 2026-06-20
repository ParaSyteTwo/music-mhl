import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Track, Download } from '@/types/music';
import { audioEngine } from '@/lib/audioEngine';
import { searchDeezer, downloadTrackAudio, getDeezerTrackMeta, getLyrics } from '@/lib/api/musicApi';
import { writeID3Tags } from '@/lib/id3Writer';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { toast } from 'sonner';
import { translate } from '@/lib/i18n';
import {
  type Lang,
  type UiLanguageMode,
  isUiLanguageMode,
  resolveEffectiveLanguage,
} from '@/lib/language';
import { detectPlatform } from '@/lib/platform';
import { decodeBase64ArrayBuffer } from '@/lib/binaryEncoding';

function storeText(mode: UiLanguageMode, key: string, vars?: Record<string, string | number>): string {
  return translate(resolveEffectiveLanguage(mode), key, vars);
}

function getProgressLabel(progress: number, lang: Lang = 'es'): string {
  if (progress >= 100) return translate(lang, 'progressCompleted');
  if (progress >= 90) return translate(lang, 'progressSavingFile');
  if (progress >= 70) return translate(lang, 'progressWritingMetadata');
  if (progress >= 30) return translate(lang, 'progressGettingAudio');
  return translate(lang, 'phaseSearchingYoutube');
}

export { getProgressLabel };

let searchRequestId = 0;
let isProcessingDownloadQueue = false;

export function getDownloadQueueDelayMs(
  currentPlatform: ReturnType<typeof detectPlatform> = detectPlatform(),
): number {
  return currentPlatform === 'web' ? 3000 : 0;
}

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
  startDownloadWithSourceUrl: (track: Track, sourceUrl: string) => void;
  removeDownload: (id: string) => void;
  processDownloadQueue: () => Promise<void>;
  _executeDownload: (
    track: Track,
    id: string,
    videoIdOverride?: string,
    sourceUrlOverride?: string,
  ) => Promise<void>;

  // Download folder (web only, not persisted across sessions)
  downloadFolder: FileSystemDirectoryHandle | null;
  downloadFolderName: string;
  setDownloadFolder: (handle: FileSystemDirectoryHandle, name: string) => void;
  clearDownloadFolder: () => void;

  // Dynamic color
  dominantColor: string | null;
  setDominantColor: (color: string | null) => void;

  // ─── Settings ───
  uiLanguageMode: UiLanguageMode;
  setUiLanguageMode: (mode: UiLanguageMode) => void;
  preferredPlayerPackage: string | null;
  setPreferredPlayerPackage: (pkg: string | null) => void;

  // ─── Lyric settings ───
  lyricOriginal: boolean;
  lyricRomanization: boolean;
  lyricTranslation: boolean;
  lyricLatinOnly: boolean;
  saveLrcFile: boolean;
  setLyricOriginal: (v: boolean) => void;
  setLyricRomanization: (v: boolean) => void;
  setLyricTranslation: (v: boolean) => void;
  setLyricLatinOnly: (v: boolean) => void;
  setSaveLrcFile: (v: boolean) => void;

  // ─── Anime search (opt-in, off by default) ───
  animeSearchEnabled: boolean;
  setAnimeSearchEnabled: (v: boolean) => void;
  androidFastSearchMode: boolean;
  setAndroidFastSearchMode: (v: boolean) => void;

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

  // ─── Download history for suggestions ───
  mostDownloadedArtists: string[];
  addMostDownloadedArtist: (artist: string) => void;
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
                toast.error(storeText(get().uiLanguageMode, 'playbackFailed'));
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
            set({ isPlaying: false });
          } else {
            void audioEngine.play()
              .then(() => {
                audioEngine.setPlaybackState('playing');
                set({ isPlaying: true });
              })
              .catch((error) => {
                console.error('Play failed:', error);
                set({ isPlaying: false });
                toast.error(storeText(get().uiLanguageMode, 'playbackFailed'));
              });
          }
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
          const normalizedQuery = query.trim().replace(/\s+/g, ' ');
          const requestId = ++searchRequestId;
          try {
            if (!normalizedQuery) {
              set({
                searchResults: [],
                isSearching: false,
                isLoadingMore: false,
                searchQuery: '',
                searchOffset: 0,
                hasMoreResults: true,
              });
              document.title = 'MHL Music';
              return;
            }
            set({
              isSearching: true,
              isLoadingMore: false,
              searchQuery: normalizedQuery,
              searchOffset: 0,
              hasMoreResults: true,
            });
            const tracks = await searchDeezer(normalizedQuery, 0, 25);
            if (requestId !== searchRequestId) return;
            set({ searchResults: tracks, isSearching: false, hasMoreResults: tracks.length >= 25 });
            try {
              const stored = JSON.parse(localStorage.getItem('mhl-recent-searches') || '[]') as string[];
              const updated = [normalizedQuery, ...stored.filter((s) => s.toLowerCase() !== normalizedQuery.toLowerCase())].slice(0, 5);
              localStorage.setItem('mhl-recent-searches', JSON.stringify(updated));
            } catch { /* ignore */ }
          } catch (error) {
            console.error('Search error:', error);
            if (requestId === searchRequestId) set({ isSearching: false });
          }
        },

        loadMoreResults: async () => {
          const { isLoadingMore, hasMoreResults, searchQuery, searchOffset, searchResults } = get();
          if (isLoadingMore || !hasMoreResults || !searchQuery.trim()) return;
          const requestId = searchRequestId;
          const requestedQuery = searchQuery;
          set({ isLoadingMore: true });
          try {
            const newOffset = searchOffset + 25;
            const tracks = await searchDeezer(requestedQuery, newOffset, 25);
            const current = get();
            if (requestId !== searchRequestId || current.searchQuery !== requestedQuery) return;
            if (tracks.length < 25) set({ hasMoreResults: false });
            const existingIds = new Set(searchResults.map((t) => t.id));
            const newTracks = tracks.filter((t) => !existingIds.has(t.id));
            set({ searchResults: [...searchResults, ...newTracks], searchOffset: newOffset, isLoadingMore: false });
          } catch (error) {
            console.error('Load more error:', error);
            if (requestId === searchRequestId) set({ isLoadingMore: false });
          }
        },

        // ─── Downloads ───
        downloads: [],
        downloadQueue: [],
        activeDownloads: 0,

        processDownloadQueue: async () => {
          if (isProcessingDownloadQueue) return;
          isProcessingDownloadQueue = true;
          try {
            const { downloadQueue, activeDownloads } = get();
            if (downloadQueue.length === 0 || activeDownloads >= 2) return;

            const [nextId, ...rest] = downloadQueue;
            set({ downloadQueue: rest });

            const queueDelayMs = getDownloadQueueDelayMs();
            if (queueDelayMs > 0) {
              await new Promise((resolve) => setTimeout(resolve, queueDelayMs));
            }

            const dl = get().downloads.find((d) => d.id === nextId);
            if (dl && dl.status === 'queued') {
              void get()._executeDownload(
                dl.track,
                nextId,
                dl.videoIdOverride,
                dl.sourceUrlOverride,
              );
            }
          } finally {
            isProcessingDownloadQueue = false;
          }
        },

        _executeDownload: async (
          track: Track,
          id: string,
          videoIdOverride?: string,
          sourceUrlOverride?: string,
        ) => {
          set((s) => ({ activeDownloads: s.activeDownloads + 1 }));

          const updateDl = (patch: Partial<Download>) =>
            set((s) => ({
              downloads: s.downloads.map((d) => (d.id === id ? { ...d, ...patch } : d)),
            }));

          updateDl({ status: 'downloading', progress: 5 });

          const maxAttempts = 3;
          const resolvedFileName = buildDownloadFileName(track, 'mp3');
          const supplementalDataPromise = Promise.all([
            track.deezerId
              ? getDeezerTrackMeta(track.deezerId).catch(() => ({ genre: null, year: null, trackNumber: null }))
              : Promise.resolve({ genre: null, year: null, trackNumber: null }),
            getLyrics(
              track.canonicalTitle?.trim() || track.title,
              track.artist,
              track.duration,
              {
                lyricOriginal: get().lyricOriginal,
                lyricRomanization: get().lyricRomanization,
                lyricTranslation: get().lyricTranslation,
                lyricLatinOnly: get().lyricLatinOnly,
                deviceLang: resolveEffectiveLanguage(get().uiLanguageMode),
              },
            ).catch(() => ({ synced: null, plain: null })),
          ]);

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

          // PyWebView Desktop: Python descarga audio, frontend escribe ID3 con browser-id3-writer
          if ('pywebview' in window) {
            try {
              updateDl({ progress: 10 });
              const queries = [
                `${track.canonicalTitle?.trim() || track.title} ${track.artist}`,
                `${track.canonicalTitle?.trim() || track.title} ${track.artist} official audio`,
              ];
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const api = (window as any).pywebview?.api;
              const settings = await api.get_settings();
              const outputDir = settings.download_folder || 'C:/Users/Paul/Music/MHL Music';
              const [rawResult, [trackMeta, lyricsResult]] = await Promise.all([
                api.get_raw_audio(
                  videoIdOverride ?? null,
                  track.canonicalTitle?.trim() || track.title,
                  track.artist,
                  queries,
                  sourceUrlOverride ?? null,
                ),
                supplementalDataPromise,
              ]);
              if (!rawResult.success) throw new Error(rawResult.error || 'Error descargando audio');
              const lyrics = lyricsResult.synced || lyricsResult.plain || null;

              updateDl({ progress: 50 });
              const audioBuffer = decodeBase64ArrayBuffer(rawResult.data_b64 as string);

              updateDl({ progress: 70 });
              // Escribir ID3 tags con browser-id3-writer (misma lógica que web/Android)
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

              updateDl({ progress: 90 });
              // Guardar archivo con nombre y ruta correcta
              const fileName = buildDownloadFileName(track, 'mp3');
              const filePath = outputDir + '/' + fileName;
              const taggedArr = await taggedBlob.arrayBuffer();
              const writeResult = await api.write_file_bytes(
                filePath,
                Array.from(new Uint8Array(taggedArr)),
              );
              if (!writeResult?.success) {
                throw new Error(writeResult?.error || 'No se pudo guardar el archivo descargado');
              }

              // Guardar .lrc junto al MP3 para que reproductores lo lean con sincronización
              if (lyricsResult.synced && get().saveLrcFile) {
                const lrcName = buildDownloadFileName(track, 'lrc');
                const lrcPath = outputDir + '/' + lrcName;
                const lrcBytes = new TextEncoder().encode(lyricsResult.synced);
                const lrcWriteResult = await api.write_file_bytes(lrcPath, Array.from(lrcBytes));
                if (!lrcWriteResult?.success) {
                  throw new Error(lrcWriteResult?.error || 'No se pudo guardar el archivo LRC');
                }
              }

              updateDl({ progress: 100, status: 'completed', error: undefined, fileName });
              get().addMostDownloadedArtist(track.artist);
              toast.success(storeText(get().uiLanguageMode, 'downloadCompletedToast', {
                title: track.title,
                artist: track.artist,
              }), { duration: 4000 });
            } catch (error) {
              const msg = error instanceof Error ? error.message : 'Download failed';
              updateDl({ status: 'error', error: msg });
              toast.error(storeText(get().uiLanguageMode, 'downloadError', { error: msg }), { duration: 5000 });
            } finally {
              set((s) => ({ activeDownloads: Math.max(0, s.activeDownloads - 1) }));
              setTimeout(() => get().processDownloadQueue(), 100);
            }
            return;
          }

          try {
          for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
              updateDl({
                progress: 10,
                error: attempt > 1
                  ? storeText(get().uiLanguageMode, 'retryingAttempt', { attempt, max: maxAttempts })
                  : undefined,
              });

              const [audioBuffer, [trackMeta, lyricsResult]] = await Promise.all([
                downloadTrackAudio(track, (progress) => {
                  updateDl({ progress });
                }, {
                  animeSearchEnabled: get().animeSearchEnabled,
                  androidFastSearchMode: get().androidFastSearchMode,
                }, videoIdOverride, sourceUrlOverride),
                supplementalDataPromise,
              ]);
              updateDl({ progress: 80 });
              // Preferir synced (LRC con timestamps) — Retro Music lo sincroniza automáticamente
              const lyrics = lyricsResult.synced || lyricsResult.plain || null;

              if (Capacitor.isNativePlatform()) {
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

                // Guardar .lrc junto al MP3 para que Retro Music lo sincronice
                if (lyricsResult.synced) {
                  const lrcName = resolvedFileName.replace(/\.[^.]+$/, '.lrc');
                  Filesystem.writeFile({
                    path: `Music/MHL Music/${lrcName}`,
                    data: lyricsResult.synced,
                    directory: Directory.ExternalStorage,
                    encoding: Encoding.UTF8,
                  }).catch(() => { /* silencioso — no bloquea la descarga */ });
                }
              } else {
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
              }

              updateDl({ progress: 100, status: 'completed', error: undefined, fileName: resolvedFileName });
              get().addMostDownloadedArtist(track.artist);
              toast.success(storeText(get().uiLanguageMode, 'downloadCompletedToast', {
                title: track.title,
                artist: track.artist,
              }), { duration: 4000 });
              return;
            } catch (error) {
              const msg = error instanceof Error ? error.message : 'Download failed';

              if (msg === '__MAINTENANCE__' && detectPlatform() === 'web') {
                get().setMaintenanceMode(true);
                updateDl({
                  status: 'error',
                  error: storeText(get().uiLanguageMode, 'maintenanceDownloadError'),
                });
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
                updateDl({
                  status: 'error',
                  error: storeText(get().uiLanguageMode, 'failedAfterAttempts', {
                    max: maxAttempts,
                    error: msg,
                  }),
                });
              } else {
                updateDl({
                  status: 'downloading',
                  progress: 0,
                  error: storeText(get().uiLanguageMode, 'retryingAttempt', {
                    attempt: attempt + 1,
                    max: maxAttempts,
                  }),
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

        startDownloadWithSourceUrl: (track, sourceUrl) => {
          const existing = get().downloads.find((d) => d.track.id === track.id);
          if (existing && (existing.status === 'downloading' || existing.status === 'queued')) return;

          const id = `d${Date.now()}`;
          set((s) => ({
            downloads: [...s.downloads, {
              id,
              track,
              sourceUrlOverride: sourceUrl,
              progress: 0,
              status: 'queued' as const,
            }],
          }));
          if (get().activeDownloads < 2) {
            get()._executeDownload(track, id, undefined, sourceUrl);
          } else {
            set((s) => ({ downloadQueue: [...s.downloadQueue, id] }));
          }
        },

        startDownloadWithVideoId: (track, videoId) => {
          const existing = get().downloads.find((d) => d.track.id === track.id);
          if (existing && (existing.status === 'downloading' || existing.status === 'queued')) return;

          const id = `d${Date.now()}`;
          set((s) => ({
            downloads: [...s.downloads, {
              id,
              track,
              videoIdOverride: videoId,
              progress: 0,
              status: 'queued' as const,
            }],
          }));
          if (get().activeDownloads < 2) {
            get()._executeDownload(track, id, videoId);
          } else {
            set((s) => ({ downloadQueue: [...s.downloadQueue, id] }));
          }
        },

        removeDownload: (id) =>
          set((s) => ({
            downloads: s.downloads.filter((d) => d.id !== id),
            downloadQueue: s.downloadQueue.filter((queuedId) => queuedId !== id),
          })),

        // ─── Download Folder ───
        downloadFolder: null,
        downloadFolderName: '',
        setDownloadFolder: (handle, name) => set({ downloadFolder: handle, downloadFolderName: name }),
        clearDownloadFolder: () => set({ downloadFolder: null, downloadFolderName: '' }),

        // ─── Dynamic Color ───
        dominantColor: null,
        setDominantColor: (color) => set({ dominantColor: color }),

        // ─── Settings ───
        uiLanguageMode: 'system',
        setUiLanguageMode: (mode) => set({ uiLanguageMode: mode }),

        // Lyric settings
        lyricOriginal: true,
        lyricRomanization: true,
        lyricTranslation: true,
        lyricLatinOnly: false,
        saveLrcFile: true,
        setLyricOriginal: (v) => set({ lyricOriginal: v }),
        setLyricRomanization: (v) => set({ lyricRomanization: v }),
        setLyricTranslation: (v) => set({ lyricTranslation: v }),
        setLyricLatinOnly: (v) => set({ lyricLatinOnly: v }),
        setSaveLrcFile: (v) => set({ saveLrcFile: v }),

        // ─── Anime search (opt-in, off by default) ───
        animeSearchEnabled: false,
        setAnimeSearchEnabled: (v) => set({ animeSearchEnabled: v }),
        androidFastSearchMode: false,
        setAndroidFastSearchMode: (v) => set({ androidFastSearchMode: v }),

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
        uiLanguageMode: state.uiLanguageMode,
        lyricOriginal: state.lyricOriginal,
        lyricRomanization: state.lyricRomanization,
        lyricTranslation: state.lyricTranslation,
        lyricLatinOnly: state.lyricLatinOnly,
        saveLrcFile: state.saveLrcFile,
        animeSearchEnabled: state.animeSearchEnabled,
        androidFastSearchMode: state.androidFastSearchMode,
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
        uiLanguageMode: isUiLanguageMode(persisted?.uiLanguageMode)
          ? persisted.uiLanguageMode
          : isUiLanguageMode(persisted?.appLanguage)
            ? (persisted.appLanguage as Lang)
            : 'system',
        lyricOriginal: persisted?.lyricOriginal ?? true,
        lyricRomanization: persisted?.lyricRomanization ?? true,
        lyricTranslation: persisted?.lyricTranslation ?? true,
        lyricLatinOnly: persisted?.lyricLatinOnly ?? false,
        saveLrcFile: persisted?.saveLrcFile ?? true,
        animeSearchEnabled: persisted?.animeSearchEnabled ?? false,
        androidFastSearchMode: persisted?.androidFastSearchMode ?? false,
        mostDownloadedArtists: persisted?.mostDownloadedArtists ?? [],
        preferredPlayerPackage: persisted?.preferredPlayerPackage ?? null,
      }),
    }
  )
);

