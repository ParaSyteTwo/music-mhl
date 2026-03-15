import { supabase } from '@/integrations/supabase/client';
import { Track } from '@/types/music';

// ─── Map Deezer track to Track format ───
function mapDeezerTrack(t: any): Track {
  return {
    id: String(t.id),
    title: t.title,
    artist: t.artist?.name || 'Unknown',
    album: t.album?.title || 'Unknown',
    duration: t.duration,
    cover: t.album?.cover_big || t.album?.cover_medium || t.album?.cover_small || '',
    coverSmall: t.album?.cover_medium || t.album?.cover_small || '',
    coverXL: t.album?.cover_xl || t.album?.cover_big || '',
    preview: t.preview || '',
    deezerId: t.id,
  };
}

// ─── Deezer Search (Direct API, no Supabase) ───
export async function searchDeezer(query: string): Promise<Track[]> {
  try {
    const response = await fetch(
      `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=25&output=json`
    );
    if (!response.ok) throw new Error('Deezer search failed');
    const data = await response.json();

    return (data.data || []).map(mapDeezerTrack);
  } catch (error) {
    console.error('Deezer search error:', error);
    return [];
  }
}

// ─── Deezer Home Data (Direct API, no Supabase) ───
export async function fetchDeezerHome() {
  try {
    const [tracksRes, artistsRes, albumsRes] = await Promise.all([
      fetch('https://api.deezer.com/chart/0/tracks?limit=20&output=json'),
      fetch('https://api.deezer.com/chart/0/artists?limit=12&output=json'),
      fetch('https://api.deezer.com/chart/0/albums?limit=12&output=json'),
    ]);

    const [tracks, artists, albums] = await Promise.all([
      tracksRes.json(),
      artistsRes.json(),
      albumsRes.json(),
    ]);

    // Genre IDs for Deezer charts
    const genreIds: Record<string, number> = {
      Pop: 132,
      Rap: 116,
      Rock: 152,
      Electronic: 106,
      'R&B': 165,
      Latin: 197,
    };

    const byGenreEntries = await Promise.all(
      Object.entries(genreIds).map(async ([name, id]) => {
        try {
          const r = await fetch(`https://api.deezer.com/chart/${id}/tracks?limit=15&output=json`);
          const d = await r.json();
          return [name, (d.data || []).map(mapDeezerTrack)];
        } catch {
          return [name, []];
        }
      })
    );

    return {
      topTracks: (tracks.data || []).map(mapDeezerTrack),
      artists: artists.data || [],
      albums: albums.data || [],
      byGenre: Object.fromEntries(byGenreEntries),
    };
  } catch (error) {
    console.error('Deezer home fetch failed:', error);
    return {
      topTracks: [],
      artists: [],
      albums: [],
      byGenre: {},
    };
  }
}

// ─── Deezer Trending ───
export async function getTrendingTracks(limit: number = 20): Promise<Track[]> {
  try {
    const response = await fetch('https://api.deezer.com/chart/0/tracks?limit=' + limit);
    const data = await response.json();

    if (!data.data) throw new Error('No trending data');

    return data.data.map((t: any) => ({
      id: t.id,
      title: t.title,
      artist: t.artist?.name || 'Unknown Artist',
      album: t.album?.title || 'Unknown Album',
      duration: t.duration,
      cover: t.album?.cover_big || t.album?.cover_medium,
      coverSmall: t.album?.cover_small,
      preview: t.preview_url,
      deezerId: t.id,
    }));
  } catch (error) {
    console.error('Trending fetch failed:', error);
    return [];
  }
}


// ─── YouTube Audio (simple search + stream) ───
export async function searchYouTube(query: string) {
  const { data, error } = await supabase.functions.invoke('yt-stream', {
    body: { action: 'search', query },
  });

  if (error) throw new Error(error.message);
  if (!data?.success) throw new Error(data?.error || 'YouTube search failed');
  return data.results || [];
}

export async function getYouTubeStream(videoId: string) {
  const { data, error } = await supabase.functions.invoke('yt-stream', {
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
): Promise<{ lyrics: string; syncedLyrics: string | null } | null> {
  try {
    const params = new URLSearchParams({
      track_name: title,
      artist_name: artist,
    });

    const response = await fetch(`https://lrclib.net/api/get?${params.toString()}`, {
      headers: { 'User-Agent': 'MHL v1.0' },
      signal: AbortSignal.timeout(5000),
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

// ─── Shazam Identify (RapidAPI) ───
export interface ShazamIdentifyResult {
  title: string;
  artist: string;
  album: string;
  cover: string;
  releaseDate: string;
  isrc?: string;
  genres?: string[];
}

export async function identifyTrackWithShazam(file: File): Promise<ShazamIdentifyResult | null> {
  try {
    const apiKey = import.meta.env.VITE_RAPIDAPI_KEY;
    if (!apiKey) {
      throw new Error('RAPIDAPI_KEY not configured');
    }

    // Convert File to ArrayBuffer and then to base64
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < uint8Array.length; i++) {
      binary += String.fromCharCode(uint8Array[i]);
    }
    const base64Audio = btoa(binary);

    const response = await fetch('https://shazam.p.rapidapi.com/songs/detect', {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
        'X-RapidAPI-Key': apiKey,
        'X-RapidAPI-Host': 'shazam.p.rapidapi.com',
      },
      body: base64Audio,
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      console.error(`Shazam API error: ${response.status}`);
      return null;
    }

    const data = await response.json() as any;

    // Shazam returns different structures depending on match quality
    if (data.matches && data.matches.length > 0) {
      const match = data.matches[0];
      const track = match.track || {};

      return {
        title: track.title || 'Unknown Title',
        artist: track.subtitle || track.artists?.[0]?.name || 'Unknown Artist',
        album: track.sections?.find((s: any) => s.type === 'CARD')?.metadata?.[0]?.text || 'Unknown Album',
        cover: track.images?.coverart || '',
        releaseDate: track.releasedate || '',
        isrc: track.isrc,
        genres: track.genres,
      };
    }

    return null;
  } catch (error) {
    console.error('Shazam identification error:', error);
    return null;
  }
}

