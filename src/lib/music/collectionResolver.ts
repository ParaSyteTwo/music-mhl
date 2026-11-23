import type { ResolvedCollection, Track } from '@/types/music';
import {
  cleanVideoTitle,
  extractDeezerCollection,
  extractSpotifyCollection,
  extractYouTubePlaylistId,
} from './urlResolver';

export const MAX_COLLECTION_TRACKS = 50;

const COLLECTION_TIMEOUT_MS = 10_000;
const MHL_USER_AGENT = 'MHLMusic/1.5.6 (https://github.com/ParaSyteTwo/music-mhl)';

interface RawDeezerTrack {
  id?: string | number;
  title?: string;
  title_short?: string;
  artist?: { name?: string };
  album?: {
    id?: string | number;
    title?: string;
    cover_xl?: string;
    cover_big?: string;
    cover_medium?: string;
    cover_small?: string;
  };
  duration?: number;
  preview?: string;
  isrc?: string;
  explicit_lyrics?: boolean;
}

interface RawDeezerCollectionResponse {
  id?: string | number;
  title?: string;
  cover_xl?: string;
  cover_big?: string;
  cover_medium?: string;
  cover_small?: string;
  picture_xl?: string;
  picture_big?: string;
  picture_medium?: string;
  picture_small?: string;
  artist?: { name?: string };
  creator?: { name?: string };
  nb_tracks?: number;
  tracks?: { data?: RawDeezerTrack[] };
  error?: unknown;
}

interface RawYouTubePlaylistItem {
  videoId?: string;
  id?: string;
  title?: string;
  channel?: string;
  uploader?: string;
  artist?: string;
  duration?: number;
  thumbnail?: string;
  cover?: string;
}

interface RawYouTubePlaylistResponse {
  success?: boolean;
  title?: string;
  subtitle?: string;
  uploader?: string;
  cover?: string;
  thumbnail?: string;
  totalTracks?: number;
  items?: RawYouTubePlaylistItem[];
  tracks?: RawYouTubePlaylistItem[];
  error?: string;
}

interface SpotifyEmbedFetchResponse {
  success?: boolean;
  html?: string;
  data?: string;
  error?: string;
}

interface PyWebViewCollectionApi {
  deezer_album?: (albumId: string) => Promise<RawDeezerCollectionResponse>;
  deezer_playlist?: (playlistId: string) => Promise<RawDeezerCollectionResponse>;
  get_playlist_items?: (url: string, limit: number) => Promise<RawYouTubePlaylistResponse>;
  spotify_embed_fetch?: (embedUrl: string) => Promise<SpotifyEmbedFetchResponse>;
}

interface PyWebViewCollectionWindow extends Window {
  pywebview?: {
    api?: PyWebViewCollectionApi;
  };
}

function isPyWebViewPlatform(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    new URLSearchParams(window.location.search).get('platform') === 'pywebview'
    || 'pywebview' in window
  );
}

function getPyWebViewApi(): PyWebViewCollectionApi | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as PyWebViewCollectionWindow).pywebview?.api;
}

async function fetchWithTimeout(
  url: string,
  timeoutMs = COLLECTION_TIMEOUT_MS,
  init: RequestInit = {},
): Promise<Response> {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : undefined;
  try {
    const requestInit: RequestInit = controller
      ? { ...init, signal: controller.signal }
      : init;
    try {
      return await fetch(url, requestInit);
    } catch (err) {
      if (controller && err instanceof TypeError && /AbortSignal/i.test(err.message)) {
        return await fetch(url, init);
      }
      throw err;
    }
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

function withHardTimeout<T>(promise: Promise<T>, timeoutMs = COLLECTION_TIMEOUT_MS): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('Request timed out')), timeoutMs);
    }),
  ]).finally(() => {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  });
}

function pickDeezerCover(obj?: {
  cover_big?: string;
  cover_xl?: string;
  cover_medium?: string;
  cover_small?: string;
  picture_big?: string;
  picture_xl?: string;
  picture_medium?: string;
  picture_small?: string;
}): string {
  if (!obj) return '';
  return (
    obj.cover_big
    || obj.cover_xl
    || obj.cover_medium
    || obj.cover_small
    || obj.picture_big
    || obj.picture_xl
    || obj.picture_medium
    || obj.picture_small
    || ''
  );
}

