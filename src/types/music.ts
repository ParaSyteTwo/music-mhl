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
}

export interface Download {
  id: string;
  track: Track;
  progress: number;
  status: 'downloading' | 'completed' | 'error';
  error?: string;
}
