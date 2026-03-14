export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  cover: string;
  coverSmall?: string;
  url?: string;
  preview?: string; // Deezer 30s preview
  bitrate?: string;
  format?: string;
  fileSize?: string;
  lyrics?: string;
  translatedLyrics?: string;
  syncedLyrics?: string | null;
  isDownloaded?: boolean;
  deezerId?: number;
  youtubeId?: string;
}

export interface Playlist {
  id: string;
  name: string;
  tracks: Track[];
  createdAt: Date;
  cover?: string;
}

export interface Download {
  id: string;
  track: Track;
  format: AudioFormat;
  progress: number;
  status: 'pending' | 'downloading' | 'completed' | 'error';
  downloadUrl?: string;
  error?: string;
}

export type AudioFormat = 'AUTO' | 'MP3' | 'AAC' | 'FLAC' | 'OPUS';
export type ViewMode = 'grid' | 'list';
export type AudioSource = 'preview' | 'youtube';

export interface SyncedLine {
  time: number; // seconds
  text: string;
}
