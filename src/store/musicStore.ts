import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Track, Download } from '@/types/music';
import { audioEngine } from '@/lib/audioEngine';
import { searchDeezer, downloadTrackAudio, getDeezerTrackMeta, getLyrics, getDownloadCandidates, invalidateDownloadCandidateCache } from '@/lib/api/musicApi';
import { writeID3Tags } from '@/lib/id3Writer';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { toast } from 'sonner';
import { translate } from '@/lib/i18n';
import {
  type Lang,
  type UiLanguageMode,
  type LyricsTargetLanguage,
  isUiLanguageMode,
  isLyricsTargetLanguage,
  resolveEffectiveLanguage,
  resolveSystemLanguage,
} from '@/lib/language';
import { decodeBase64ArrayBuffer, encodeArrayBufferBase64 } from '@/lib/binaryEncoding';
import { getDeviceContext } from '@/lib/deviceContext';
import { canDownloadWithOneTap, type EditionPreference } from '@/lib/download/candidateResolver';

export type ResolutionProfile = 'adaptive' | 'economy';
export type CellularResolutionPolicy = 'off' | 'light' | 'full';

function storeText(mode: UiLanguageMode, key: string, vars?: Record<string, string | number>): string {
  return translate(resolveEffectiveLanguage(mode), key, vars);
}

