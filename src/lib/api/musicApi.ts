import { supabase } from '@/integrations/supabase/client';
import { Track } from '@/types/music';

// ─── Deezer Search ───
export async function searchDeezer(query: string): Promise<Track[]> {
  const { data, error } = await supabase.functions.invoke('deezer-search', {
    body: { query, limit: 25 },
  });

  if (error) throw new Error(error.message);
  if (!data?.success) throw new Error(data?.error || 'Search failed');

  return (data.tracks || []).map((t: any) => ({
    id: t.id,
    title: t.title,
    artist: t.artist,
    album: t.album,
    duration: t.duration,
    cover: t.cover,
    coverSmall: t.coverSmall,
    preview: t.preview, // Deezer 30s preview
    deezerId: t.deezerId,
  }));
}

// ─── YouTube Audio ───
export async function searchYouTube(query: string) {
  const { data, error } = await supabase.functions.invoke('yt-stream', {
    body: { action: 'search', query },
  });

  if (error) throw new Error(error.message);
  if (!data?.success) throw new Error(data?.error || 'YouTube search failed');
  return data.results || [];
}

export async function getYouTubeStream(videoId: string) {
  const { data, error } = await supabase.functions.invoke('youtube-audio', {
    body: { action: 'stream', videoId },
  });

  if (error) throw new Error(error.message);
  if (!data?.success) throw new Error(data?.error || 'Stream fetch failed');
  return data;
}

// ─── LRCLIB Lyrics (public API, CORS-friendly) ───
export async function fetchLyrics(
  title: string,
  artist: string,
  album?: string,
  duration?: number
): Promise<{ lyrics: string; syncedLyrics: string | null } | null> {
  try {
    const params = new URLSearchParams({
      track_name: title,
      artist_name: artist,
    });
    if (album) params.set('album_name', album);
    if (duration) params.set('duration', String(duration));

    const response = await fetch(`https://lrclib.net/api/get?${params.toString()}`, {
      headers: { 'User-Agent': 'MHL v1.0 (https://mhl.app)' },
    });

    if (!response.ok) return null;
    const data = await response.json();

    return {
      lyrics: data.plainLyrics || '',
      syncedLyrics: data.syncedLyrics || null,
    };
  } catch {
    return null;
  }
}

// ─── Translate text (simple free translation) ───
export async function translateText(text: string, targetLang: string = 'es'): Promise<string> {
  try {
    const response = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0, 500))}&langpair=en|${targetLang}`
    );
    if (!response.ok) return text;
    const data = await response.json();
    return data.responseData?.translatedText || text;
  } catch {
    return text;
  }
}