function mapDeezerCollectionPayload(
  data: RawDeezerCollectionResponse | null | undefined,
  type: 'album' | 'playlist',
  fallbackId: string,
): ResolvedCollection | null {
  if (!data || typeof data !== 'object' || data.error) return null;

  const rawTracks = Array.isArray(data.tracks?.data) ? data.tracks.data : [];
  if (rawTracks.length === 0) return null;

  const collectionId = data.id != null ? String(data.id) : fallbackId;
  const numericAlbumId = type === 'album' && /^\d+$/.test(collectionId)
    ? Number(collectionId)
    : undefined;
  const collectionTitle = typeof data.title === 'string' && data.title.trim()
    ? data.title.trim()
    : (type === 'album' ? 'Deezer Album' : 'Deezer Playlist');
  const subtitle = type === 'album'
    ? (data.artist?.name?.trim() || '')
    : (data.creator?.name?.trim() || '');
  const collectionCover = pickDeezerCover(data);

  const totalTracks = typeof data.nb_tracks === 'number' && data.nb_tracks > 0
    ? Math.max(data.nb_tracks, rawTracks.length)
    : rawTracks.length;
  const truncated = totalTracks > MAX_COLLECTION_TRACKS || rawTracks.length > MAX_COLLECTION_TRACKS;

  const tracks: Track[] = rawTracks.slice(0, MAX_COLLECTION_TRACKS).flatMap((t): Track[] => {
    if (!t || t.id == null) return [];
    const deezerId = Number(t.id);
    if (!Number.isFinite(deezerId) || deezerId <= 0) return [];
    const trackAlbumId = t.album?.id != null && Number.isFinite(Number(t.album.id))
      ? Number(t.album.id)
      : numericAlbumId;
    const title = typeof t.title === 'string' && t.title.trim() ? t.title.trim() : 'Unknown';
    const canonicalTitle = typeof t.title_short === 'string' && t.title_short.trim()
      ? t.title_short.trim()
      : title;
    const albumTitle = typeof t.album?.title === 'string' && t.album.title.trim()
      ? t.album.title.trim()
      : (type === 'album' ? collectionTitle : 'Unknown');
    const cover = pickDeezerCover(t.album) || collectionCover;

    return [{
      id: `dz-${deezerId}`,
      deezerId,
      ...(trackAlbumId ? { albumId: trackAlbumId } : {}),
      title,
      canonicalTitle,
      artist: typeof t.artist?.name === 'string' && t.artist.name.trim()
        ? t.artist.name.trim()
        : (subtitle || 'Unknown'),
      album: albumTitle,
      canonicalAlbum: albumTitle,
      duration: typeof t.duration === 'number' && Number.isFinite(t.duration) ? Math.max(0, Math.round(t.duration)) : 0,
      cover,
      preview: typeof t.preview === 'string' ? t.preview : '',
      isrc: typeof t.isrc === 'string' ? t.isrc : '',
      edition: t.explicit_lyrics === true ? 'explicit' : t.explicit_lyrics === false ? 'clean' : 'unknown',
    }];
  });

  if (tracks.length === 0) return null;

  return {
    id: `deezer-${type}-${collectionId}`,
    type,
    source: 'deezer',
    title: collectionTitle,
    subtitle,
    cover: collectionCover || tracks[0].cover || '',
    tracks,
    totalTracks,
    truncated,
  };
}

async function resolveDeezerCollection(
  type: 'album' | 'playlist',
  rawId: string | number,
): Promise<ResolvedCollection | null> {
  const id = String(rawId).trim();
  if (!/^\d{1,20}$/.test(id)) return null;

  try {
    let payload: RawDeezerCollectionResponse | undefined;

    if (isPyWebViewPlatform()) {
      const api = getPyWebViewApi();
      if (type === 'album' && api?.deezer_album) {
        payload = await api.deezer_album(id);
      } else if (type === 'playlist' && api?.deezer_playlist) {
        payload = await api.deezer_playlist(id);
      }
    }

    if (!payload) {
      const res = await fetchWithTimeout(
        `https://api.deezer.com/${type}/${id}`,
        COLLECTION_TIMEOUT_MS,
        { headers: { 'X-User-Agent': MHL_USER_AGENT } },
      );
      if (!res.ok) return null;
      payload = await res.json() as RawDeezerCollectionResponse;
    }

    return mapDeezerCollectionPayload(payload, type, id);
  } catch {
    return null;
  }
}

