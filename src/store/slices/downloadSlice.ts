import { StateCreator } from 'zustand';
import { MusicStore, DownloadSlice } from './types';
import { Track, Download } from '@/types/music';
import { Capacitor } from '@capacitor/core';
import { toast } from 'sonner';
import { storeText } from './utils';
import { canDownloadWithOneTap } from '@/lib/download/candidateResolver';
import {
  downloadTrackAudio,
  getDownloadCandidates,
  getDeezerTrackMeta,
  getLyrics,
  invalidateDownloadCandidateCache,
  type DownloadCandidate,
} from '@/lib/api/musicApi';
import {
  addDownloadProgressListener,
  cleanupTempAudioNative,
  downloadAudioToTempNative,
  tagAndSaveM4A,
} from '@/lib/ytdlpBridge';
import { buildDownloadFileName, getPreferredAlbumName } from '@/lib/music/metadata';
import { getDeviceContext } from '@/lib/deviceContext';
import { resolveSystemLanguage } from '@/lib/language';

let isProcessingDownloadQueue = false;
let rateLimitCooldownUntil = 0;
let retryDelayMs = 2000;
let cooldownResumeTimer: ReturnType<typeof setTimeout> | null = null;

function clearCooldownResumeTimer(): void {
  if (cooldownResumeTimer !== null) {
    clearTimeout(cooldownResumeTimer);
    cooldownResumeTimer = null;
  }
}

function scheduleCooldownResume(resumeFn: () => void): void {
  const remaining = rateLimitCooldownUntil - Date.now();
  if (remaining <= 0) return;
  clearCooldownResumeTimer();
  const delay = Math.max(50, remaining + 50);
  cooldownResumeTimer = setTimeout(() => {
    cooldownResumeTimer = null;
    if (Date.now() < rateLimitCooldownUntil) {
      scheduleCooldownResume(resumeFn);
      return;
    }
    resumeFn();
  }, delay);
}

function sanitizeSourceUrl(url?: string): string | undefined {
  if (!url || typeof url !== 'string') return undefined;
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed);
    if (
      parsed.protocol === 'https:'
      && parsed.hostname.toLowerCase() === 'a.animethemes.moe'
      && parsed.pathname.length > 1
      && !parsed.username
      && !parsed.password
    ) {
      return trimmed;
    }
  } catch {
    // invalid URL
  }
  return undefined;
}

export const __downloadSliceTesting = {
  resetRateLimitCooldown: () => {
    rateLimitCooldownUntil = 0;
    clearCooldownResumeTimer();
  },
  setRateLimitCooldownUntil: (timestamp: number) => {
    rateLimitCooldownUntil = timestamp;
  },
  setRetryDelayMs: (ms: number) => {
    retryDelayMs = ms;
  },
};

export const MAX_BATCH_DOWNLOAD_SIZE = 50;

function pickDownloadCandidate(candidates: DownloadCandidate[]): DownloadCandidate | undefined {
  if (!Array.isArray(candidates)) return undefined;
  return (
    candidates.find((c) => canDownloadWithOneTap(c)) ||
    candidates.find((c) => c.verification !== 'rejected')
  );
}

