export type VideoKind =
  | 'official'
  | 'lyric'
  | 'visualizer'
  | 'live'
  | 'static_cover'
  | 'video';

export type VideoQuality = '720p' | '1080p' | 'best';
export type VideoCodecPreference = 'av1' | 'h264';

export interface VideoSearchResult {
  videoId: string;
  title: string;
  channel: string;
  duration: number;
  thumbnail: string;
  viewCount?: number;
  kind: VideoKind;
  isShort: boolean;
}

export interface VideoDownloadItem {
  id: string;
  video: VideoSearchResult;
  quality: VideoQuality;
  codec: VideoCodecPreference;
  status: 'queued' | 'downloading' | 'completed' | 'error';
  progress: number;
  speed?: string;
  eta?: number;
  fileName?: string;
  filePath?: string;
  mediaUri?: string;
  size?: number;
  error?: string;
  createdAt: number;
}