let searchRequestId = 0;
let isProcessingDownloadQueue = false;
let rateLimitCooldownUntil = 0;

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
  lyricsTargetLanguage: LyricsTargetLanguage;
  setLyricOriginal: (v: boolean) => void;
  setLyricRomanization: (v: boolean) => void;
  setLyricTranslation: (v: boolean) => void;
  setLyricLatinOnly: (v: boolean) => void;
  setSaveLrcFile: (v: boolean) => void;
  setLyricsTargetLanguage: (v: LyricsTargetLanguage) => void;

  // ─── Anime search (opt-in, off by default) ───
  animeSearchEnabled: boolean;
  setAnimeSearchEnabled: (v: boolean) => void;
  autoCandidateResolution: boolean;
  resolutionProfile: ResolutionProfile;
  cellularResolutionPolicy: CellularResolutionPolicy;
  editionPreference: EditionPreference;
  setAutoCandidateResolution: (v: boolean) => void;
  setResolutionProfile: (v: ResolutionProfile) => void;
  setCellularResolutionPolicy: (v: CellularResolutionPolicy) => void;
  setEditionPreference: (v: EditionPreference) => void;

  // ─── Auto-download ───
  autoDownload: boolean;
  setAutoDownload: (v: boolean) => void;

  // ─── yt-dlp status ───
  ytDlpVersion: string | null;
  ytDlpUpdateAvailable: boolean;
  ytDlpUpdating: boolean;
  setYtDlpVersion: (version: string | null) => void;
  setYtDlpUpdateAvailable: (v: boolean) => void;
  setYtDlpUpdating: (v: boolean) => void;

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
          let resolvedVideoId = videoIdOverride;
          if (Date.now() < rateLimitCooldownUntil) {
            const seconds = Math.ceil((rateLimitCooldownUntil - Date.now()) / 1000);
            set((s) => ({
              downloads: s.downloads.map((download) => download.id === id
                ? { ...download, status: 'error', error: `rate_limit: espera ${seconds}s antes de reintentar` }
                : download),
            }));
            return;
          }
          set((s) => ({ activeDownloads: s.activeDownloads + 1 }));

          const updateDl = (patch: Partial<Download>) =>
            set((s) => ({
              downloads: s.downloads.map((d) => (d.id === id ? { ...d, ...patch } : d)),
            }));

          updateDl({ status: 'downloading', progress: 5 });

          const maxAttempts = 3;
          const resolvedFileName = buildDownloadFileName(track, 'm4a');
          const nativeContext = await getDeviceContext().catch(() => null);
          const lyricsTarget = get().lyricsTargetLanguage;
          const lyricsLanguage = lyricsTarget === 'system'
            ? resolveSystemLanguage(nativeContext?.locale ? [nativeContext.locale] : undefined)
            : lyricsTarget;
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
                deviceLang: lyricsLanguage,
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
                  resolvedVideoId ?? null,
                  track.canonicalTitle?.trim() || track.title,
                  track.artist,
                  queries,
                  sourceUrlOverride ?? null,
                  track.duration ?? 0,
                ),
                supplementalDataPromise,
              ]);
              if (!rawResult.success) throw new Error(rawResult.error || 'Error descargando audio');
              const lyrics = lyricsResult.synced && get().saveLrcFile
                ? null
                : lyricsResult.plain || null;

              updateDl({ progress: 50 });
              const audioBuffer = decodeBase64ArrayBuffer(rawResult.data_b64 as string);

              updateDl({ progress: 70 });

              const fileName = buildDownloadFileName(track, 'm4a');
              const filePath = outputDir + '/' + fileName;
              
              const writeResult = await api.tag_and_save_m4a(
                filePath,
                rawResult.data_b64 as string,
                track.canonicalTitle?.trim() || track.title,
                track.artist,
                getPreferredAlbumName(track),
                track.cover,
                lyrics
              );
              
              if (!writeResult?.success) {
                throw new Error(writeResult?.error || 'No se pudo guardar el archivo descargado');
              }
              
              updateDl({ progress: 95 });

              // Guardar .lrc opcionalmente
              if (lyricsResult.synced && get().saveLrcFile) {
                const lrcName = buildDownloadFileName(track, 'lrc');
                const lrcPath = outputDir + '/' + lrcName;
                const lrcBytes = new TextEncoder().encode(lyricsResult.synced);
                await api.write_file_bytes(lrcPath, Array.from(lrcBytes));
              }

              updateDl({ progress: 100, status: 'completed', error: undefined, fileName });
              get().addMostDownloadedArtist(track.artist);
              toast.success(storeText(get().uiLanguageMode, 'downloadCompletedToast', {
                title: track.title,
                artist: track.artist,
              }), {
                duration: 6000,
                action: {
                  label: storeText(get().uiLanguageMode, 'openInPlayer'),
                  onClick: () => {
                    import('@/lib/openFileBridge').then(({ openDownloadedFile }) => {
                      const dl = get().downloads.find(d => d.id === id);
                      openDownloadedFile(dl?.fileName, dl?.mediaUri, get().preferredPlayerPackage ?? undefined);
                    });
                  },
                },
              });
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
                }, resolvedVideoId, sourceUrlOverride),
                supplementalDataPromise,
              ]);
              updateDl({ progress: 80 });
              // Siempre incrustar la mejor versión de lyrics en el audio
              const lyrics = lyricsResult.synced || lyricsResult.plain || null;

              if (Capacitor.isNativePlatform()) {
                const { tagAndSaveM4A } = await import('@/lib/ytdlpBridge');
                const base64 = encodeArrayBufferBase64(audioBuffer);
                
                const mediaUri = await tagAndSaveM4A({
                  fileName: resolvedFileName,
                  data: base64,
                  title: track.canonicalTitle?.trim() || track.title,
                  artist: track.artist,
                  album: getPreferredAlbumName(track),
                  coverUrl: track.cover,
                  lyrics: lyrics || undefined,
                });
                
                updateDl({ progress: 95, mediaUri });

                // Guardar .lrc junto al M4A
                if (lyricsResult.synced && get().saveLrcFile) {
                  const lrcName = resolvedFileName.replace(/\.[^.]+$/, '.lrc');
                  Filesystem.writeFile({
                    path: `Music/MHL Music/${lrcName}`,
                    data: lyricsResult.synced,
                    directory: Directory.ExternalStorage,
                    encoding: Encoding.UTF8,
                  }).catch(() => {});
                }
              } else {
                // Web/Desktop wrapper
                const fileName = resolvedFileName;
                
                if (window.pywebview) {
                  const { api } = window as any;
                  const filePath = (get().downloadFolder as any) + '/' + fileName;
                  
                  const writeResult = await api.tag_and_save_m4a(
                    filePath,
                    encodeArrayBufferBase64(audioBuffer),
                    track.canonicalTitle?.trim() || track.title,
                    track.artist,
                    getPreferredAlbumName(track),
                    track.cover,
                    lyrics
                  );
                  
                  if (!writeResult?.success) {
                    throw new Error(writeResult?.error || 'No se pudo guardar el archivo descargado');
                  }
                } else {
                  // Fallback Web (Not supported with browser-id3-writer for M4A)
                  const blob = new Blob([audioBuffer], { type: 'audio/mp4' });
                  const blobUrl = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = blobUrl;
                  a.download = fileName;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(blobUrl);
                }
                
                updateDl({ progress: 95 });

                if (lyricsResult.synced && get().saveLrcFile) {
                  const lrcName = resolvedFileName.replace(/\.[^.]+$/, '.lrc');
                  if (window.pywebview) {
                    const { api } = window as any;
                    const lrcPath = (get().downloadFolder as any) + '/' + lrcName;
                    const lrcBytes = new TextEncoder().encode(lyricsResult.synced);
                    await api.write_file_bytes(lrcPath, Array.from(lrcBytes));
                  }
                }
              }

              updateDl({ progress: 100, status: 'completed', error: undefined, fileName: resolvedFileName });
              get().addMostDownloadedArtist(track.artist);
              toast.success(storeText(get().uiLanguageMode, 'downloadCompletedToast', {
                title: track.title,
                artist: track.artist,
              }), {
                duration: 6000,
                action: {
                  label: storeText(get().uiLanguageMode, 'openInPlayer'),
                  onClick: () => {
                    import('@/lib/openFileBridge').then(({ openDownloadedFile }) => {
                      const dl = get().downloads.find(d => d.id === id);
                      openDownloadedFile(dl?.fileName, dl?.mediaUri, get().preferredPlayerPackage ?? undefined);
                    });
                  },
                },
              });
              return;
            } catch (error) {
              const msg = error instanceof Error ? error.message : 'Download failed';

              if (/rate_limit|403|forbidden/i.test(msg)) {
                rateLimitCooldownUntil = Date.now() + 5 * 60 * 1000;
                updateDl({ status: 'error', error: msg });
                return;
              }

              if (/^(metadata|write):/i.test(msg)) {
                updateDl({ status: 'error', error: msg });
                return;
              }

              if (!sourceUrlOverride && resolvedVideoId && /unavailable|not available|candidate_invalid/i.test(msg)) {
                invalidateDownloadCandidateCache(track);
                const alternatives = await getDownloadCandidates(track, get().animeSearchEnabled, {
                  depth: 'deep', editionPreference: get().editionPreference,
                }).catch(() => []);
                const alternative = alternatives.find((candidate) =>
                  candidate.videoId !== resolvedVideoId && canDownloadWithOneTap(candidate));
                if (!alternative) {
                  updateDl({ status: 'error', error: msg });
                  return;
                }
                resolvedVideoId = alternative.videoId;
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

          const previous = get().downloads.find((download) =>
            download.track.id === track.id && Boolean(download.videoIdOverride));
          if (previous?.videoIdOverride) get().startDownloadWithVideoId(track, previous.videoIdOverride);
          else toast.warning(storeText(get().uiLanguageMode, 'chooseExactSong'));
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
        saveLrcFile: false,
        lyricsTargetLanguage: 'system',
        setLyricOriginal: (v) => set({ lyricOriginal: v }),
        setLyricRomanization: (v) => set({ lyricRomanization: v }),
        setLyricTranslation: (v) => set({ lyricTranslation: v }),
        setLyricLatinOnly: (v) => set({ lyricLatinOnly: v }),
        setSaveLrcFile: (v) => set({ saveLrcFile: v }),
        setLyricsTargetLanguage: (v) => set({ lyricsTargetLanguage: v }),

        // ─── Anime search (opt-in, off by default) ───
        animeSearchEnabled: false,
        setAnimeSearchEnabled: (v) => set({ animeSearchEnabled: v }),
        autoCandidateResolution: true,
        resolutionProfile: 'adaptive',
        cellularResolutionPolicy: 'light',
        editionPreference: 'catalog',
        setAutoCandidateResolution: (v) => set({ autoCandidateResolution: v }),
        setResolutionProfile: (v) => set({ resolutionProfile: v }),
        setCellularResolutionPolicy: (v) => set({ cellularResolutionPolicy: v }),
        setEditionPreference: (v) => set({ editionPreference: v }),

        // ─── Auto-download ───
        autoDownload: true,
        setAutoDownload: (v) => set({ autoDownload: v }),

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
        lyricsTargetLanguage: state.lyricsTargetLanguage,
        animeSearchEnabled: state.animeSearchEnabled,
        autoCandidateResolution: state.autoCandidateResolution,
        resolutionProfile: state.resolutionProfile,
        cellularResolutionPolicy: state.cellularResolutionPolicy,
        editionPreference: state.editionPreference,
        mostDownloadedArtists: state.mostDownloadedArtists,
        preferredPlayerPackage: state.preferredPlayerPackage,
        autoDownload: state.autoDownload,
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
        saveLrcFile: persisted?.saveLrcFile ?? false,
        lyricsTargetLanguage: isLyricsTargetLanguage(persisted?.lyricsTargetLanguage)
          ? persisted.lyricsTargetLanguage
          : 'system',
        animeSearchEnabled: persisted?.animeSearchEnabled ?? false,
        autoCandidateResolution: persisted?.autoCandidateResolution ?? true,
        resolutionProfile: persisted?.resolutionProfile === 'economy' || persisted?.resolutionProfile === 'adaptive'
          ? persisted.resolutionProfile
          : persisted?.androidFastSearchMode === true ? 'economy' : 'adaptive',
        cellularResolutionPolicy: ['off', 'light', 'full'].includes(persisted?.cellularResolutionPolicy)
          ? persisted.cellularResolutionPolicy
          : 'light',
        editionPreference: ['catalog', 'explicit', 'clean', 'ask'].includes(persisted?.editionPreference)
          ? persisted.editionPreference
          : 'catalog',
        mostDownloadedArtists: persisted?.mostDownloadedArtists ?? [],
        preferredPlayerPackage: persisted?.preferredPlayerPackage ?? null,
        autoDownload: persisted?.autoDownload ?? true,
      }),
    }
  )
);

