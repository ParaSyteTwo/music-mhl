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
    coverSmall: t.coverSmall || '',
    coverXL: t.coverXL || '',
    preview: t.preview || '',
    deezerId: t.deezerId,
  };
}

function mapProxiedArtist(a: any) {
  return {
    id: a.id || `dz-artist-${a.deezerId}`,
    deezerId: a.deezerId,
    name: a.name || 'Unknown',
    picture: a.picture || '',
    pictureSmall: a.pictureSmall || '',
    pictureXL: a.pictureXL || '',
    fans: a.fans || 0,
  };
}

function mapProxiedAlbum(a: any) {
  return {
    id: a.id || `dz-album-${a.deezerId}`,
    deezerId: a.deezerId,
    title: a.title || 'Unknown',
    artist: a.artist || 'Unknown',
    artistId: a.artistId,
    cover: a.cover || '',
    coverSmall: a.coverSmall || '',
    coverXL: a.coverXL || '',
    releaseDate: a.releaseDate || '',
  };
}

// ─── Helper: call Supabase edge function for Deezer ───
async function callDeezerProxy(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('deezer-search', { body });
  if (error) throw new Error(error.message || 'Edge function error');
  return data;
}

// ─── Deezer Search (via Supabase proxy) ───
export async function searchDeezer(query: string): Promise<Track[]> {
  try {
    const data = await callDeezerProxy({ action: 'search', query, limit: 25 });
    return (data.tracks || []).map(mapProxiedTrack);
  } catch (error) {
    console.error('Deezer search error:', error);
    return [];
  }
}

// ─── Unified Search (tracks + artists + albums) ───
export async function searchAll(query: string) {
  try {
    const data = await callDeezerProxy({ action: 'searchAll', query });
    return {
      tracks: (data.tracks || []).map(mapProxiedTrack),
      artists: (data.artists || []).map(mapProxiedArtist),
      albums: (data.albums || []).map(mapProxiedAlbum),
    };
  } catch (error) {
    console.error('Search all error:', error);
    return { tracks: [], artists: [], albums: [] };
  }
}

// ─── Genre Chart (via Supabase proxy) ───
export async function fetchGenreChart(genreId: number, limit = 25): Promise<Track[]> {
  try {
    const data = await callDeezerProxy({ action: 'genre', genreId, limit });
    return (data.tracks || []).map(mapProxiedTrack);
  } catch (error) {
    console.error('Genre chart error:', error);
    return [];
  }
}

// ─── Deezer Home Data (via Supabase proxy) ───
export async function fetchDeezerHome() {
  try {
    const data = await callDeezerProxy({ action: 'home' });

    const byGenre: Record<string, { genreId: number; tracks: Track[] }> = {};
    if (data.byGenre) {
      for (const [name, value] of Object.entries(data.byGenre as Record<string, any>)) {
        byGenre[name] = {
          genreId: value.genreId,
          tracks: (value.tracks || []).map(mapProxiedTrack),
        };
      }
    }

    return {
      topTracks: (data.topTracks || []).map(mapProxiedTrack),
      trendingArtists: (data.trendingArtists || []).map(mapProxiedArtist),
      newAlbums: (data.newAlbums || []).map(mapProxiedAlbum),
      byGenre,
    };
  } catch (error) {
    console.error('Deezer home fetch failed:', error);
    return { topTracks: [], trendingArtists: [], newAlbums: [], byGenre: {} };
  }
}

// ─── Artist Detail (via Supabase proxy) ───
export async function fetchArtistDetail(artistId: number) {
  try {
    const data = await callDeezerProxy({ action: 'artist', artistId });
    return {
      info: data.info || { id: artistId, name: 'Unknown', picture: '', fans: 0 },
      topTracks: (data.topTracks || []).map(mapProxiedTrack),
      albums: (data.albums || []).map(mapProxiedAlbum),
      related: (data.related || []).map(mapProxiedArtist),
    };
  } catch (error) {
    console.error('Artist detail error:', error);
    throw error;
  }
}

