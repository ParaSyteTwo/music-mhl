import * as mm from 'music-metadata-browser';
import { Track } from '@/types/music';

export interface LocalTrackResult {
  track: Track;
  blobUrl: string;
  file: File;
}

/**
 * Read metadata from a local audio file and create a Track object.
 */
export async function processLocalFile(file: File): Promise<LocalTrackResult> {
  const metadata = await mm.parseBlob(file);
  const { common, format } = metadata;

  // Extract cover art if available
  let coverUrl = '';
  if (common.picture && common.picture.length > 0) {
    const pic = common.picture[0];
    const blob = new Blob([new Uint8Array(pic.data)], { type: pic.format });
    coverUrl = URL.createObjectURL(blob);
  }

  const blobUrl = URL.createObjectURL(file);
  const duration = Math.round(format.duration || 0);

  const track: Track = {
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: common.title || file.name.replace(/\.[^.]+$/, ''),
    artist: common.artist || 'Unknown Artist',
    album: common.album || 'Unknown Album',
    duration,
    cover: coverUrl,
    preview: blobUrl,
    format: format.codec || file.type.split('/')[1] || 'unknown',
    fileSize: `${(file.size / 1024 / 1024).toFixed(1)} MB`,
    isDownloaded: true,
  };

  return { track, blobUrl, file };
}

/**
 * Process multiple local audio files.
 */
export async function processLocalFiles(
  files: File[],
  onProgress?: (current: number, total: number) => void,
): Promise<LocalTrackResult[]> {
  const results: LocalTrackResult[] = [];
  const audioTypes = ['audio/mpeg', 'audio/flac', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/ogg', 'audio/aac'];

  const audioFiles = files.filter(
    (f) => audioTypes.some((t) => f.type.startsWith(t.split('/')[0])) || /\.(mp3|flac|m4a|wav|ogg|aac|opus)$/i.test(f.name),
  );

  for (let i = 0; i < audioFiles.length; i++) {
    try {
      const result = await processLocalFile(audioFiles[i]);
      results.push(result);
    } catch (e) {
      console.warn(`Failed to process ${audioFiles[i].name}:`, e);
    }
    onProgress?.(i + 1, audioFiles.length);
  }

  return results;
}
