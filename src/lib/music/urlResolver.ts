import type { Track } from '@/types/music';
import { searchDeezer } from '@/lib/api/musicApi';

export function isDirectMediaUrl(input: string): boolean {
  const trimmed = input.trim().replace(/^[<"']+|[>"']+$/g, '');
  return /^https?:\/\/(www\.|m\.|music\.|open\.|listen\.|vt\.|[a-z0-9-]+\.)?(youtube\.com|youtu\.be|spotify\.com|apple\.com|deezer\.com|deezer\.page\.link|tidal\.com|amazon\.[a-z.]+|soundcloud\.com|bandcamp\.com|tiktok\.com)\/.+/i.test(trimmed);
}

export function isUnsupportedCollectionUrl(input: string): boolean {
  const trimmed = input.trim();
  return (
    (/[?&]list=/i.test(trimmed) && !/[?&]v=/i.test(trimmed)) ||
    /open\.spotify\.com\/(?:[a-zA-Z0-9_-]+\/)?(album|playlist|artist|user)\//i.test(trimmed) ||
    /music\.apple\.com\/(?:[a-zA-Z0-9_-]+\/)?(playlist|artist|curator)\//i.test(trimmed) ||
    /deezer\.com\/(?:[a-zA-Z0-9_-]+\/)?(album|playlist|artist)\//i.test(trimmed) ||
    /tidal\.com\/(?:browse\/)?(album|playlist|artist)\//i.test(trimmed) ||
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

export function extractDeezerTrackId(urlStr: string): string | null {
  const match = urlStr.match(/deezer\.(?:com|page\.link)\/(?:[a-zA-Z0-9_-]+\/)?track\/(\d+)/i);
  return match ? match[1] : null;
}

export function extractAppleMusicInfo(urlStr: string): { title?: string; artist?: string } | null {
  try {
    const url = new URL(urlStr.trim().replace(/^[<"']+|[>"']+$/g, ''));
    if (url.hostname.includes('apple.com')) {
      // Formato: /album/song-title-slug/123?i=456 o /song/song-title-slug/456
      const segments = url.pathname.split('/').filter(Boolean);
      const albumIdx = segments.findIndex((s) => s === 'album' || s === 'song');
      if (albumIdx >= 0 && segments[albumIdx + 1]) {
        const rawSlug = segments[albumIdx + 1];
        const title = decodeURIComponent(rawSlug).replace(/-/g, ' ').trim();
        return { title };
      }
    }
  } catch {
    // ignore
  }
  return null;
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

function normalizeForMatching(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function isPodcastOrEpisodeUrl(urlStr: string): boolean {
  const trimmed = urlStr.trim().toLowerCase();
  return (
    trimmed.includes('spotify.com/episode/') ||
    trimmed.includes('spotify.com/show/') ||
    trimmed.includes('podcast') ||
    trimmed.includes('ivoox.com') ||
    trimmed.includes('podcasts.apple.com')
  );
}

export function isNonPlayableMediaUrl(urlStr: string): boolean {
  const trimmed = urlStr.trim().toLowerCase();
  return (
    trimmed.includes('youtube.com/@') ||
    trimmed.includes('youtube.com/channel/') ||
    trimmed.includes('youtube.com/c/') ||
    trimmed.includes('youtube.com/user/') ||
    trimmed.includes('spotify.com/user/') ||
    trimmed.includes('soundcloud.com/you/')
  );
}

function detectLongAudioFromTitle(title: string): boolean {
  const lower = title.toLowerCase();
  return (
    lower.includes('podcast') ||
    lower.includes('episodio') ||
    lower.includes('full album') ||
    lower.includes('álbum completo') ||
    lower.includes('discografia') ||
    lower.includes('1 hour') ||
    lower.includes('2 hour') ||
    lower.includes('3 hour') ||
    lower.includes('1 hora') ||
    lower.includes('2 horas') ||
    lower.includes('mega mix') ||
    lower.includes('session mix') ||
    lower.includes('concierto completo') ||
    lower.includes('full concert') ||
    lower.includes('live stream')
  );
}

export async function resolveTrackFromUrl(url: string): Promise<Track | null> {
  const trimmed = url.trim().replace(/^[<"']+|[>"']+$/g, '');
  if (!isDirectMediaUrl(trimmed) || isNonPlayableMediaUrl(trimmed)) return null;

  const isPodcastLink = isPodcastOrEpisodeUrl(trimmed);

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
      const isLongByTitle = detectLongAudioFromTitle(rawTitle);

      // Buscar en Deezer/iTunes para enriquecer carátula HD y metadatos de estudio oficiales
      let matchedTrack: Track | null = null;
      try {
        const query = `${searchArtist} ${searchTitle}`.trim();
        const results = await searchDeezer(query, 0, 8);
        if (results.length > 0) {
          const targetTitleNorm = normalizeForMatching(searchTitle);
          const targetArtistNorm = normalizeForMatching(searchArtist);

          // Buscar coincidencia exacta o fuerte de título y artista
          const exact = results.find((cand) => {
            const candTitleNorm = normalizeForMatching(cand.canonicalTitle || cand.title);
            const candArtistNorm = normalizeForMatching(cand.artist);
            const titleMatch = candTitleNorm.includes(targetTitleNorm) || targetTitleNorm.includes(candTitleNorm);
            const artistMatch = candArtistNorm.includes(targetArtistNorm) || targetArtistNorm.includes(candArtistNorm) || targetArtistNorm === 'youtube';
            return titleMatch && artistMatch;
          });

          matchedTrack = exact || results[0];
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
          isLongAudio: (matchedTrack.duration > 1200) || isLongByTitle || isPodcastLink,
          isPodcast: isPodcastLink || isLongByTitle,
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
        isLongAudio: isLongByTitle || isPodcastLink,
        isPodcast: isPodcastLink || isLongByTitle,
      };
    }

    // 2. Spotify Track / Episode URL (Sólo verificador de metadatos ➔ Deezer + YouTube Music)
    const spotifyTrackId = extractSpotifyTrackId(trimmed);
    if (spotifyTrackId || isPodcastLink || trimmed.includes('spotify.com/')) {
      let oembedTitle = '';
      try {
        const res = await fetch(
          `https://open.spotify.com/oembed?url=${encodeURIComponent(trimmed)}`,
          { signal: createTimeoutSignal(6000) }
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
        const isLongByTitle = detectLongAudioFromTitle(oembedTitle);

        const results = await searchDeezer(query, 0, 5);
        if (results.length > 0) {
          return {
            ...results[0],
            isLongAudio: (results[0].duration > 1200) || isLongByTitle || isPodcastLink,
            isPodcast: isPodcastLink || isLongByTitle,
          };
        }

        return {
          id: `sp_${spotifyTrackId || crypto.randomUUID()}`,
          title,
          canonicalTitle: title,
          artist: artist || 'Spotify',
          album: artist || 'Spotify',
          canonicalAlbum: artist || 'Spotify',
          duration: 0,
          cover: '',
          preview: '',
          isrc: '',
          edition: 'unknown',
          isLongAudio: isLongByTitle || isPodcastLink,
          isPodcast: isPodcastLink || isLongByTitle,
        };
      }
    }

    // 3. Apple Music / iTunes (Sólo verificador ➔ Deezer + YouTube Music)
    if (trimmed.includes('apple.com')) {
      let title = '';
      let artist = '';
      try {
        const res = await fetch(
          `https://music.apple.com/oembed?url=${encodeURIComponent(trimmed)}`,
          { signal: createTimeoutSignal(6000) }
        );
        if (res.ok) {
          const data = (await res.json()) as { title?: string; author_name?: string };
          title = data.title || '';
          artist = data.author_name || '';
        }
      } catch {
        // fallback to slug parser
      }

      if (!title) {
        const parsed = extractAppleMusicInfo(trimmed);
        if (parsed?.title) title = parsed.title;
      }

      if (title) {
        const query = artist ? `${artist} ${title}` : title;
        const results = await searchDeezer(query, 0, 5);
        if (results.length > 0) {
          return {
            ...results[0],
            isLongAudio: (results[0].duration > 1200) || isPodcastLink,
            isPodcast: isPodcastLink,
          };
        }
        return {
          id: `am_${crypto.randomUUID()}`,
          title,
          canonicalTitle: title,
          artist: artist || 'Apple Music',
          album: artist || 'Apple Music',
          canonicalAlbum: artist || 'Apple Music',
          duration: 0,
          cover: '',
          preview: '',
          isrc: '',
          edition: 'unknown',
          isLongAudio: isPodcastLink,
          isPodcast: isPodcastLink,
        };
      }
    }

    // 4. Deezer Direct URL
    const deezerTrackId = extractDeezerTrackId(trimmed);
    if (deezerTrackId || trimmed.includes('deezer.com/')) {
      let oembedTitle = '';
      let oembedAuthor = '';
      try {
        const res = await fetch(
          `https://api.deezer.com/oembed?url=${encodeURIComponent(trimmed)}&format=json`,
          { signal: createTimeoutSignal(6000) }
        );
        if (res.ok) {
          const data = (await res.json()) as { title?: string; author_name?: string };
          oembedTitle = data.title || '';
          oembedAuthor = data.author_name || '';
        }
      } catch {
        // ignore
      }

      const query = oembedAuthor ? `${oembedAuthor} ${oembedTitle}` : (oembedTitle || deezerTrackId || '');
      if (query) {
        const results = await searchDeezer(query, 0, 5);
        if (results.length > 0) {
          return results[0];
        }
      }
    }

    // 5. Tidal / Amazon Music / Bandcamp / TikTok (Sólo verificador ➔ Deezer + YouTube Music)
    if (trimmed.includes('tidal.com') || trimmed.includes('amazon.') || trimmed.includes('bandcamp.com') || trimmed.includes('tiktok.com')) {
      let title = '';
      let author = '';

      if (trimmed.includes('tidal.com')) {
        try {
          const res = await fetch(
            `https://oembed.tidal.com/v1?url=${encodeURIComponent(trimmed)}`,
            { signal: createTimeoutSignal(6000) }
          );
          if (res.ok) {
            const data = (await res.json()) as { title?: string; author_name?: string };
            title = data.title || '';
            author = data.author_name || '';
          }
        } catch { /* ignore */ }
      } else if (trimmed.includes('tiktok.com')) {
        try {
          const res = await fetch(
            `https://www.tiktok.com/oembed?url=${encodeURIComponent(trimmed)}`,
            { signal: createTimeoutSignal(6000) }
          );
          if (res.ok) {
            const data = (await res.json()) as { title?: string; author_name?: string };
            title = data.title || '';
            author = data.author_name || '';
          }
        } catch { /* ignore */ }
      }

      if (title || author) {
        const query = `${author} ${title}`.trim();
        const results = await searchDeezer(query, 0, 5);
        if (results.length > 0) {
          return results[0];
        }
        return {
          id: `stream_${crypto.randomUUID()}`,
          title: title || 'Stream Track',
          canonicalTitle: title || 'Stream Track',
          artist: author || 'Streaming',
          album: author || 'Streaming',
          canonicalAlbum: author || 'Streaming',
          duration: 0,
          cover: '',
          preview: '',
          isrc: '',
          edition: 'unknown',
        };
      }
    }

    // 6. SoundCloud
    if (trimmed.includes('soundcloud.com/')) {
      let scData: { title?: string; author_name?: string; thumbnail_url?: string } | null = null;
      try {
        const res = await fetch(
          `https://soundcloud.com/oembed?url=${encodeURIComponent(trimmed)}&format=json`,
          { signal: createTimeoutSignal(6000) }
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