// ─── Album Detail (via Supabase proxy) ───
export async function fetchAlbumDetail(albumId: number) {
  try {
    const data = await callDeezerProxy({ action: 'album', albumId });
    const album = data.album || {};
    return {
      album: {
        id: album.id || albumId,
        title: album.title || 'Unknown',
        cover: album.cover || '',
        artist: album.artist || { id: 0, name: 'Unknown' },
        releaseDate: album.releaseDate,
        trackCount: album.trackCount || 0,
        tracks: (album.tracks || []).map(mapProxiedTrack),
      },
      moreByArtist: (data.moreByArtist || []).map(mapProxiedAlbum),
    };
  } catch (error) {
    console.error('Album detail error:', error);
    throw error;
  }
}

// ─── YouTube Audio (RapidAPI) ───
export async function searchYouTube(query: string): Promise<{ videoId: string; title: string }[]> {
  const apiKey = import.meta.env.VITE_RAPIDAPI_KEY;
  if (!apiKey) throw new Error('VITE_RAPIDAPI_KEY not configured');

  const host = import.meta.env.VITE_RAPIDAPI_HOST_YTMUSIC || 'youtube-music-api3.p.rapidapi.com';

  const res = await fetch(
    `https://${host}/search?query=${encodeURIComponent(query)}&type=songs`,
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

  // Normalize response — different APIs may return different shapes
  const items = data.contents || data.result || data.data || data.items || [];
  return items
    .filter((item: any) => item.videoId || item.video?.videoId || item.id)
    .slice(0, 5)
    .map((item: any) => ({
      videoId: item.videoId || item.video?.videoId || item.id,
      title: item.name || item.title || item.video?.title || '',
    }));
}

export async function getYouTubeStream(videoId: string): Promise<{ stream: { url: string } }> {
  const apiKey = import.meta.env.VITE_RAPIDAPI_KEY;
  if (!apiKey) throw new Error('VITE_RAPIDAPI_KEY not configured');

  const host = import.meta.env.VITE_RAPIDAPI_HOST_YTMP3 || 'youtube-to-mp315.p.rapidapi.com';

  const res = await fetch(
    `https://${host}/download?url=https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&format=mp3`,
    {
      headers: {
        'X-RapidAPI-Key': apiKey,
        'X-RapidAPI-Host': host,
      },
      signal: AbortSignal.timeout(30000),
    }
  );

  if (!res.ok) throw new Error('YouTube stream fetch failed');
  const data = await res.json();

  // Normalize response — different MP3 APIs return different shapes
  const url = data.link || data.url || data.downloadUrl || data.adaptiveFormats?.[0]?.url;
  if (!url) {
    throw new Error(data.msg || data.message || 'Failed to get MP3 link');
  }

  return { stream: { url } };
}

// ─── LRCLIB Lyrics (public API) ───
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

// ─── Track Identification (Shazam + AudD fallback) ───
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
  // 1. Try Shazam Core via RapidAPI
  try {
    const result = await identifyWithShazamCore(file);
    if (result) return result;
  } catch (e) {
    console.warn('Shazam Core identification failed:', e);
  }

  // 2. Try AudD as fallback
  const auddKey = import.meta.env.VITE_AUDD_API_KEY;
  if (auddKey) {
    try {
      const result = await identifyWithAudD(file, auddKey);
      if (result) return result;
    } catch (e) {
      console.warn('AudD identification failed:', e);
    }
  }

  return null;
}

