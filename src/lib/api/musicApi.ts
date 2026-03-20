import { Track } from '@/types/music';
import { supabase } from '@/integrations/supabase/client';
import { Capacitor } from '@capacitor/core';

type YouTubeSearchResult = {
  videoId: string;
  title: string;
};

const SEARCH_CACHE_TTL_MS = 10 * 60 * 1000;
const searchCache = new Map<string, { expiresAt: number; results: YouTubeSearchResult[] }>();

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, ' ');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapYouTubeResults(data: any): YouTubeSearchResult[] {
  const raw = Array.isArray(data?.results) ? data.results : [];
  return raw
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((item: any) => ({
      videoId: typeof item?.videoId === 'string' ? item.videoId : '',
      title: typeof item?.title === 'string' ? item.title : '',
    }))
    .filter((item: YouTubeSearchResult) => item.videoId && item.title)
    .slice(0, 6);
}

// ─── Map pre-transformed data from edge function ───
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapProxiedTrack(t: any): Track {
  return {
    id: t.id || `dz-${t.deezerId}`,
    title: t.title || 'Unknown',
    artist: t.artist || 'Unknown',
    album: t.album || 'Unknown',
    duration: t.duration || 0,
    cover: t.cover || '',
    preview: t.preview || '',
    deezerId: t.deezerId,
  };
}

// ─── Helper: call Supabase edge function for Deezer ───
async function callDeezerProxy(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('deezer-search', { body });
  if (error) throw new Error(error.message || 'Edge function error');
  return data;
}

// ─── Deezer Search ───
export async function searchDeezer(query: string, offset = 0, limit = 25): Promise<Track[]> {
  try {
    const data = await callDeezerProxy({ action: 'search', query, limit, offset });
    return (data.tracks || []).map(mapProxiedTrack);
  } catch (error) {
    console.error('Deezer search error:', error);
    return [];
  }
}

// ─── Helper: Score a YouTube video for being an official audio version ───
function scoreVideoForOfficial(title: string, duration: number): number {
  const lowerTitle = title.toLowerCase();
  let score = 0;

  // BOOST: Official versions
  if (lowerTitle.includes('official audio') || lowerTitle.includes('official')) score += 100;
  if (lowerTitle.includes('official video')) score += 80;
  if (lowerTitle.includes('audio')) score += 70;
  if (lowerTitle.includes('radio') || lowerTitle.includes('radio edit') || lowerTitle.includes('radio version')) score += 60;
  if (lowerTitle.includes('lyric video')) score += 50;

  // PENALTY: Non-audio versions
  if (lowerTitle.includes('videoclip') || lowerTitle.includes('video clip')) score -= 200;
  if (lowerTitle.includes('mv') && !lowerTitle.includes('official')) score -= 150;
  if (lowerTitle.includes('live')) score -= 100;
  if (lowerTitle.includes('cover')) score -= 80;
  if (lowerTitle.includes('remix')) score -= 70;
  if (lowerTitle.includes('extended')) score -= 60;
  if (lowerTitle.includes('mix')) score -= 50;
  if (lowerTitle.includes('instrumental')) score -= 40;
  if (lowerTitle.includes('slowed') || lowerTitle.includes('sped')) score -= 90;
  if (lowerTitle.includes('edit') && !lowerTitle.includes('radio edit')) score -= 30;
  if (lowerTitle.includes('compilation')) score -= 40;
  if (lowerTitle.includes('karaoke')) score -= 100;
  if (lowerTitle.includes('without')) score -= 50; // "without vocals" etc
  if (lowerTitle.includes('reaction')) score -= 150;
  if (lowerTitle.includes('dance') && !lowerTitle.includes('official')) score -= 50;

  // DURATION CHECK: Official songs are usually 3-5 minutes (allow up to 8 for some edits)
  if (duration < 120 || duration > 600) score -= 100; // Too short or too long

  // BOOST: Long titles suggest official uploads (with label info)
  if (title.length > 40) score += 10;

  return score;
}

// ─── YouTube Search (youtube138 RapidAPI) ───
export async function searchYouTube(query: string): Promise<{ videoId: string; title: string }[]> {
  const normalized = normalizeQuery(query);
  if (!normalized) return [];

  const cached = searchCache.get(normalized);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.results;
  }

  try {
    const { data, error } = await supabase.functions.invoke('yt-stream', {
      body: { action: 'search', query: `${query} official audio` },
    });

    if (error || !data?.success) {
      console.warn('[YouTube search]', error?.message || data?.error || 'No search provider available');
      return [];
    }

    const roughResults = mapYouTubeResults(data);
    const scored = roughResults
      .map((item) => ({
        ...item,
        score: scoreVideoForOfficial(item.title, 0),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(({ videoId, title }) => ({ videoId, title }));

    searchCache.set(normalized, {
      expiresAt: Date.now() + SEARCH_CACHE_TTL_MS,
      results: scored,
    });

    return scored;
  } catch (searchError) {
    console.error('[YouTube search error]', searchError);
    return [];
  }
}

// ─── YouTube MP3 Download (youtube-mp36 RapidAPI) ───
export async function getYouTubeStream(videoId: string): Promise<{ stream: { url: string } }> {
  const { data, error } = await supabase.functions.invoke('yt-stream', {
    body: { action: 'stream', videoId },
  });

  if (error) {
    throw new Error(error.message || 'YouTube stream failed');
  }

  const streamUrl = typeof data?.stream?.url === 'string' ? data.stream.url : '';
  if (!streamUrl) {
    throw new Error(typeof data?.error === 'string' ? data.error : 'No stream provider available');
  }

  return { stream: { url: streamUrl } };
}

interface DownloadOptions {
  format?: 'mp3' | 'aac';
  quality?: 'alta' | 'media' | 'baja';
}

// ─── Download track audio (native yt-dlp on Android, edge function on web) ───
export async function downloadTrackAudio(
  track: Track,
  onProgress?: (progress: number) => void,
  options: DownloadOptions = {},
): Promise<ArrayBuffer> {
  const query = `${track.title} ${track.artist}`;

  // Native path: yt-dlp local on Android
  if (Capacitor.isNativePlatform()) {
    const { searchYouTubeNative, downloadMp3Native } = await import('@/lib/ytdlpBridge');

    onProgress?.(15);
    const nativeResults = await searchYouTubeNative(`${query} official audio`);
    if (!nativeResults.length) throw new Error('No se encontró en YouTube');

    onProgress?.(25);
    const candidates = nativeResults.slice(0, 4);
    let lastError = '';

    for (const candidate of candidates) {
      try {
        const buffer = await downloadMp3Native(candidate.videoId, {
          format: options.format,
          quality: options.quality,
        });
        return buffer;
      } catch (e) {
        lastError = e instanceof Error ? e.message : 'Failed';
        continue;
      }
    }
    throw new Error(lastError || 'No se pudo descargar');
  }

  // Web path: edge function search + stream + fetch
  onProgress?.(15);
  const results = await searchYouTube(query);
  if (!results.length) throw new Error('No se encontró en YouTube');

  onProgress?.(30);
  const candidates = results.slice(0, 4);
  let lastError = '';

  for (const candidate of candidates) {
    try {
      const streamData = await getYouTubeStream(candidate.videoId);
      if (!streamData.stream?.url) continue;

      onProgress?.(60);
      const response = await fetch(streamData.stream.url);
      if (!response.ok) throw new Error('HTTP error ' + response.status);
      return await response.arrayBuffer();
    } catch (e) {
      lastError = e instanceof Error ? e.message : 'Failed';
      continue;
    }
  }

  throw new Error(lastError || 'No se pudo obtener el audio');
}
