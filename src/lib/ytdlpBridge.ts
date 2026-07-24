import { registerPlugin, Capacitor } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';

export interface YtDlpSearchResult {
  videoId: string;
  title: string;
  duration: number;
  channel: string;
  source: 'youtube_music' | 'youtube';
  resultType?: string;
  artist?: string;
  album?: string;
  isrc?: string;
  edition?: 'explicit' | 'clean' | 'unknown';
  sourceCodec?: string;
  sourceAbr?: number;
}

export interface YtDlpProgressEvent {
  progress: number;  // 0-100
  eta: number;       // segundos restantes
  speed: string;     // e.g. "1.2 MB/s"
}

interface YtDlpPluginInterface {
  initialize(): Promise<{ success: boolean }>;
  update(): Promise<{ success: boolean; status: string }>;
  getVersion(): Promise<{ success: boolean; version: string }>;
  search(options: { query: string; limit?: number; source?: 'youtube_music' | 'youtube'; enrich?: boolean }): Promise<{ success: boolean; results: YtDlpSearchResult[] }>;
  getStreamUrl(options: { videoId: string }): Promise<{ success: boolean; url: string }>;
  downloadAsMp3?: (options: { videoId: string }) => Promise<{ success: boolean; data: string; size: number }>;
  downloadAudio?: (options: { videoId?: string; sourceUrl?: string; expectedDuration?: number }) => Promise<{ success: boolean; data: string; size: number; fileName?: string }>;
  saveAudioToMusicMediaStore?: (options: { videoId: string; fileName: string }) => Promise<{ success: boolean; uri: string }>;
  saveTaggedAudioToMusic?: (options: { fileName: string; data: string }) => Promise<{ success: boolean; uri: string }>;
  addListener(eventName: 'downloadProgress', listenerFunc: (event: YtDlpProgressEvent) => void): Promise<PluginListenerHandle>;
}

const YtDlp = registerPlugin<YtDlpPluginInterface>('YtDlp');

let initialized = false;
let initializing: Promise<boolean> | null = null;

export async function initYtDlp(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  if (initialized) return true;
  if (initializing) return initializing;

  initializing = (async () => {
    try {
      await YtDlp.initialize();
      initialized = true;
      if (import.meta.env.DEV) console.log('[YtDlp] Initialized successfully');
      return true;
    } catch (e) {
      console.error('[YtDlp] Init failed:', e);
      return false;
    } finally {
      initializing = null;
    }
  })();

  return initializing;
}

export async function searchYouTubeNative(
  query: string,
  limit = 10,
  options: { source?: 'youtube_music' | 'youtube'; enrich?: boolean } = {},
): Promise<YtDlpSearchResult[]> {
  if (import.meta.env.DEV) console.log('[ytdlpBridge.searchYouTubeNative] Searching:', query, 'initialized:', initialized);
  if (!initialized) {
    if (import.meta.env.DEV) console.log('[ytdlpBridge.searchYouTubeNative] Not initialized, initializing...');
    await initYtDlp();
  }
  if (import.meta.env.DEV) console.log('[ytdlpBridge.searchYouTubeNative] Calling YtDlp.search()...');
  try {
    const result = await YtDlp.search({ query, limit, ...options });
    if (import.meta.env.DEV) console.log('[ytdlpBridge.searchYouTubeNative] Search result:', result);
    return result.results || [];
  } catch (err) {
    console.error('[ytdlpBridge.searchYouTubeNative] Error:', err);
    throw err;
  }
}

export async function downloadMp3Native(
  videoId: string | null,
  opts?: { sourceUrl?: string; expectedDuration?: number },
): Promise<ArrayBuffer> {
  if (!initialized) await initYtDlp();

  const result = YtDlp.downloadAudio
    ? await YtDlp.downloadAudio({
        ...(videoId ? { videoId } : {}),
        ...(opts?.sourceUrl ? { sourceUrl: opts.sourceUrl } : {}),
        ...(opts?.expectedDuration ? { expectedDuration: opts.expectedDuration } : {}),
      })
    : (await YtDlp.downloadAsMp3!({ videoId: videoId ?? '' }));

  if (!result || !result.data) {
    throw new Error('Download failed: no data returned from native plugin');
  }

  const binaryStr = atob(result.data);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return bytes.buffer;
}

