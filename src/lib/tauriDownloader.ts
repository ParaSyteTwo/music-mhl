// Tauri Desktop — búsqueda YouTube y descarga MP3 vía yt-dlp.exe local (sin backend)
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { YtDlpSearchResult } from '@/lib/ytdlpBridge';

// ─── Leer/Escribir archivo ────────────────────────────────────────────────────

export async function readFileBytes(path: string): Promise<Uint8Array> {
  const bytes: number[] = await invoke('read_file_bytes', { path });
  return new Uint8Array(bytes);
}

export async function writeFileBytes(path: string, data: Uint8Array): Promise<void> {
  await invoke('write_file_bytes', { path, data: Array.from(data) });
}

// ─── Búsqueda YouTube ─────────────────────────────────────────────────────────

export async function searchYouTubeTauri(query: string): Promise<YtDlpSearchResult[]> {
  const args = [
    `ytsearch8:${query}`,
    '--dump-json',
    '--no-playlist',
    '--skip-download',
    '--quiet',
    '--no-warnings',
  ];

  try {
    const stdout = await invoke<string>('ytdlp_search', { args });
    return stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .flatMap((line) => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const d = JSON.parse(line) as any;
          return [{
            videoId: (d.id as string) || '',
            title: (d.title as string) || '',
            duration: (d.duration as number) || 0,
            channel: (d.uploader as string) || (d.channel as string) || '',
          }] satisfies YtDlpSearchResult[];
        } catch {
          return [];
        }
      });
  } catch (e) {
    console.error('[tauriDownloader] search error:', e);
    return [];
  }
}

export async function searchYouTubeTauriMulti(queries: string[]): Promise<YtDlpSearchResult[]> {
  const results = await Promise.allSettled(queries.map((q) => searchYouTubeTauri(q)));
  const seen = new Set<string>();
  const combined: YtDlpSearchResult[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') {
      for (const item of r.value) {
        if (!seen.has(item.videoId)) {
          seen.add(item.videoId);
          combined.push(item);
        }
      }
    }
  }
  return combined;
}

// ─── Descarga MP3 ─────────────────────────────────────────────────────────────

export interface TauriDownloadOptions {
  quality?: 'alta' | 'media' | 'baja';
  onProgress?: (percent: number) => void;
}

const QUALITY_MAP: Record<string, string> = {
  alta: '0',
  media: '5',
  baja: '9',
};

export async function downloadMp3Tauri(
  videoId: string,
  outputDir: string,
  fileName: string,
  opts: TauriDownloadOptions = {},
): Promise<void> {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const trackId = `${videoId}-${Date.now()}`;
  const outputPath = `${outputDir}/${fileName}`;
  const audioQuality = QUALITY_MAP[opts.quality ?? 'alta'] ?? '0';

  const args = [
    url,
    '-x',
    '--audio-format', 'mp3',
    '--audio-quality', audioQuality,
    '--embed-thumbnail',
    '--add-metadata',
    '--convert-thumbnails', 'jpg',
    '-o', outputPath,
    '--newline',
    '--no-playlist',
  ];

  let unlisten: (() => void) | undefined;

  if (opts.onProgress) {
    const cb = opts.onProgress;
    unlisten = await listen<number>(`ytdlp-progress-${trackId}`, (ev) => {
      cb(Math.min(99, ev.payload));
    });
  }

  try {
    await invoke('ytdlp_download', {
      trackId,
      args,
      outputDir,
    });
  } catch (e) {
    console.error('[tauriDownloader] ytdlp_download error:', e);
    throw e;
  } finally {
    unlisten?.();
  }
}
