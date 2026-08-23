export type TrackEdition = 'explicit' | 'clean' | 'unknown';

export interface Track {
  id: string;
  title: string;
  canonicalTitle?: string;
  artist: string;
  album: string;
  canonicalAlbum?: string;
  duration: number;
  cover: string;
  preview?: string;
  deezerId?: number;
  youtubeId?: string;
  sourceUrl?: string;
  isrc?: string;
  edition?: TrackEdition;
  isLongAudio?: boolean;
  isPodcast?: boolean;
}

export interface Download {
  id: string;
  track: Track;
  videoIdOverride?: string;
  sourceUrlOverride?: string;
  progress: number;
  status: 'queued' | 'downloading' | 'completed' | 'error';
  error?: string;
  fileName?: string;
  speed?: string;    // e.g. "1.2 MB/s" — solo durante descarga nativa
  eta?: number;      // segundos restantes — solo durante descarga nativa
  mediaUri?: string; // content:// URI de MediaStore para abrir en reproductores externos
}