export async function getStreamUrlNative(videoId: string): Promise<string> {
  if (!initialized) await initYtDlp();
  const result = await YtDlp.getStreamUrl({ videoId });
  return result.url;
}

export async function updateYtDlp(): Promise<string> {
  if (!initialized) await initYtDlp();
  const r = await YtDlp.update();
  return r.status;
}

export async function getYtDlpVersion(): Promise<string> {
  if (!initialized) await initYtDlp();
  const r = await YtDlp.getVersion();
  return r.version;
}

export async function saveAudioToMediaStore(videoId: string, fileName: string): Promise<string> {
  if (!Capacitor.isNativePlatform()) throw new Error('Not on native platform');
  if (!initialized) await initYtDlp();
  const result = await YtDlp.saveAudioToMusicMediaStore!({ videoId, fileName });
  if (!result?.success) throw new Error('MediaStore save failed');
  return result.uri;
}

export async function saveTaggedAudioToMusic(fileName: string, base64Data: string): Promise<string> {
  if (!Capacitor.isNativePlatform()) throw new Error('Not on native platform');
  if (!initialized) await initYtDlp();
  const operation = YtDlp.saveTaggedAudioToMusic!({ fileName, data: base64Data });
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const result = await Promise.race([
    operation,
    new Promise<never>((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error('write: timeout guardando el MP3 etiquetado')),
        60_000,
      );
    }),
  ]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
  if (!result?.success) throw new Error('MediaStore save failed');
  return result.uri;
}

export async function searchYouTubeNativeMulti(
  queries: string[],
  limit = 5,
  options: { source?: 'youtube_music' | 'youtube'; enrich?: boolean } = {},
): Promise<YtDlpSearchResult[]> {
  if (!initialized) await initYtDlp();

  const results = await runSearchesWithConcurrency(queries, getNativeSearchConcurrency(queries.length), limit, options);

  const seen = new Set<string>();
  const combined: YtDlpSearchResult[] = [];
  for (const result of results) {
    if (result) {
      for (const item of result.results ?? []) {
        if (!seen.has(item.videoId)) {
          seen.add(item.videoId);
          combined.push(item);
        }
      }
    }
  }
  return combined;
}

function getNativeSearchConcurrency(queryCount: number): number {
  return queryCount > 0 ? 1 : 0;
}

async function runSearchesWithConcurrency(
  queries: string[],
  concurrency: number,
  limit: number,
  options: { source?: 'youtube_music' | 'youtube'; enrich?: boolean } = {},
): Promise<Array<{ success: boolean; results: YtDlpSearchResult[] } | null>> {
  const results: Array<{ success: boolean; results: YtDlpSearchResult[] } | null> =
    Array.from({ length: queries.length }, () => null);
  let nextIndex = 0;

  const worker = async () => {
    while (nextIndex < queries.length) {
      const index = nextIndex++;
      try {
        results[index] = await YtDlp.search({ query: queries[index], limit, ...options });
      } catch (error) {
        console.error('[YtDlp] Parallel search failed:', error);
      }
    }
  };

  try {
    await Promise.all(Array.from({ length: concurrency }, () => worker()));
    return results;
  } catch (error) {
    console.error('[YtDlp] Search workers failed:', error);
    return results;
  }
}

export const __testing = {
  getNativeSearchConcurrency,
};

/**
 * Escucha eventos de progreso de yt-dlp en tiempo real (solo Android).
 * Retorna un handle con `.remove()` para limpiar cuando termine la descarga.
 */
export async function addDownloadProgressListener(
  callback: (event: YtDlpProgressEvent) => void
): Promise<PluginListenerHandle | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    return await YtDlp.addListener('downloadProgress', callback);
  } catch {
    return null;
  }
}

export default YtDlp;
