import { registerPlugin, Capacitor } from '@capacitor/core';

export interface YtDlpSearchResult {
  videoId: string;
  title: string;
  duration: number;
  channel: string;
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

export default YtDlp;
