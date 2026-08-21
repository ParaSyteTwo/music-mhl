import { StateCreator } from 'zustand';
import { MusicStore, DownloadSlice } from './types';
import { Capacitor } from '@capacitor/core';
import { toast } from 'sonner';
import { storeText } from './utils';
import { canDownloadWithOneTap } from '@/lib/download/candidateResolver';
import { downloadTrackAudio, getDownloadCandidates, invalidateDownloadCandidateCache } from '@/lib/api/musicApi';
import { encodeArrayBufferBase64, decodeBase64ArrayBuffer } from '@/lib/binaryEncoding';
import { buildDownloadFileName, getPreferredAlbumName } from '@/lib/music/metadata';

let isProcessingDownloadQueue = false;
let rateLimitCooldownUntil = 0;

export const createDownloadSlice: StateCreator<
  MusicStore,
  [],
  [],
  DownloadSlice
> = (set, get) => ({
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
              const lyrics = lyricsResult.synced || lyricsResult.plain || null;

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
          set((s) => {
            const newDownloads = [...s.downloads, {
              id,
              track,
              sourceUrlOverride: sourceUrl,
              progress: 0,
              status: 'queued' as const,
            }];
            return { downloads: newDownloads };
          });
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
          set((s) => {
            const newDownloads = [...s.downloads, {
              id,
              track,
              videoIdOverride: videoId,
              progress: 0,
              status: 'queued' as const,
            }];
            return { downloads: newDownloads };
          });
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
        lyricsTargetLanguage: 'system',
        setLyricOriginal: (v) => set({ lyricOriginal: v }),
        setLyricRomanization: (v) => set({ lyricRomanization: v }),
        setLyricTranslation: (v) => set({ lyricTranslation: v }),
        setLyricLatinOnly: (v) => set({ lyricLatinOnly: v }),
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
});