async function identifyWithShazamCore(file: File): Promise<ShazamIdentifyResult | null> {
  const apiKey = import.meta.env.VITE_RAPIDAPI_KEY;
  if (!apiKey) throw new Error('RAPIDAPI_KEY not configured');

  const host = import.meta.env.VITE_RAPIDAPI_HOST_SHAZAM || 'shazam-core.p.rapidapi.com';

  const arrayBuffer = await file.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < uint8Array.length; i++) {
    binary += String.fromCharCode(uint8Array[i]);
  }
  const base64Audio = btoa(binary);

  const response = await fetch(`https://${host}/v1/tracks/recognize`, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
      'X-RapidAPI-Key': apiKey,
      'X-RapidAPI-Host': host,
    },
    body: base64Audio,
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) return null;
  const data = await response.json() as any;

  // shazam-core returns { matches: [...], track: {...} } or { matches: [...] }
  const track = data.track || data.matches?.[0]?.track || {};
  if (data.matches && data.matches.length > 0) {
    return {
      title: track.title || track.heading?.title || 'Unknown Title',
      artist: track.subtitle || track.heading?.subtitle || track.artists?.[0]?.name || 'Unknown Artist',
      album: track.sections?.find((s: any) => s.type === 'CARD')?.metadata?.[0]?.text || 'Unknown Album',
      cover: track.images?.coverart || track.share?.image || '',
      releaseDate: track.releasedate || '',
      isrc: track.isrc,
      genres: track.genres ? Object.values(track.genres) as string[] : undefined,
    };
  }
  return null;
}

async function identifyWithAudD(file: File, apiKey: string): Promise<ShazamIdentifyResult | null> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('api_token', apiKey);
  formData.append('return', 'deezer,spotify');

  const response = await fetch('https://api.audd.io/', {
    method: 'POST',
    body: formData,
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) return null;
  const data = await response.json() as any;

  if (data.status === 'success' && data.result) {
    const r = data.result;
    return {
      title: r.title || 'Unknown Title',
      artist: r.artist || 'Unknown Artist',
      album: r.album || r.deezer?.album?.title || 'Unknown Album',
      cover: r.deezer?.album?.cover_big || r.spotify?.album?.images?.[0]?.url || '',
      releaseDate: r.release_date || '',
      isrc: r.deezer?.isrc,
    };
  }
  return null;
}

// ─── Translation APIs (cascading fallback) ───
export async function translateText(
  text: string,
  targetLang: string,
  sourceLang = 'auto',
): Promise<string | null> {
  // 1. Try DeepL if API key configured
  const deeplKey = import.meta.env.VITE_DEEPL_API_KEY;
  if (deeplKey) {
    try {
      const result = await translateWithDeepL(text, targetLang, deeplKey);
      if (result) return result;
    } catch (e) {
      console.warn('DeepL translation failed:', e);
    }
  }

  // 2. Try MyMemory (free, no key needed)
  try {
    const result = await translateWithMyMemory(text, targetLang, sourceLang);
    if (result) return result;
  } catch (e) {
    console.warn('MyMemory translation failed:', e);
  }

  return null;
}

async function translateWithDeepL(
  text: string,
  targetLang: string,
  apiKey: string,
): Promise<string | null> {
  const isFreePlan = apiKey.endsWith(':fx');
  const baseUrl = isFreePlan
    ? 'https://api-free.deepl.com/v2/translate'
    : 'https://api.deepl.com/v2/translate';

  const res = await fetch(baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      auth_key: apiKey,
      text,
      target_lang: targetLang.toUpperCase(),
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) return null;
  const data = await res.json();
  return data.translations?.[0]?.text || null;
}

async function translateWithMyMemory(
  text: string,
  targetLang: string,
  sourceLang: string,
): Promise<string | null> {
  const langPair = `${sourceLang === 'auto' ? 'en' : sourceLang}|${targetLang}`;
  const chunks = splitTextForTranslation(text, 4500);
  const translated: string[] = [];

  for (const chunk of chunks) {
    const res = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunk)}&langpair=${encodeURIComponent(langPair)}`,
      { signal: AbortSignal.timeout(10000) },
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data.responseStatus !== 200) return null;
    translated.push(data.responseData?.translatedText || '');
  }

  return translated.join('\n');
}

function splitTextForTranslation(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  const lines = text.split('\n');
  let current = '';
  for (const line of lines) {
    if ((current + '\n' + line).length > maxLen && current) {
      chunks.push(current);
      current = line;
    } else {
      current = current ? current + '\n' + line : line;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