const getMaxConcurrentDownloads = () =>
  typeof window !== 'undefined' && 'pywebview' in window ? 3 : 2;

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
            const maxConcurrent = getMaxConcurrentDownloads();
            while (get().activeDownloads < maxConcurrent && get().downloadQueue.length > 0) {
              const nextId = get().downloadQueue[0];
              const dl = get().downloads.find((d) => d.id === nextId);
              if (!dl || dl.status !== 'queued') {
                set((s) => ({
                  downloadQueue: s.downloadQueue.filter((queuedId) => queuedId !== nextId),
                }));
                continue;
              }

              set((s) => ({
                downloadQueue: s.downloadQueue.filter((queuedId) => queuedId !== nextId),
                activeDownloads: s.activeDownloads + 1,
              }));

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
          // Comprobar cooldown de rate-limit ANTES de hacer llamadas de red para candidatos
          if (Date.now() < rateLimitCooldownUntil) {
            const seconds = Math.ceil((rateLimitCooldownUntil - Date.now()) / 1000);
            set((s) => ({
              activeDownloads: Math.max(0, s.activeDownloads - 1),
              downloads: s.downloads.map((download) => download.id === id
                ? { ...download, status: 'error', error: storeText(get().uiLanguageMode, 'rateLimitCooldown', { seconds }) }
                : download),
            }));
            if (get().downloadQueue.length > 0) {
              scheduleCooldownResume(() => {
                void get().processDownloadQueue();
              });
            }
            return;
          }

          const updateDl = (patch: Partial<Download>) =>
            set((s) => ({
              downloads: s.downloads.map((d) => (d.id === id ? { ...d, ...patch } : d)),
            }));

          updateDl({ status: 'downloading', progress: 5 });

          let resolvedVideoId = videoIdOverride;
          const cleanSourceUrl = sanitizeSourceUrl(sourceUrlOverride);
          const preferredTitle = track.canonicalTitle?.trim() || track.title;

          // Si no hay videoId ni sourceUrl válido, resolver dinámicamente el mejor candidato de YouTube Music
          if (!resolvedVideoId && !cleanSourceUrl) {
            try {
              const candidates = await getDownloadCandidates(track, get().animeSearchEnabled, {
                depth: 'light',
                editionPreference: get().editionPreference,
              });
              const best = pickDownloadCandidate(candidates);
              if (best) {
                resolvedVideoId = best.videoId;
                updateDl({ videoIdOverride: resolvedVideoId });
              }
            } catch {
              // fallback
            }
          }

          if (track.isLongAudio || (track.duration && track.duration > 1200)) {
            toast.warning(storeText(get().uiLanguageMode, 'longAudioWarning'), { duration: 6000 });
          }

          const maxAttempts = 3;
          const fmt = get().downloadAudioFormat || 'm4a';
          const resolvedFileName = buildDownloadFileName(track, fmt);
          const nativeContext = await getDeviceContext().catch(() => null);
          const lyricsTarget = get().lyricsTargetLanguage;
          const lyricsLanguage = lyricsTarget === 'system'
            ? resolveSystemLanguage(nativeContext?.locale ? [nativeContext.locale] : undefined)
            : lyricsTarget;
          const defaultTrackMeta = {
            albumArtist: track.artist,
            composer: null,
            genre: null,
            year: null,
            trackNumber: null,
            trackTotal: null,
            discNumber: 1,
            discTotal: 1,
          };
          const supplementalDataPromise = Promise.all([
            Promise.resolve(
              getDeezerTrackMeta(
                track.deezerId || track.id,
                track,
              ),
            ).catch(() => defaultTrackMeta),
            Promise.resolve(
              getLyrics(
                preferredTitle,
                track.artist,
                track.duration,
                {
                  lyricOriginal: get().lyricOriginal,
                  lyricRomanization: get().lyricRomanization,
                  lyricTranslation: get().lyricTranslation,
                  lyricLatinOnly: get().lyricLatinOnly,
                  deviceLang: lyricsLanguage,
                },
              ),
            ).catch(() => ({ synced: null, plain: null })),
          ]);

          // Listener de progreso real de yt-dlp (Android): conecta 0-100% nativo → 25-80% UI
          let progressHandle: { remove: () => void } | null = null;
          let isDownloadActive = true;
          if (Capacitor.isNativePlatform()) {
            Promise.resolve(
              addDownloadProgressListener((evt) => {
                if (evt.downloadId && evt.downloadId !== id) return;
                if (typeof evt.progress !== 'number' || Number.isNaN(evt.progress) || evt.progress < 0) return;
                const clampedProgress = Math.min(100, evt.progress);
                const mapped = Math.round(25 + (clampedProgress / 100) * 55);
                updateDl({ progress: mapped, speed: evt.speed || undefined, eta: evt.eta > 0 ? evt.eta : undefined });
              }),
            ).then((handle) => {
              if (!isDownloadActive) {
                handle?.remove();
              } else {
                progressHandle = handle;
              }
            }).catch(() => {});
          }

          const isPyWebView = typeof window !== 'undefined' && 'pywebview' in window;

          try {
          for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
              updateDl({
                progress: 10,
                error: attempt > 1
                  ? storeText(get().uiLanguageMode, 'retryingAttempt', { attempt, max: maxAttempts })
                  : undefined,
              });

              if (isPyWebView) {
                // PyWebView Desktop: Python descarga audio en disco temporal (Zero-Base64) y Mutagen inyecta metadata
                let tempPathToClean: string | null = null;
                let desktopAttemptEnded = false;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const api = (window as any).pywebview?.api;
                try {
                  if (!api) throw new Error('write: PyWebView API unavailable');

                  if (!resolvedVideoId && !cleanSourceUrl) {
                    try {
                      const candidates = await getDownloadCandidates(track, get().animeSearchEnabled, {
                        depth: 'deep',
                        editionPreference: get().editionPreference,
                      });
                      const best = pickDownloadCandidate(candidates);
                      if (best) {
                        resolvedVideoId = best.videoId;
                        updateDl({ videoIdOverride: resolvedVideoId });
                      }
                    } catch {
                      // fallback
                    }
                  }

                  const queries = [
                    `${preferredTitle} ${track.artist}`,
                    `${preferredTitle} ${track.artist} official audio`,
                  ];
                  const [rawResult, [rawTrackMeta, rawLyricsResult], settings] = await Promise.all([
                    Promise.resolve(
                      api.get_raw_audio(
                        resolvedVideoId ?? null,
                        preferredTitle,
                        track.artist,
                        queries,
                        cleanSourceUrl ?? null,
                        track.duration ?? 0,
                        fmt,
                        true,
                      ),
                    ).then((res: { success?: boolean; temp_path?: string; data_b64?: string; error?: string } | null | undefined) => {
                      if (res?.temp_path) {
                        if (desktopAttemptEnded) {
                          if (api.cleanup_temp_audio) {
                            Promise.resolve(api.cleanup_temp_audio(res.temp_path)).catch(() => {});
                          }
                        } else {
                          tempPathToClean = res.temp_path;
                        }
                      }
                      return res;
                    }),
                    supplementalDataPromise,
                    Promise.resolve(api.get_settings()).catch((err: unknown) => {
                      const errMsg = err instanceof Error ? err.message : 'settings read failed';
                      throw new Error(`write: ${errMsg}`);
                    }),
                  ]);
                  if (!rawResult?.success) throw new Error(rawResult?.error || 'Error descargando audio');
                  const trackMeta = rawTrackMeta ?? defaultTrackMeta;
                  const lyrics = rawLyricsResult?.synced || rawLyricsResult?.plain || null;

                  updateDl({ progress: 70 });

                  const outputDir = settings?.download_folder || 'C:/Users/Paul/Music/MHL Music';
                  const filePath = outputDir + '/' + resolvedFileName;
                  const rawTempPath = rawResult.temp_path || null;

                  const writeResult = await api.tag_and_save_m4a(
                    filePath,
                    rawTempPath ? null : (rawResult.data_b64 as string),
                    preferredTitle,
                    track.artist,
                    getPreferredAlbumName(track),
                    track.cover,
                    lyrics,
                    trackMeta.albumArtist || track.artist,
                    trackMeta.composer || undefined,
                    trackMeta.genre || undefined,
                    trackMeta.year ? String(trackMeta.year) : undefined,
                    trackMeta.trackNumber || undefined,
                    trackMeta.trackTotal || undefined,
                    trackMeta.discNumber || undefined,
                    trackMeta.discTotal || undefined,
                    rawTempPath,
                  );

                  if (!writeResult?.success) {
                    throw new Error(`write: ${writeResult?.error || 'No se pudo guardar el archivo descargado'}`);
                  }
                  if (rawTempPath) {
                    tempPathToClean = null;
                  }

                  updateDl({ progress: 95 });
                } finally {
                  desktopAttemptEnded = true;
                  if (tempPathToClean && api?.cleanup_temp_audio) {
                    await Promise.resolve(api.cleanup_temp_audio(tempPathToClean)).catch(() => {});
                  }
                }
              } else if (Capacitor.isNativePlatform()) {
                let tempPathToClean: string | null = null;
                let nativeAttemptEnded = false;
                try {
                  const downloadNativeTemp = async (): Promise<{ tempPath: string; size: number; fileName?: string }> => {
                    if (cleanSourceUrl) {
                      updateDl({ progress: 10 });
                      try {
                        return await downloadAudioToTempNative(null, {
                          sourceUrl: cleanSourceUrl,
                          expectedDuration: track.duration,
                          format: fmt,
                          downloadId: id,
                        });
                      } catch {
                        // La fuente curada puede estar temporalmente caída; usar YouTube como respaldo.
                      }
                    }

                    if (!resolvedVideoId) {
                      try {
                        const candidates = await getDownloadCandidates(track, get().animeSearchEnabled, {
                          depth: 'deep',
                          editionPreference: get().editionPreference,
                        });
                        const best = pickDownloadCandidate(candidates);
                        if (best) {
                          resolvedVideoId = best.videoId;
                          updateDl({ videoIdOverride: resolvedVideoId });
                        }
                      } catch {
                        // fallback
                      }
                    }

                    if (!resolvedVideoId) {
                      throw new Error('candidate_invalid: La descarga requiere un candidato resuelto');
                    }

                    updateDl({ progress: 10 });
                    try {
                      return await downloadAudioToTempNative(resolvedVideoId, {
                        expectedDuration: track.duration,
                        format: fmt,
                        downloadId: id,
                      });
                    } catch (error) {
                      const message = error instanceof Error ? error.message : 'No se pudo descargar';
                      if (/403|forbidden|rate.?limit/i.test(message)) {
                        throw new Error(`rate_limit: ${message}`);
                      }
                      throw new Error(`extraction: ${message}`);
                    }
                  };

                  const [downloaded, [rawTrackMeta, rawLyricsResult]] = await Promise.all([
                    downloadNativeTemp().then((res) => {
                      if (res?.tempPath) {
                        if (nativeAttemptEnded) {
                          void cleanupTempAudioNative(res.tempPath).catch(() => {});
                        } else {
                          tempPathToClean = res.tempPath;
                        }
                      }
                      return res;
                    }),
                    supplementalDataPromise,
                  ]);
                  updateDl({ progress: 80 });
                  const trackMeta = rawTrackMeta ?? defaultTrackMeta;
                  const lyrics = rawLyricsResult?.synced || rawLyricsResult?.plain || null;

                  const mediaUri = await tagAndSaveM4A({
                    fileName: resolvedFileName,
                    tempPath: downloaded.tempPath,
                    title: preferredTitle,
                    artist: track.artist,
                    album: getPreferredAlbumName(track),
                    coverUrl: track.cover,
                    lyrics: lyrics || undefined,
                    albumArtist: trackMeta.albumArtist || track.artist,
                    composer: trackMeta.composer || undefined,
                    genre: trackMeta.genre || undefined,
                    year: trackMeta.year ? String(trackMeta.year) : undefined,
                    trackNumber: trackMeta.trackNumber ? String(trackMeta.trackNumber) : undefined,
                    trackTotal: trackMeta.trackTotal ? String(trackMeta.trackTotal) : undefined,
                    discNumber: trackMeta.discNumber ? String(trackMeta.discNumber) : undefined,
                    discTotal: trackMeta.discTotal ? String(trackMeta.discTotal) : undefined,
                  });
                  tempPathToClean = null;

                  updateDl({ progress: 95, mediaUri });
                } finally {
                  nativeAttemptEnded = true;
                  if (tempPathToClean) {
                    await cleanupTempAudioNative(tempPathToClean).catch(() => {});
                  }
                }
              } else {
                const [audioBuffer] = await Promise.all([
                  downloadTrackAudio(track, (progress) => {
                    updateDl({ progress });
                  }, resolvedVideoId, cleanSourceUrl, fmt),
                  supplementalDataPromise,
                ]);
                updateDl({ progress: 80 });

                // Fallback Web (Not supported with browser-id3-writer for M4A)
                const blob = new Blob([audioBuffer], { type: 'audio/mp4' });
                const blobUrl = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = blobUrl;
                a.download = resolvedFileName;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(blobUrl);

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
                toast.error(storeText(get().uiLanguageMode, 'downloadError', { error: msg }), { duration: 5000 });
                return;
              }

              if (/^(metadata|write):/i.test(msg)) {
                updateDl({ status: 'error', error: msg });
                toast.error(storeText(get().uiLanguageMode, 'downloadError', { error: msg }), { duration: 5000 });
                return;
              }

              if (!cleanSourceUrl && /unavailable|not available|candidate_invalid/i.test(msg)) {
                invalidateDownloadCandidateCache(track);
                const alternatives = await getDownloadCandidates(track, get().animeSearchEnabled, {
                  depth: 'deep', editionPreference: get().editionPreference,
                }).catch(() => []);
                const alternative = pickDownloadCandidate(
                  Array.isArray(alternatives)
                    ? alternatives.filter((candidate) => candidate.videoId !== resolvedVideoId)
                    : [],
                );
                if (!alternative) {
                  updateDl({ status: 'error', error: msg });
                  toast.error(storeText(get().uiLanguageMode, 'downloadError', { error: msg }), { duration: 5000 });
                  return;
                }
                resolvedVideoId = alternative.videoId;
                updateDl({ videoIdOverride: resolvedVideoId });
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
                toast.error(storeText(get().uiLanguageMode, 'downloadError', { error: msg }), { duration: 5000 });
              } else {
                updateDl({
                  status: 'downloading',
                  progress: 0,
                  error: storeText(get().uiLanguageMode, 'retryingAttempt', {
                    attempt: attempt + 1,
                    max: maxAttempts,
                  }),
                });
                await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
              }
            }
          }
          } finally {
            isDownloadActive = false;
            progressHandle?.remove();
            set((s) => ({ activeDownloads: Math.max(0, s.activeDownloads - 1) }));
            if (Date.now() >= rateLimitCooldownUntil) {
              void get().processDownloadQueue();
            } else if (get().downloadQueue.length > 0) {
              scheduleCooldownResume(() => {
                void get().processDownloadQueue();
              });
            }
          }
        },

        startDownload: async (track) => {
          // Si ya está en cola o descargando, ignorar
          const isAlreadyActive = get().downloads.some(
            (d) => d.track.id === track.id && (d.status === 'downloading' || d.status === 'queued'),
          );
          if (isAlreadyActive) return;

          if (track.youtubeId) {
            get().startDownloadWithVideoId(track, track.youtubeId);
            return;
          }
          const safeSourceUrl = sanitizeSourceUrl(track.sourceUrl);
          if (safeSourceUrl) {
            get().startDownloadWithSourceUrl(track, safeSourceUrl);
            return;
          }

          const previous = get().downloads.find((download) =>
            download.track.id === track.id && Boolean(download.videoIdOverride));
          if (previous?.videoIdOverride) get().startDownloadWithVideoId(track, previous.videoIdOverride);
          else toast.warning(storeText(get().uiLanguageMode, 'chooseExactSong'));
        },

        startDownloadWithSourceUrl: (track, sourceUrl) => {
          const isAlreadyActive = get().downloads.some(
            (d) => d.track.id === track.id && (d.status === 'downloading' || d.status === 'queued'),
          );
          if (isAlreadyActive) return;

          const id = crypto.randomUUID();
          set((s) => ({
            downloads: [
              ...s.downloads,
              {
                id,
                track,
                sourceUrlOverride: sanitizeSourceUrl(sourceUrl),
                progress: 0,
                status: 'queued' as const,
              },
            ],
            downloadQueue: [...s.downloadQueue, id],
          }));
          void get().processDownloadQueue();
        },

        startDownloadWithVideoId: (track, videoId) => {
          const isAlreadyActive = get().downloads.some(
            (d) => d.track.id === track.id && (d.status === 'downloading' || d.status === 'queued'),
          );
          if (isAlreadyActive) return;

          const id = crypto.randomUUID();
          set((s) => ({
            downloads: [
              ...s.downloads,
              {
                id,
                track,
                videoIdOverride: videoId,
                progress: 0,
                status: 'queued' as const,
              },
            ],
            downloadQueue: [...s.downloadQueue, id],
          }));
          void get().processDownloadQueue();
        },

        startBatchDownload: (tracks) => {
          const activeTrackIds = new Set(
            get()
              .downloads
              .filter((d) => d.status === 'downloading' || d.status === 'queued')
              .map((d) => d.track.id),
          );
          const seenBatchIds = new Set<string>();
          const uniqueValid: Track[] = [];
          let skipped = 0;

          for (const track of tracks) {
            if (!track?.id || activeTrackIds.has(track.id) || seenBatchIds.has(track.id)) {
              skipped += 1;
              continue;
            }
            seenBatchIds.add(track.id);
            uniqueValid.push(track);
          }

          const truncated = uniqueValid.length > MAX_BATCH_DOWNLOAD_SIZE;
          const toEnqueue = truncated ? uniqueValid.slice(0, MAX_BATCH_DOWNLOAD_SIZE) : uniqueValid;

          if (toEnqueue.length === 0) {
            return { queued: 0, skipped, truncated: false };
          }

          const newDownloads: Download[] = toEnqueue.map((track) => ({
            id: crypto.randomUUID(),
            track,
            videoIdOverride: track.youtubeId || undefined,
            sourceUrlOverride: sanitizeSourceUrl(track.sourceUrl),
            progress: 0,
            status: 'queued' as const,
          }));

          set((s) => ({
            downloads: [...s.downloads, ...newDownloads],
            downloadQueue: [...s.downloadQueue, ...newDownloads.map((d) => d.id)],
          }));
          void get().processDownloadQueue();

          return { queued: toEnqueue.length, skipped, truncated };
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
