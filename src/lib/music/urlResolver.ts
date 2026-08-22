import type { Track } from '@/types/music';
import { searchDeezer } from '@/lib/api/musicApi';

export function isDirectMediaUrl(input: string): boolean {
  const trimmed = input.trim().replace(/^[<"']+|[>"']+$/g, '');
  return /^https?:\/\/(www\.|m\.)?(youtube\.com|youtu\.be|music\.youtube\.com|soundcloud\.com|open\.spotify\.com)\/.+/i.test(trimmed);
}

export function isUnsupportedCollectionUrl(input: string): boolean {
  const trimmed = input.trim();
  return (
    (/[?&]list=/i.test(trimmed) && !/[?&]v=/i.test(trimmed)) ||
    /open\.spotify\.com\/(?:[a-zA-Z0-9_-]+\/)?(album|playlist|show|episode)\//i.test(trimmed) ||
    /soundcloud\.com\/[^/]+\/sets\//i.test(trimmed)
  );
}

export function extractYouTubeVideoId(urlStr: string): string | null {
  try {
    const url = new URL(urlStr.trim().replace(/^[<"']+|[>"']+$/g, ''));
    const host = url.hostname.toLowerCase();

    if (host === 'youtu.be' || host.endsWith('.youtu.be')) {
      const id = url.pathname.slice(1).split(/[/?#]/)[0];
      return id && id.length === 11 ? id : null;
    }

    if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
      if (url.pathname.startsWith('/shorts/')) {
        const id = url.pathname.split('/shorts/')[1]?.split(/[/?#]/)[0];
        return id && id.length === 11 ? id : null;
      }
      if (url.pathname.startsWith('/embed/') || url.pathname.startsWith('/v/')) {
        const id = url.pathname.split(/\/(?:embed|v)\//)[1]?.split(/[/?#]/)[0];
        return id && id.length === 11 ? id : null;
      }
      const v = url.searchParams.get('v');
      return v && v.length === 11 ? v : null;
    }
  } catch {
    // regex fallback
  }
  const match = urlStr.match(/(?:youtu\.be\/|(?:www\.|m\.)?youtube\.com\/(?:watch\?(?:[^&]*&)?v=|shorts\/|music\/watch\?(?:[^&]*&)?v=|embed\/|v\/))([a-zA-Z0-9_-]{11})/i);
  return match ? match[1] : null;
}

export function extractSpotifyTrackId(urlStr: string): string | null {
  try {
    const url = new URL(urlStr.trim().replace(/^[<"']+|[>"']+$/g, ''));
    if (url.hostname.includes('spotify.com')) {
      const match = url.pathname.match(/(?:[a-zA-Z0-9_-]+\/)?track\/([a-zA-Z0-9]+)/i);
      return match ? match[1] : null;
    }
  } catch {
    // regex fallback
  }
  const match = urlStr.match(/open\.spotify\.com\/(?:[a-zA-Z0-9_-]+\/)?track\/([a-zA-Z0-9]+)/i);
  return match ? match[1] : null;
}

export function cleanVideoTitle(rawTitle: string): { title: string; artist?: string } {
  const cleaned = rawTitle
    .replace(/\s*\[(?:official\s*)?(?:music\s*)?video\]/gi, '')
    .replace(/\s*\((?:official\s*)?(?:music\s*)?video\)/gi, '')
    .replace(/\s*\((?:video\s*)?oficial\)/gi, '')
    .replace(/\s*\[(?:video\s*)?oficial\]/gi, '')
    .replace(/\s*\((?:audio\s*)?oficial\)/gi, '')
    .replace(/\s*\[(?:audio\s*)?oficial\]/gi, '')
    .replace(/\s*\[official\s*audio\]/gi, '')
    .replace(/\s*\(official\s*audio\)/gi, '')
    .replace(/\s*\(audio\)/gi, '')
    .replace(/\s*\[audio\]/gi, '')
    .replace(/\s*\(visualizer\)/gi, '')
    .replace(/\s*\[visualizer\]/gi, '')
    .replace(/\s*\(lyric\s*video\)/gi, '')
    .replace(/\s*\[lyric\s*video\]/gi, '')
    .replace(/\s*\(letra\)/gi, '')
    .replace(/\s*\[letra\]/gi, '')
    .replace(/\s*\[4k\]/gi, '')
    .replace(/\s*\[hd\]/gi, '')
    .replace(/\s*\((?:remastered|remaster)\s*(?:\d{4})?\)/gi, '')
    .replace(/\s*\[(?:remastered|remaster)\s*(?:\d{4})?\]/gi, '')
    .trim();

  // Si contiene "Artista - Canción" o "Artista – Canción" o "Artista — Canción"
  const splitParts = cleaned.split(/\s*[-–—]\s*/);
  if (splitParts.length >= 2) {
    const artist = splitParts[0].trim();
    const title = splitParts.slice(1).join(' - ').trim();
    if (artist && title) {
      return { artist, title };
    }
  }

  return { title: cleaned };
}

function createTimeoutSignal(ms: number): AbortSignal | undefined {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    try {
      return AbortSignal.timeout(ms);
    } catch {
      // fallback
    }
  }
  return undefined;
}

export async function resolveTrackFromUrl(url: string): Promise<Track | null> {
  const trimmed = url.trim().replace(/^[<"']+|[>"']+$/g, '');
  if (!isDirectMediaUrl(trimmed)) return null;

  try {
    // 1. YouTube & YouTube Music & Shorts & Embeds
    const videoId = extractYouTubeVideoId(trimmed);
    if (videoId) {
      let oembedData: { title?: string; author_name?: string; thumbnail_url?: string } | null = null;
      try {
        const signal = createTimeoutSignal(6000);
        const oembedRes = await fetch(
          `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
          signal ? { signal } : undefined
        );
        if (oembedRes.ok) {
          oembedData = (await oembedRes.json()) as { title?: string; author_name?: string; thumbnail_url?: string };
        }
      } catch {
        // oEmbed fallback
      }

      const rawTitle = oembedData?.title || 'YouTube Audio';
      const uploader = (oembedData?.author_name || 'YouTube').replace(/\s*-\s*Topic$/i, '').trim();
      const parsed = cleanVideoTitle(rawTitle);
      const searchArtist = parsed.artist || uploader;
      const searchTitle = parsed.title;

      // Buscar en Deezer/iTunes para enriquecer carátula HD y metadatos de estudio
      let matchedTrack: Track | null = null;
      try {
        const query = `${searchArtist} ${searchTitle}`.trim();
        const results = await searchDeezer(query, 0, 5);
        if (results.length > 0) {
          matchedTrack = results[0];
        }
      } catch {
        // fallback
      }

      if (matchedTrack) {
        return {
          ...matchedTrack,
          id: `yt_${videoId}`,
          youtubeId: videoId,
          sourceUrl: trimmed,
        };
      }

      // Fallback con datos directos de YouTube
      return {
        id: `yt_${videoId}`,
        title: searchTitle,
        canonicalTitle: searchTitle,
        artist: searchArtist,
        album: searchArtist,
        canonicalAlbum: searchArtist,
        duration: 0,
        cover: oembedData?.thumbnail_url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        preview: '',
        isrc: '',
        edition: 'unknown',
        youtubeId: videoId,
        sourceUrl: trimmed,
      };
    }

    // 2. Spotify Track URL
    const spotifyTrackId = extractSpotifyTrackId(trimmed);
    if (spotifyTrackId) {
      let oembedTitle = '';
      try {
        const res = await fetch(
          `https://open.spotify.com/oembed?url=${encodeURIComponent(trimmed)}`,
          { signal: AbortSignal.timeout(6000) }
        );
        if (res.ok) {
          const data = (await res.json()) as { title?: string };
          oembedTitle = data.title || '';
        }
      } catch {
        // ignore
      }

      if (oembedTitle) {
        const cleaned = oembedTitle.replace(/\s*-\s*(?:Single|EP|Album)\s*by\s*/i, ' by ');
        const parts = cleaned.split(/\s+by\s+/i);
        const title = parts[0]?.trim() || oembedTitle;
        const artist = parts[1]?.trim() || '';
        const query = artist ? `${artist} ${title}` : title;

        const results = await searchDeezer(query, 0, 5);
        if (results.length > 0) {
          return {
            ...results[0],
            sourceUrl: trimmed,
          };
        }
      }
    }

    // 3. SoundCloud
    if (trimmed.includes('soundcloud.com/')) {
      let scData: { title?: string; author_name?: string; thumbnail_url?: string } | null = null;
      try {
        const res = await fetch(
          `https://soundcloud.com/oembed?url=${encodeURIComponent(trimmed)}&format=json`,
          { signal: AbortSignal.timeout(6000) }
        );
        if (res.ok) {
          scData = (await res.json()) as { title?: string; author_name?: string; thumbnail_url?: string };
        }
      } catch {
        // ignore
      }

      const rawTitle = scData?.title || 'SoundCloud Track';
      const uploader = scData?.author_name || 'SoundCloud';
      const parsed = cleanVideoTitle(rawTitle);
      const artist = parsed.artist || uploader;
      const title = parsed.title;

      try {
        const results = await searchDeezer(`${artist} ${title}`, 0, 5);
        if (results.length > 0) {
          return {
            ...results[0],
            sourceUrl: trimmed,
          };
        }
      } catch {
        // ignore
      }

      return {
        id: `sc_${crypto.randomUUID()}`,
        title,
        canonicalTitle: title,
        artist,
        album: artist,
        canonicalAlbum: artist,
        duration: 0,
        cover: scData?.thumbnail_url || '',
        preview: '',
        isrc: '',
        edition: 'unknown',
        sourceUrl: trimmed,
      };
    }
  } catch (error) {
    console.error('[resolveTrackFromUrl] Error resolving URL:', error);
  }

  // Fallback genérico
  return {
    id: `direct_${crypto.randomUUID()}`,
    title: 'Audio Directo',
    canonicalTitle: 'Audio Directo',
    artist: 'Web Stream',
    album: 'MHL Music',
    canonicalAlbum: 'MHL Music',
    duration: 0,
    cover: '',
    preview: '',
    isrc: '',
    edition: 'unknown',
    sourceUrl: trimmed,
  };
}