export async function resolveDeezerAlbumById(
  albumId: number | string,
): Promise<ResolvedCollection | null> {
  return resolveDeezerCollection('album', albumId);
}

async function resolveYouTubePlaylist(url: string, playlistId: string): Promise<ResolvedCollection | null> {
  let baseHost = 'www.youtube.com';
  try {
    const parsedHost = new URL(url).hostname.toLowerCase();
    if (parsedHost === 'music.youtube.com') {
      baseHost = 'music.youtube.com';
    }
  } catch {
    // default to www.youtube.com
  }
  const safeUrl = `https://${baseHost}/playlist?list=${playlistId}`;

  try {
    let response: RawYouTubePlaylistResponse | RawYouTubePlaylistItem[] | undefined;

    if (isPyWebViewPlatform()) {
      const api = getPyWebViewApi();
      if (!api?.get_playlist_items) return null;
      response = await api.get_playlist_items(safeUrl, MAX_COLLECTION_TRACKS);
    } else {
      const bridge = await import('@/lib/ytdlpBridge') as typeof import('@/lib/ytdlpBridge') & {
        getPlaylistItemsNative?: (
          playlistUrl: string,
          limit?: number,
        ) => Promise<RawYouTubePlaylistResponse | RawYouTubePlaylistItem[]>;
      };
      if (typeof bridge.getPlaylistItemsNative !== 'function') return null;
      response = await bridge.getPlaylistItemsNative(safeUrl, MAX_COLLECTION_TRACKS);
    }

    if (!response) return null;

    let rawItems: RawYouTubePlaylistItem[] = [];
    let collectionTitle = 'YouTube Playlist';
    let subtitle = baseHost === 'music.youtube.com' ? 'YouTube Music' : 'YouTube';
    let collectionCover = '';
    let reportedTotal = 0;

    if (Array.isArray(response)) {
      rawItems = response;
      reportedTotal = response.length;
    } else {
      if (response.success === false) return null;
      rawItems = Array.isArray(response.items)
        ? response.items
        : Array.isArray(response.tracks)
          ? response.tracks
          : [];
      if (typeof response.title === 'string' && response.title.trim()) {
        collectionTitle = response.title.trim();
      }
      if (typeof response.subtitle === 'string' && response.subtitle.trim()) {
        subtitle = response.subtitle.trim();
      } else if (typeof response.uploader === 'string' && response.uploader.trim()) {
        subtitle = response.uploader.trim();
      }
      collectionCover = response.cover || response.thumbnail || '';
      reportedTotal = typeof response.totalTracks === 'number' && response.totalTracks > 0
        ? response.totalTracks
        : rawItems.length;
    }

    const totalTracks = Math.max(reportedTotal, rawItems.length);
    const truncated = totalTracks > MAX_COLLECTION_TRACKS || rawItems.length > MAX_COLLECTION_TRACKS;

    const tracks: Track[] = rawItems.slice(0, MAX_COLLECTION_TRACKS).flatMap((item): Track[] => {
      const videoId = (item.videoId || item.id || '').trim();
      if (!videoId || !/^[a-zA-Z0-9_-]{6,32}$/.test(videoId)) return [];
      const rawTitle = (item.title || '').trim();
      if (!rawTitle || /^\[(deleted|private)\s+video\]$/i.test(rawTitle)) return [];

      const cleaned = cleanVideoTitle(rawTitle);
      const rawChannel = (item.artist || item.channel || item.uploader || '').replace(/\s*-\s*Topic$/i, '').trim();
      const title = cleaned.title || rawTitle;
      const artist = cleaned.artist || rawChannel || 'YouTube';
      const cover = item.thumbnail || item.cover || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

      return [{
        id: `yt_${videoId}`,
        youtubeId: videoId,
        title,
        canonicalTitle: title,
        artist,
        album: collectionTitle,
        canonicalAlbum: collectionTitle,
        duration: typeof item.duration === 'number' && Number.isFinite(item.duration)
          ? Math.max(0, Math.round(item.duration))
          : 0,
        cover,
        preview: '',
        isrc: '',
        edition: 'unknown',
      }];
    });

    if (tracks.length === 0) return null;

    return {
      id: `youtube-playlist-${playlistId}`,
      type: 'playlist',
      source: 'youtube',
      title: collectionTitle,
      subtitle,
      cover: collectionCover || tracks[0].cover || '',
      tracks,
      totalTracks: Math.max(totalTracks, tracks.length),
      truncated,
    };
  } catch {
    return null;
  }
}

