import { Capacitor, registerPlugin } from '@capacitor/core';
import type { LocalTrack } from '@/types/music';

type NativeLibraryScanResult = {
  tracks: Array<Partial<LocalTrack> & { localPath: string }>;
};

type NativeLibraryPlugin = {
  scanDocumentsLibrary(): Promise<NativeLibraryScanResult>;
};

const NativeLibrary = registerPlugin<NativeLibraryPlugin>('NativeLibrary');

export async function scanNativeDocumentsLibrary(): Promise<LocalTrack[]> {
  if (!Capacitor.isNativePlatform()) {
    return [];
  }

  const result = await NativeLibrary.scanDocumentsLibrary();
  const now = Date.now();

  return (result.tracks || []).map((track) => ({
    id: track.id || `local-doc-${track.localPath.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`,
    title: track.title || 'Unknown Title',
    artist: track.artist || 'Unknown Artist',
    album: track.album || 'Unknown Album',
    duration: track.duration || 0,
    cover: track.cover || '',
    isLocal: true,
    localPath: track.localPath,
    localSource: 'documents',
    genre: track.genre || '',
    playCount: track.playCount || 0,
    importedAt: track.importedAt || now,
    preview: undefined,
  }));
}
