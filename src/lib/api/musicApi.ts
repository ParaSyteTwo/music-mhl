import { Track } from '@/types/music';
import { createClient } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';

let _supabaseClient: ReturnType<typeof createClient> | null = null;

function getSupabaseClient() {
  if (_supabaseClient) return _supabaseClient;

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

  _supabaseClient = createClient(supabaseUrl || '', supabaseKey || '', {
    auth: {
      storage: localStorage,
      persistSession: true,
      autoRefreshToken: true,
    },
  });

  return _supabaseClient;
}

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
  const supabase = getSupabaseClient();
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

interface WebDownloadTicketResponse {
  success: boolean;
  downloadUrl?: string;
  fileName?: string;
  expiresAt?: string;
  error?: string;
}

// ─── Download track audio ───
// Android: yt-dlp local (via YtDlpPlugin nativo)
// Web: Supabase broker issues a short-lived ticket for the external yt-dlp service
export async function downloadTrackAudio(
  track: Track,
  onProgress?: (progress: number) => void,
  options: DownloadOptions = {},
): Promise<ArrayBuffer> {
  if (Capacitor.isNativePlatform()) {
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

  onProgress?.(15);
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

  const ticketRes = await fetch(`${supabaseUrl}/functions/v1/yt-stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
    },
    body: JSON.stringify({
      action: 'webDownloadTicket',
      title: track.title,
      artist: track.artist,
      album: track.album ?? '',
      format: options.format ?? 'mp3',
    }),
  });

  if (!ticketRes.ok) {
    const err = await ticketRes.json().catch(() => ({ error: 'Error desconocido' }));
    throw new Error(err.error || 'Error descargando audio');
  }

  const ticket = (await ticketRes.json()) as WebDownloadTicketResponse;
  if (!ticket.success || !ticket.downloadUrl) {
    throw new Error(ticket.error || 'No se pudo obtener el ticket de descarga');
  }

  onProgress?.(45);
  const audioRes = await fetch(ticket.downloadUrl);
  if (!audioRes.ok) {
    const err = await audioRes.json().catch(() => ({ error: 'Error descargando audio' }));
    throw new Error(err.error || 'Error descargando audio');
  }

  onProgress?.(85);
  const buffer = await audioRes.arrayBuffer();
  return buffer;
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
