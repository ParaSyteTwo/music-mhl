import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';

export type ImportedAudioFile = File & {
  __mhlRelativePath?: string;
  __mhlSource?: 'documents' | 'picker';
};

export function toImportedAudioFile(
  file: File,
  options: { relativePath?: string; source?: 'documents' | 'picker' } = {},
): ImportedAudioFile {
  const taggedFile = file as ImportedAudioFile;
  taggedFile.__mhlRelativePath = options.relativePath;
  taggedFile.__mhlSource = options.source ?? 'picker';
  return taggedFile;
}

export function resolveImportedTrackMeta<T extends { localPath: string; localSource?: 'documents' | 'picker' }>(
  track: T,
  files: ImportedAudioFile[],
): T {
  const sourceFile = files.find((file) => file.name === track.localPath || file.__mhlRelativePath === track.localPath);
  if (!sourceFile) return track;
  return {
    ...track,
    localPath: sourceFile.__mhlRelativePath || track.localPath,
    localSource: sourceFile.__mhlSource || track.localSource || 'picker',
  };
}

export function shouldPersistLocalPath(track: { localPath: string; localSource?: 'documents' | 'picker' }): boolean {
  return track.localSource === 'documents' || track.localPath.startsWith('MHL Music/');
}

export function isDocumentsTrack(track: { localPath: string }): boolean {
  return Capacitor.isNativePlatform() && track.localPath.startsWith('MHL Music/');
}

export async function resolveLocalPlaybackUrl(track: { localPath: string }): Promise<string | null> {
  if (!isDocumentsTrack(track)) return null;
  const { uri } = await Filesystem.getUri({
    path: track.localPath,
    directory: Directory.Documents,
  });
  return Capacitor.convertFileSrc(uri);
}
