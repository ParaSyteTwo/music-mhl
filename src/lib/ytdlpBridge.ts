import { registerPlugin, Capacitor } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';

export interface YtDlpSearchResult {
  videoId: string;
  title: string;
  duration: number;
  channel: string;
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
  search(options: { query: string }): Promise<{ success: boolean; results: YtDlpSearchResult[] }>;
  getStreamUrl(options: { videoId: string }): Promise<{ success: boolean; url: string }>;
  downloadAsMp3?: (options: { videoId: string }) => Promise<{ success: boolean; data: string; size: number }>;
  downloadAudio?: (options: { videoId: string; format?: string; quality?: string }) => Promise<{ success: boolean; data: string; size: number; fileName?: string }>;
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
      console.log('[YtDlp] Initialized successfully');
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

export async function searchYouTubeNative(query: string): Promise<YtDlpSearchResult[]> {
  console.log('[ytdlpBridge.searchYouTubeNative] Searching:', query, 'initialized:', initialized);
  if (!initialized) {
    console.log('[ytdlpBridge.searchYouTubeNative] Not initialized, initializing...');
    await initYtDlp();
  }
  console.log('[ytdlpBridge.searchYouTubeNative] Calling YtDlp.search()...');
  try {
    const result = await YtDlp.search({ query });
    console.log('[ytdlpBridge.searchYouTubeNative] Search result:', result);
    return result.results || [];
  } catch (err) {
    console.error('[ytdlpBridge.searchYouTubeNative] Error:', err);
    throw err;
  }
}

export async function downloadMp3Native(videoId: string, opts?: { format?: string; quality?: string }): Promise<ArrayBuffer> {
  if (!initialized) await initYtDlp();

  const result = YtDlp.downloadAudio
    ? await YtDlp.downloadAudio({ videoId, format: opts?.format, quality: opts?.quality })
    : (await YtDlp.downloadAsMp3!({ videoId }));

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
  const result = await YtDlp.saveTaggedAudioToMusic!({ fileName, data: base64Data });
  if (!result?.success) throw new Error('MediaStore save failed');
  return result.uri;
}

export async function searchYouTubeNativeMulti(queries: string[]): Promise<YtDlpSearchResult[]> {
  if (!initialized) await initYtDlp();
  // Lanza todas las búsquedas en paralelo y combina, deduplicando por videoId
  const results = await Promise.allSettled(queries.map((q) => YtDlp.search({ query: q })));
  const seen = new Set<string>();
  const combined: YtDlpSearchResult[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') {
      for (const item of r.value.results ?? []) {
        if (!seen.has(item.videoId)) {
          seen.add(item.videoId);
          combined.push(item);
        }
      }
    }
  }
  return combined;
}

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
