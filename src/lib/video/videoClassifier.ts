import type { VideoKind, VideoSearchResult } from '@/types/video';

const TOPIC_CHANNEL_RE = /\s*-\s*Topic$/i;
const STATIC_AUDIO_TITLE_RE = /\b(official\s*audio|audio\s*only|provided\s+to\s+youtube)\b/i;
const LYRIC_RE = /\b(lyric\s*video|lyrics?|con\s+letra|letra)\b/i;
const VISUALIZER_RE = /\b(visuali[zs]er|canvas)\b/i;
const LIVE_RE = /\b(live|en\s*vivo|tiny\s*desk|colors|live\s*session|acoustic|concert|directo)\b/i;
const OFFICIAL_MV_RE = /\b(official\s*music\s*video|official\s*video|video\s*oficial|m\/v|mv)\b/i;
const VEVO_RE = /(?:vevo$|\bvevo\b)/i;

const KIND_PRIORITY: Record<VideoKind, number> = {
  official: 0,
  visualizer: 1,
  lyric: 2,
  video: 3,
  live: 4,
  static_cover: 5,
};

/**
 * Classifies a YouTube video candidate by its visual/content type and Short status
 * so the 2-column Videoclips UI can label official MVs, visualizers, lyrics,
 * live sessions, and static Topic cover uploads clearly.
 */
export function classifyVideoCandidate(
  title: string,
  channel: string,
  duration: number,
): { kind: VideoKind; isShort: boolean } {
  const safeTitle = String(title || '').trim();
  const safeChannel = String(channel || '').trim();
  const safeDuration = Number.isFinite(duration) ? duration : 0;
  const isShort = safeDuration > 0 && safeDuration < 60;

  if (TOPIC_CHANNEL_RE.test(safeChannel) || STATIC_AUDIO_TITLE_RE.test(safeTitle)) {
    return { kind: 'static_cover', isShort };
  }
  if (LYRIC_RE.test(safeTitle)) {
    return { kind: 'lyric', isShort };
  }
  if (VISUALIZER_RE.test(safeTitle)) {
    return { kind: 'visualizer', isShort };
  }
  if (LIVE_RE.test(safeTitle) || LIVE_RE.test(safeChannel)) {
    return { kind: 'live', isShort };
  }
  if (OFFICIAL_MV_RE.test(safeTitle) || VEVO_RE.test(safeChannel)) {
    return { kind: 'official', isShort };
  }

  return { kind: 'video', isShort };
}

/**
 * Orders video candidates putting non-Shorts first and ranking visual clips
 * (official -> visualizer -> lyric -> video -> live -> static_cover) while
 * preserving YouTube's relevance order on ties.
 */
export function sortVideoCandidates(items: VideoSearchResult[]): VideoSearchResult[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      if (a.item.isShort !== b.item.isShort) {
        return a.item.isShort ? 1 : -1;
      }
      const priorityDiff = KIND_PRIORITY[a.item.kind] - KIND_PRIORITY[b.item.kind];
      if (priorityDiff !== 0) {
        return priorityDiff;
      }
      return a.index - b.index;
    })
    .map((entry) => entry.item);
}
