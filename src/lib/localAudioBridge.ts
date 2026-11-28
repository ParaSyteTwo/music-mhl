import { Capacitor, registerPlugin } from '@capacitor/core';
import type { Download } from '@/types/music';
import { isPyWebView } from '@/lib/platform';

interface OpenFileLocalPlugin {
  readLocalAudio(options: {
    fileName?: string;
    mediaUri?: string;
  }): Promise<{
    success: boolean;
    mime?: string;
    filePath?: string;
    data_b64?: string;
    lyrics?: string;
    error?: string;
  }>;
  checkLocalFiles(options: {
    items: Array<{ id: string; fileName?: string; mediaUri?: string }>;
  }): Promise<{ success: boolean; missingIds?: string[] }>;
}

const OpenFileLocal = registerPlugin<OpenFileLocalPlugin>('OpenFile');

interface DesktopLocalApi {
  read_local_audio?: (
    fileName: string,
  ) => Promise<{ success: boolean; mime?: string; data_b64?: string; lyrics?: string; error?: string }>;
  check_local_files?: (
    fileNames: string[],
  ) => Promise<{ success: boolean; missing?: string[] }>;
}

function getDesktopApi(): DesktopLocalApi | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as Window & { pywebview?: { api?: DesktopLocalApi } }).pywebview?.api;
}

function base64ToBlobUrl(base64: string, mime: string): string {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: mime || 'audio/mp4' });
  return URL.createObjectURL(blob);
}

export async function readLocalAudioFile(
  fileName?: string,
  mediaUri?: string,
): Promise<{ objectUrl: string; lyrics: string } | null> {
  if (isPyWebView && fileName) {
    const api = getDesktopApi();
    if (!api?.read_local_audio) return null;
    const res = await api.read_local_audio(fileName);
    if (!res?.success || !res.data_b64) return null;
    return {
      objectUrl: base64ToBlobUrl(res.data_b64, res.mime || 'audio/mp4'),
      lyrics: typeof res.lyrics === 'string' ? res.lyrics : '',
    };
  }

  if (Capacitor.isNativePlatform() && (fileName || mediaUri)) {
    const res = await OpenFileLocal.readLocalAudio({ fileName, mediaUri });
    if (!res?.success) return null;
    if (res.filePath) {
      return {
        objectUrl: Capacitor.convertFileSrc(res.filePath),
        lyrics: typeof res.lyrics === 'string' ? res.lyrics : '',
      };
    }
    if (!res.data_b64) return null;
    return {
      objectUrl: base64ToBlobUrl(res.data_b64, res.mime || 'audio/mp4'),
      lyrics: typeof res.lyrics === 'string' ? res.lyrics : '',
    };
  }

  return null;
}

export async function checkMissingLocalDownloads(downloads: Download[]): Promise<Download[]> {
  const completed = downloads.filter((d) => d.status === 'completed' && (d.fileName || d.mediaUri));
  if (completed.length === 0) return [];

  if (isPyWebView) {
    const api = getDesktopApi();
    if (!api?.check_local_files) return [];
    const fileNames = completed.map((d) => d.fileName).filter((f): f is string => Boolean(f));
    if (fileNames.length === 0) return [];
    const res = await api.check_local_files(fileNames);
    if (!res?.success || !Array.isArray(res.missing)) return [];
    const missingSet = new Set(res.missing);
    return completed.filter((d) => !d.fileName || missingSet.has(d.fileName));
  }

  if (Capacitor.isNativePlatform()) {
    const res = await OpenFileLocal.checkLocalFiles({
      items: completed.map((d) => ({
        id: d.id,
        ...(d.fileName ? { fileName: d.fileName } : {}),
        ...(d.mediaUri ? { mediaUri: d.mediaUri } : {}),
      })),
    });
    if (!res?.success || !Array.isArray(res.missingIds)) return [];
    const missingIdSet = new Set(res.missingIds);
    return completed.filter((d) => missingIdSet.has(d.id));
  }

  return [];
}
