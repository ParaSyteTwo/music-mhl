import { Capacitor } from '@capacitor/core';
import type {
  VideoCodecPreference,
  VideoQuality,
  VideoSearchResult,
} from '@/types/video';
import { extractYouTubeVideoId } from '@/lib/music/urlResolver';
import { downloadVideoNative, searchYouTubeNative } from '@/lib/ytdlpBridge';
import { classifyVideoCandidate, sortVideoCandidates } from './videoClassifier';

interface DesktopRawVideo {
  videoId?: string;
  title?: string;
  channel?: string;
  duration?: number;
  thumbnail?: string;
  viewCount?: number | null;
}

interface DesktopVideoApi {
  search_videos?: (
    query: string,
    limit: number,
    lang?: string,
  ) => Promise<{ success: boolean; results?: DesktopRawVideo[]; error?: string }>;
  get_video_info?: (
    videoId: string,
    lang?: string,
  ) => Promise<{ success: boolean; video?: DesktopRawVideo; error?: string }>;
  download_video?: (
    videoId: string,
    quality: VideoQuality,
    codec: VideoCodecPreference,
    title: string,
    channel: string,
  ) => Promise<{
    success: boolean;
    filePath?: string;
    fileName?: string;
    size?: number;
    error?: string;
  }>;
}

function getDesktopVideoApi(): DesktopVideoApi | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as Window & { pywebview?: { api?: DesktopVideoApi } }).pywebview?.api;
}

function isPyWebView(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    new URLSearchParams(window.location.search).get('platform') === 'pywebview'
    || 'pywebview' in window
  );
}

function normalizeVideoResult(raw: DesktopRawVideo): VideoSearchResult | null {
  const videoId = String(raw.videoId || '').trim();
  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) return null;
  const title = String(raw.title || '').trim() || videoId;
  const channel = String(raw.channel || '').trim() || 'YouTube';
  const duration = typeof raw.duration === 'number' && Number.isFinite(raw.duration)
    ? Math.max(0, Math.round(raw.duration))
    : 0;
  const thumbnail = String(raw.thumbnail || '').trim()
    || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  const viewCount = typeof raw.viewCount === 'number' && Number.isFinite(raw.viewCount)
    ? Math.max(0, Math.round(raw.viewCount))
    : undefined;
  const { kind, isShort } = classifyVideoCandidate(title, channel, duration);

  return {
    videoId,
    title,
    channel,
    duration,
    thumbnail,
    ...(viewCount !== undefined ? { viewCount } : {}),
    kind,
    isShort,
  };
}

function buildSafeVideoFileName(video: VideoSearchResult, quality: VideoQuality): string {
  const safeChannel = video.channel.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim();
  const safeTitle = video.title.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim();
  const combined = safeChannel && safeTitle
    ? `${safeChannel} - ${safeTitle}`
    : (safeTitle || video.videoId);
  const trimmed = combined.slice(0, 100).replace(/^[.\s_-]+|[.\s_-]+$/g, '') || video.videoId;
  return `${trimmed} [${quality}].mp4`;
}

export async function searchVideos(
  query: string,
  limit = 12,
  lang: 'es' | 'en' = 'es',
): Promise<VideoSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const directVideoId = extractYouTubeVideoId(trimmed);
  const desktopApi = getDesktopVideoApi();

  if (isPyWebView() && desktopApi) {
    if (directVideoId && desktopApi.get_video_info) {
      const res = await desktopApi.get_video_info(directVideoId, lang);
      if (!res?.success || !res.video) {
        throw new Error(res?.error || 'Could not resolve YouTube video');
      }
      const item = normalizeVideoResult(res.video);
      return item ? [item] : [];
    }

    if (desktopApi.search_videos) {
      const res = await desktopApi.search_videos(trimmed, limit, lang);
      if (!res?.success) {
        throw new Error(res?.error || 'Video search failed');
      }
      const items = (res.results ?? [])
        .map(normalizeVideoResult)
        .filter((x): x is VideoSearchResult => x !== null);
      return directVideoId ? items : sortVideoCandidates(items);
    }
  }

  if (Capacitor.isNativePlatform()) {
    if (directVideoId) {
      try {
        const ytResults = await searchYouTubeNative(directVideoId, 3, { source: 'youtube', lang });
        const exact = ytResults.find((r) => r.videoId === directVideoId);
        if (exact) {
          const normalized = normalizeVideoResult({
            videoId: exact.videoId,
            title: exact.title,
            channel: exact.channel,
            duration: exact.duration,
          });
          if (normalized) return [normalized];
        }
      } catch {
        // Fallback to minimal direct video card so user can still download by URL
      }
      const fallback = normalizeVideoResult({
        videoId: directVideoId,
        title: `YouTube Video (${directVideoId})`,
        channel: 'YouTube',
        duration: 0,
      });
      return fallback ? [fallback] : [];
    }

    const ytResults = await searchYouTubeNative(trimmed, limit, { source: 'youtube', lang });
    const items = ytResults
      .map((r) =>
        normalizeVideoResult({
          videoId: r.videoId,
          title: r.title,
          channel: r.channel,
          duration: r.duration,
        }),
      )
      .filter((x): x is VideoSearchResult => x !== null);
    return sortVideoCandidates(items);
  }

  return [];
}

export async function downloadVideoItem(
  video: VideoSearchResult,
  quality: VideoQuality,
  codec: VideoCodecPreference,
  downloadId: string,
): Promise<{ fileName: string; filePath?: string; mediaUri?: string; size?: number }> {
  const desktopApi = getDesktopVideoApi();

  if (isPyWebView() && desktopApi?.download_video) {
    const res = await desktopApi.download_video(
      video.videoId,
      quality,
      codec,
      video.title,
      video.channel,
    );
    if (!res?.success) {
      throw new Error(res?.error || 'Video download failed');
    }
    return {
      fileName: res.fileName || buildSafeVideoFileName(video, quality),
      ...(res.filePath ? { filePath: res.filePath } : {}),
      ...(res.size !== undefined ? { size: res.size } : {}),
    };
  }

  if (Capacitor.isNativePlatform()) {
    const fileName = buildSafeVideoFileName(video, quality);
    const res = await downloadVideoNative(video.videoId, {
      quality,
      codec,
      fileName,
      downloadId,
    });
    return {
      fileName: res.fileName || fileName,
      mediaUri: res.uri,
      size: res.size,
    };
  }

  throw new Error('Video downloads are only supported on Desktop and Android');
}
