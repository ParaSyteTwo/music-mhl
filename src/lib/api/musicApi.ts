import { Track } from '@/types/music';
import { supabase } from '@/integrations/supabase/client';
import { Capacitor } from '@capacitor/core';

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

// ─── Deezer Artist Data ───
export async function getDeezerArtist(artistId: string) {
  return callDeezerProxy({ action: 'artist', artistId });
}

// ─── Deezer Album Data ───
export async function getDeezerAlbum(albumId: string) {
  return callDeezerProxy({ action: 'album', albumId });
}

// ─── Genre for a track (via its album) ───
export async function getDeezerTrackGenre(albumId: string | number): Promise<string | null> {
  try {
    const data = await callDeezerProxy({ action: 'album', albumId: String(albumId) });
    return data?.album?.genre || null;
  } catch {
    return null;
  }
}

interface DownloadOptions {
  format?: 'mp3' | 'aac';
  quality?: 'alta' | 'media' | 'baja';
}

// ─── Download track audio ───
// Android: yt-dlp local (via YtDlpPlugin nativo)
// Web: no disponible — descarga solo desde la app Android
export async function downloadTrackAudio(
  track: Track,
  onProgress?: (progress: number) => void,
  options: DownloadOptions = {},
): Promise<ArrayBuffer> {
  if (!Capacitor.isNativePlatform()) {
    throw new Error('Descarga disponible solo en la app Android');
  }

  const { searchYouTubeNative, downloadMp3Native } = await import('@/lib/ytdlpBridge');
  const query = `${track.title} ${track.artist}`;

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

// ─── Lyrics (LRCLIB) ───
export async function getLyrics(title: string, artist: string, duration?: number): Promise<{ synced: string | null; plain: string | null }> {
  try {
    const params = new URLSearchParams({ track_name: title, artist_name: artist });
    if (duration) params.set('duration', String(Math.round(duration)));
    const res = await fetch(`https://lrclib.net/api/get?${params}`);
    if (!res.ok) return { synced: null, plain: null };
    const data = await res.json();
    return {
      synced: data.syncedLyrics || null,
      plain: data.plainLyrics || null,
    };
  } catch {
    return { synced: null, plain: null };
  }
}
