import { Track } from '@/types/music';
import { supabase } from '@/integrations/supabase/client';

// ─── Map pre-transformed data from edge function ───
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
  const apiKey = import.meta.env.VITE_RAPIDAPI_KEY;
  if (!apiKey) throw new Error('VITE_RAPIDAPI_KEY not configured');

  const host = import.meta.env.VITE_RAPIDAPI_HOST_YTSEARCH || 'youtube138.p.rapidapi.com';

  // Boost search query to prioritize official versions
  const enhancedQuery = `${query} official audio OR radio`;

  const res = await fetch(
    `https://${host}/search/?q=${encodeURIComponent(enhancedQuery)}&hl=en&gl=US`,
    {
      headers: {
        'X-RapidAPI-Key': apiKey,
        'X-RapidAPI-Host': host,
      },
      signal: AbortSignal.timeout(10000),
    }
  );

  if (!res.ok) throw new Error('YouTube search failed');
  const data = await res.json();

  const items = data.contents || [];

  // Filter for videos, score them, sort by relevance
  const videos = items
    .filter((item: any) => item.type === 'video' && item.video?.videoId)
    .map((item: any) => {
      const duration = item.video?.duration || 0; // in seconds
      const title = item.video?.title || '';
      const score = scoreVideoForOfficial(title, duration);

      return {
        videoId: item.video.videoId,
        title,
        duration,
        score,
      };
    })
    // Sort by score (highest first)
    .sort((a: any, b: any) => b.score - a.score)
    .slice(0, 5);

  console.log('YouTube search results (sorted by official score):', videos.map(v => ({ title: v.title, score: v.score })));

  return videos.map(v => ({
    videoId: v.videoId,
    title: v.title,
  }));
}

// ─── YouTube MP3 Download (youtube-mp36 RapidAPI) ───
export async function getYouTubeStream(videoId: string): Promise<{ stream: { url: string } }> {
  const apiKey = import.meta.env.VITE_RAPIDAPI_KEY;
  if (!apiKey) throw new Error('VITE_RAPIDAPI_KEY not configured');

  const host = import.meta.env.VITE_RAPIDAPI_HOST_YTMP3 || 'youtube-mp36.p.rapidapi.com';

  const res = await fetch(
    `https://${host}/dl?id=${encodeURIComponent(videoId)}`,
    {
      headers: {
        'X-RapidAPI-Key': apiKey,
        'X-RapidAPI-Host': host,
      },
      signal: AbortSignal.timeout(30000),
    }
  );

  if (!res.ok) throw new Error('YouTube MP3 conversion failed');
  const data = await res.json();

  if (data.status !== 'ok' || !data.link) {
    throw new Error(data.msg || 'Failed to get MP3 link');
  }

  return { stream: { url: data.link } };
}
