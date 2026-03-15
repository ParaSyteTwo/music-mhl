import { Track } from '@/types/music';

// ─── Map Deezer track to Track format ───
function mapDeezerTrack(t: any): Track {
  return {
    id: `dz-${t.id}`,
    title: t.title || t.title_short,
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

function mapDeezerArtist(a: any) {
  return {
    id: `dz-artist-${a.id}`,
    deezerId: a.id,
    name: a.name,
    picture: a.picture_xl || a.picture_big || a.picture_medium || '',
    pictureSmall: a.picture_medium || a.picture_small || '',
    pictureXL: a.picture_xl || a.picture_big || '',
    fans: a.nb_fan || 0,
  };
}

function mapDeezerAlbum(a: any) {
  return {
    id: `dz-album-${a.id}`,
    deezerId: a.id,
    title: a.title,
    artist: a.artist?.name || 'Unknown',
    artistId: a.artist?.id,
    cover: a.cover_big || a.cover_medium || a.cover_small || '',
    coverSmall: a.cover_medium || a.cover_small || '',
    coverXL: a.cover_xl || a.cover_big || '',
    releaseDate: a.release_date || '',
  };
}

// ─── Deezer Search (Direct API) ───
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

// ─── Unified Search (tracks + artists + albums) ───
export async function searchAll(query: string) {
  const encoded = encodeURIComponent(query);
  try {
    const [tracksRes, artistsRes, albumsRes] = await Promise.all([
      fetch(`https://api.deezer.com/search?q=${encoded}&limit=10&output=json`),
      fetch(`https://api.deezer.com/search/artist?q=${encoded}&limit=5&output=json`),
      fetch(`https://api.deezer.com/search/album?q=${encoded}&limit=5&output=json`),
    ]);

    const [tracksData, artistsData, albumsData] = await Promise.all([
      tracksRes.json(),
      artistsRes.json(),
      albumsRes.json(),
    ]);

    return {
      tracks: (tracksData.data || []).map(mapDeezerTrack),
      artists: (artistsData.data || []).map(mapDeezerArtist),
      albums: (albumsData.data || []).map(mapDeezerAlbum),
    };
  } catch (error) {
    console.error('Search all error:', error);
    return { tracks: [], artists: [], albums: [] };
  }
}

// ─── Genre Chart (Direct API) ───
export async function fetchGenreChart(genreId: number, limit = 25): Promise<Track[]> {
  try {
    const res = await fetch(`https://api.deezer.com/chart/${genreId}/tracks?limit=${limit}&output=json`);
    const data = await res.json();
    return (data.data || []).map(mapDeezerTrack);
  } catch (error) {
    console.error('Genre chart error:', error);
    return [];
  }
}

// ─── Deezer Home Data (Direct API) ───
export async function fetchDeezerHome() {
  const genreIds: Record<string, number> = {
    Pop: 132, Rap: 116, Rock: 152, Electronic: 106, 'R&B': 165, Latin: 197,
  };

  try {
    const [tracksRes, artistsRes, albumsRes, ...genreRes] = await Promise.all([
      fetch('https://api.deezer.com/chart/0/tracks?limit=20&output=json'),
      fetch('https://api.deezer.com/chart/0/artists?limit=12&output=json'),
      fetch('https://api.deezer.com/chart/0/albums?limit=12&output=json'),
      ...Object.values(genreIds).map(id =>
        fetch(`https://api.deezer.com/chart/${id}/tracks?limit=10&output=json`)
      ),
    ]);

    const [tracks, artists, albums, ...genreTracks] = await Promise.all([
      tracksRes.json(),
      artistsRes.json(),
      albumsRes.json(),
      ...genreRes.map(r => r.json()),
    ]);

    const genreNames = Object.keys(genreIds);
    const byGenre: Record<string, { genreId: number; tracks: Track[] }> = {};
    genreNames.forEach((name, idx) => {
      byGenre[name] = {
        genreId: Object.values(genreIds)[idx],
        tracks: (genreTracks[idx].data || []).map(mapDeezerTrack),
      };
    });

    return {
      topTracks: (tracks.data || []).map(mapDeezerTrack),
      trendingArtists: (artists.data || []).map(mapDeezerArtist),
      newAlbums: (albums.data || []).map(mapDeezerAlbum),
      byGenre,
    };
  } catch (error) {
    console.error('Deezer home fetch failed:', error);
    return { topTracks: [], trendingArtists: [], newAlbums: [], byGenre: {} };
  }
}

// ─── Artist Detail (Direct API) ───
export async function fetchArtistDetail(artistId: number) {
  try {
    const [infoRes, topRes, albumsRes, relatedRes] = await Promise.all([
      fetch(`https://api.deezer.com/artist/${artistId}?output=json`),
      fetch(`https://api.deezer.com/artist/${artistId}/top?limit=10&output=json`),
      fetch(`https://api.deezer.com/artist/${artistId}/albums?limit=10&output=json`),
      fetch(`https://api.deezer.com/artist/${artistId}/related?limit=8&output=json`),
    ]);

    const [info, top, albums, related] = await Promise.all([
      infoRes.json(), topRes.json(), albumsRes.json(), relatedRes.json(),
    ]);

    return {
      info: {
        id: info.id,
        name: info.name,
        picture: info.picture_xl || info.picture_big || info.picture_medium || '',
        fans: info.nb_fan || 0,
      },
      topTracks: (top.data || []).map(mapDeezerTrack),
      albums: (albums.data || []).map(mapDeezerAlbum),
      related: (related.data || []).map(mapDeezerArtist),
    };
  } catch (error) {
    console.error('Artist detail error:', error);
    throw error;
  }
}

// ─── Album Detail (Direct API) ───
export async function fetchAlbumDetail(albumId: number) {
  try {
    const albumRes = await fetch(`https://api.deezer.com/album/${albumId}?output=json`);
    const albumData = await albumRes.json();

    const artistId = albumData.artist?.id;
    let moreByArtist: any[] = [];
    if (artistId) {
      try {
        const moreRes = await fetch(`https://api.deezer.com/artist/${artistId}/albums?limit=20&output=json`);
        const moreData = await moreRes.json();
        moreByArtist = (moreData.data || [])
          .filter((a: any) => a.id !== albumId)
          .slice(0, 4)
          .map(mapDeezerAlbum);
      } catch {}
    }

    return {
      album: {
        id: albumData.id,
        title: albumData.title,
        cover: albumData.cover_xl || albumData.cover_big || albumData.cover_medium || '',
        artist: {
          id: albumData.artist?.id,
          name: albumData.artist?.name || 'Unknown',
        },
        releaseDate: albumData.release_date,
        trackCount: albumData.nb_tracks || 0,
        tracks: (albumData.tracks?.data || []).map(mapDeezerTrack),
      },
      moreByArtist,
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
