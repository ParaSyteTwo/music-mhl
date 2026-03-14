export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number; // seconds
  cover: string;
  url?: string;
  bitrate?: string;
  format?: string;
  fileSize?: string;
  lyrics?: string;
  translatedLyrics?: string;
  isDownloaded?: boolean;
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
}

export type AudioFormat = 'AUTO' | 'MP3' | 'AAC' | 'FLAC' | 'OPUS';

export type ViewMode = 'grid' | 'list';
