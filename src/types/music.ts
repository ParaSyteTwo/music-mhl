export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  cover: string;
  preview?: string;
  deezerId?: number;
  youtubeId?: string;
  // ─── Local library fields ───
  isLocal?: boolean;
  localPath?: string;
  genre?: string;
  playCount?: number;
  importedAt?: number;
}

export interface LocalTrack extends Track {
  isLocal: true;
  localPath: string;
  genre: string;
  playCount: number;
  importedAt: number;
}

export interface LocalAlbum {
  id: string;
  name: string;
  artist: string;
  cover: string;
  trackCount: number;
  tracks: LocalTrack[];
}

export interface LocalArtist {
  id: string;
  name: string;
  cover: string;
  albumCount: number;
  trackCount: number;
  tracks: LocalTrack[];
}

export interface LocalGenre {
  id: string;
  name: string;
  trackCount: number;
  tracks: LocalTrack[];
}

export interface Download {
  id: string;
  track: Track;
  progress: number;
  status: 'queued' | 'downloading' | 'completed' | 'error';
  error?: string;
}