interface SpotifyEmbedArtist {
  name?: string;
}

interface SpotifyEmbedTrackEntry {
  uri?: string;
  uid?: string;
  id?: string;
  title?: string;
  name?: string;
  subtitle?: string;
  artists?: SpotifyEmbedArtist[];
  duration?: number;
  duration_ms?: number;
  isExplicit?: boolean;
  explicit?: boolean;
  cover?: string;
  album?: {
    name?: string;
    images?: Array<{ url?: string }>;
  };
  track?: SpotifyEmbedTrackEntry;
}

interface SpotifyEmbedEntity {
  name?: string;
  title?: string;
  subtitle?: string;
  artists?: SpotifyEmbedArtist[];
  ownerV2?: { data?: { name?: string } };
  visualIdentity?: { image?: Array<{ url?: string; maxWidth?: number }> };
  coverArt?: { sources?: Array<{ url?: string; width?: number }> };
  images?: Array<{ url?: string }>;
  totalTracks?: number;
  trackList?: SpotifyEmbedTrackEntry[];
  tracks?: { items?: SpotifyEmbedTrackEntry[]; total?: number };
}

function pickSpotifyEntityCover(entity: SpotifyEmbedEntity): string {
  const visualImages = entity.visualIdentity?.image;
  if (Array.isArray(visualImages) && visualImages.length > 0) {
    const sorted = [...visualImages].sort((a, b) => (b.maxWidth ?? 0) - (a.maxWidth ?? 0));
    const best = sorted.find((img) => typeof img.url === 'string' && img.url);
    if (best?.url) return best.url;
  }
  const coverSources = entity.coverArt?.sources;
  if (Array.isArray(coverSources) && coverSources.length > 0) {
    const sorted = [...coverSources].sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
    const best = sorted.find((img) => typeof img.url === 'string' && img.url);
    if (best?.url) return best.url;
  }
  const plainImage = entity.images?.find((img) => typeof img.url === 'string' && img.url);
  return plainImage?.url ?? '';
}

export function parseSpotifyEmbedHtml(
  html: string,
  type: 'album' | 'playlist',
  id: string,
): ResolvedCollection | null {
  if (!html || typeof html !== 'string') return null;

  const scriptMatch = html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!scriptMatch?.[1]) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(scriptMatch[1]);
  } catch {
    return null;
  }

  const root = parsed as {
    props?: {
      pageProps?: {
        state?: { data?: { entity?: SpotifyEmbedEntity } };
        entity?: SpotifyEmbedEntity;
      };
    };
  };

  const entity = root.props?.pageProps?.state?.data?.entity ?? root.props?.pageProps?.entity;
  if (!entity || typeof entity !== 'object') return null;

  const rawList: SpotifyEmbedTrackEntry[] = Array.isArray(entity.trackList)
    ? entity.trackList
    : Array.isArray(entity.tracks?.items)
      ? entity.tracks.items
      : [];

  if (rawList.length === 0) return null;

  const title = (entity.name || entity.title || '').trim()
    || (type === 'album' ? 'Spotify Album' : 'Spotify Playlist');
  const subtitle = (
    entity.subtitle
    || entity.artists?.map((a) => a.name).filter(Boolean).join(', ')
    || entity.ownerV2?.data?.name
    || 'Spotify'
  ).trim();
  const cover = pickSpotifyEntityCover(entity);

  const reportedTotal = entity.totalTracks ?? entity.tracks?.total ?? rawList.length;
  const totalTracks = Math.max(reportedTotal, rawList.length);
  const truncated = totalTracks > MAX_COLLECTION_TRACKS || rawList.length > MAX_COLLECTION_TRACKS;

  const tracks: Track[] = rawList.slice(0, MAX_COLLECTION_TRACKS).flatMap((entry, index): Track[] => {
    const item = entry.track ?? entry;
    const trackTitle = (item.title || item.name || '').trim();
    if (!trackTitle) return [];

    const artist = (
      item.subtitle
      || item.artists?.map((a) => a.name).filter(Boolean).join(', ')
      || (type === 'album' ? subtitle : '')
      || 'Unknown'
    ).trim();

    const uriId = typeof item.uri === 'string'
      ? item.uri.split(':').pop()?.trim()
      : undefined;
    const trackId = uriId || item.uid || item.id || `${id}-${index + 1}`;

    const durationMs = typeof item.duration === 'number'
      ? item.duration
      : typeof item.duration_ms === 'number'
        ? item.duration_ms
        : 0;
    const durationSec = Number.isFinite(durationMs) && durationMs > 0
      ? Math.round(durationMs / 1000)
      : 0;

    const albumTitle = type === 'album'
      ? title
      : (item.album?.name?.trim() || title);
    const trackCover = item.cover || item.album?.images?.[0]?.url || cover;
    const explicit = item.isExplicit ?? item.explicit;

    return [{
      id: `sp_${trackId}`,
      title: trackTitle,
      canonicalTitle: trackTitle,
      artist,
      album: albumTitle,
      canonicalAlbum: albumTitle,
      duration: durationSec,
      cover: trackCover,
      preview: '',
      isrc: '',
      edition: explicit === true ? 'explicit' : explicit === false ? 'clean' : 'unknown',
    }];
  });

  if (tracks.length === 0) return null;

  return {
    id: `spotify-${type}-${id}`,
    type,
    source: 'spotify',
    title,
    subtitle,
    cover: cover || tracks[0].cover || '',
    tracks,
    totalTracks,
    truncated,
  };
}

