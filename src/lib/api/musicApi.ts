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
export async function searchDeezer(query: string): Promise<Track[]> {
  try {
    const data = await callDeezerProxy({ action: 'search', query, limit: 25 });
    return (data.tracks || []).map(mapProxiedTrack);
  } catch (error) {
    console.error('Deezer search error:', error);
    return [];
  }
}

// ─── YouTube Search (youtube138 RapidAPI) ───
export async function searchYouTube(query: string): Promise<{ videoId: string; title: string }[]> {
  const apiKey = import.meta.env.VITE_RAPIDAPI_KEY;
  if (!apiKey) throw new Error('VITE_RAPIDAPI_KEY not configured');

  const host = import.meta.env.VITE_RAPIDAPI_HOST_YTSEARCH || 'youtube138.p.rapidapi.com';

  const res = await fetch(
    `https://${host}/search/?q=${encodeURIComponent(query)}&hl=en&gl=US`,
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
  return items
    .filter((item: any) => item.type === 'video' && item.video?.videoId)
    .slice(0, 5)
    .map((item: any) => ({
      videoId: item.video.videoId,
      title: item.video.title || '',
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