async function fetchSpotifyEmbedHtml(embedUrl: string): Promise<string | null> {
  if (isPyWebViewPlatform()) {
    const api = getPyWebViewApi();
    if (api?.spotify_embed_fetch) {
      const res = await api.spotify_embed_fetch(embedUrl);
      if (res?.success) {
        return res.html ?? res.data ?? null;
      }
      return null;
    }
  }

  if (typeof window !== 'undefined') {
    try {
      const { Capacitor, CapacitorHttp } = await import('@capacitor/core');
      if (Capacitor.isNativePlatform()) {
        const resp = await withHardTimeout(
          CapacitorHttp.get({
            url: embedUrl,
            connectTimeout: COLLECTION_TIMEOUT_MS,
            readTimeout: COLLECTION_TIMEOUT_MS,
            headers: {
              Accept: 'text/html,application/xhtml+xml',
              'X-User-Agent': MHL_USER_AGENT,
            },
          }),
          COLLECTION_TIMEOUT_MS,
        );
        if (resp.status >= 200 && resp.status < 300 && resp.data) {
          return typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data);
        }
      }
    } catch {
      // Fallback to standard fetch when CapacitorHttp is unavailable
    }
  }

  const res = await fetchWithTimeout(embedUrl, COLLECTION_TIMEOUT_MS, {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'X-User-Agent': MHL_USER_AGENT,
    },
  });
  if (!res.ok) return null;
  return await res.text();
}

async function resolveSpotifyCollection(
  type: 'album' | 'playlist',
  id: string,
): Promise<ResolvedCollection | null> {
  if ((type !== 'album' && type !== 'playlist') || !/^[a-zA-Z0-9]{8,40}$/.test(id)) {
    return null;
  }
  const embedUrl = `https://open.spotify.com/embed/${type}/${id}`;
  try {
    const html = await fetchSpotifyEmbedHtml(embedUrl);
    if (!html) return null;
    return parseSpotifyEmbedHtml(html, type, id);
  } catch {
    return null;
  }
}

export async function resolveCollectionFromUrl(url: string): Promise<ResolvedCollection | null> {
  const trimmed = url.trim().replace(/^[<"']+|[>"']+$/g, '');
  if (!trimmed) return null;

  const deezer = extractDeezerCollection(trimmed);
  if (deezer) {
    return resolveDeezerCollection(deezer.type, deezer.id);
  }

  const ytPlaylistId = extractYouTubePlaylistId(trimmed);
  if (ytPlaylistId) {
    return resolveYouTubePlaylist(trimmed, ytPlaylistId);
  }

  const spotify = extractSpotifyCollection(trimmed);
  if (spotify) {
    return resolveSpotifyCollection(spotify.type, spotify.id);
  }

  return null;
}
