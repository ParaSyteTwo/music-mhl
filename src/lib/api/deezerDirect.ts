// Deezer API directa para Tauri Desktop — usa comando Rust (reqwest) para evitar CORS
import { invoke } from '@tauri-apps/api/core';

async function dzGet(path: string): Promise<unknown> {
  const text = await invoke<string>('deezer_get', { path });
  const data = JSON.parse(text) as unknown;
  // Deezer devuelve { error: { ... } } en algunos errores
  if (data && typeof data === 'object' && 'error' in data) {
    throw new Error(`Deezer error: ${JSON.stringify((data as Record<string, unknown>).error)}`);
  }
  return data;
}

async function dzGetMany(paths: string[]): Promise<unknown[]> {
  return Promise.all(paths.map((p) => dzGet(p)));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function cleanAlbumTitle(title: string): string {
  let t = (title || '').replace(/\s+/g, ' ');
  t = t.replace(/\b(opening|ending)\s+theme\s+song\b/gi, '');
  t = t.replace(/\b(opening|ending)\s+theme\b/gi, '');
  t = t.replace(/\btheme\s+song\b/gi, '');
  t = t.replace(/\b(ost|original soundtrack|soundtrack)\b/gi, '');
  t = t.replace(/\s+/g, ' ').trim();
  const parts = t.split(/\s[-–—:]\s/);
  if (parts.length > 1) {
    const suffix = parts.slice(1).join(' - ');
    if (/(opening|ending|theme|ost|soundtrack|season|anime|ver\.?|version)/i.test(suffix)) {
      t = parts[0].trim() || t;
    }
  }
  return t || title || 'Unknown';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformTrack(item: any) {
  const canonicalTitle = item.title_short || item.title || 'Unknown';
  const album = item.album || {};
  const artist = item.artist || {};
  return {
    id: `dz-${item.id}`,
    deezerId: item.id,
    title: item.title || canonicalTitle,
    canonicalTitle,
    canonicalAlbum: cleanAlbumTitle(album.title || 'Unknown'),
    artist: artist.name || 'Unknown',
    album: album.title || 'Unknown',
    duration: item.duration || 0,
    cover: album.cover_big || album.cover_medium || album.cover_small || '',
    coverSmall: album.cover_medium || album.cover_small || '',
    coverXL: album.cover_xl || album.cover_big || '',
    preview: item.preview || '',
    artistId: artist.id,
    albumId: album.id,
    rank: item.rank,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformArtist(item: any) {
  return {
    id: `dz-artist-${item.id}`,
    deezerId: item.id,
    name: item.name || 'Unknown',
    picture: item.picture_xl || item.picture_big || item.picture_medium || '',
    pictureSmall: item.picture_medium || item.picture_small || '',
    pictureXL: item.picture_xl || item.picture_big || '',
    fans: item.nb_fan || 0,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformAlbum(item: any) {
  const artist = item.artist || {};
  return {
    id: `dz-album-${item.id}`,
    deezerId: item.id,
    title: item.title || 'Unknown',
    artist: artist.name || 'Unknown',
    artistId: artist.id,
    cover: item.cover_big || item.cover_medium || item.cover_small || '',
    coverSmall: item.cover_medium || item.cover_small || '',
    coverXL: item.cover_xl || item.cover_big || '',
    releaseDate: item.release_date,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    genre: (item.genres?.data?.length > 0) ? (item.genres.data[0] as any).name : null,
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function searchDeezerDirect(query: string, limit = 25, offset = 0) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await dzGet(`/search?q=${encodeURIComponent(query)}&limit=${limit}&index=${offset}`) as any;
  return {
    success: true,
    tracks: (data.data || []).map(transformTrack),
    total: data.total || 0,
  };
}

export async function searchAllDeezerDirect(query: string) {
  const q = encodeURIComponent(query);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [tracksD, artistsD, albumsD] = await dzGetMany([
    `/search?q=${q}&limit=10`,
    `/search/artist?q=${q}&limit=5`,
    `/search/album?q=${q}&limit=5`,
  ]) as any[];
  return {
    success: true,
    tracks: (tracksD.data || []).map(transformTrack),
    artists: (artistsD.data || []).map(transformArtist),
    albums: (albumsD.data || []).map(transformAlbum),
  };
}

export async function getDeezerArtistDirect(artistId: string) {
  const q = artistId;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [infoD, topD, albumsD, relatedD] = await dzGetMany([
    `/artist/${q}`,
    `/artist/${q}/top?limit=10`,
    `/artist/${q}/albums?limit=10`,
    `/artist/${q}/related?limit=8`,
  ]) as any[];
  return {
    success: true,
    info: {
      id: infoD.id,
      name: infoD.name,
      picture: infoD.picture_xl || infoD.picture_big || '',
      fans: infoD.nb_fan || 0,
    },
    topTracks: (topD.data || []).map(transformTrack),
    albums: (albumsD.data || []).map(transformAlbum),
    related: (relatedD.data || []).map(transformArtist),
  };
}

export async function getDeezerAlbumDirect(albumId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const albumD = await dzGet(`/album/${albumId}`) as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const artistAlbumsD = await dzGet(`/artist/${albumD.artist.id}/albums?limit=20`) as any;
  return {
    success: true,
    album: {
      id: albumD.id,
      title: albumD.title || '',
      cover: albumD.cover_xl || albumD.cover_big || albumD.cover_medium || '',
      artist: { id: albumD.artist.id, name: albumD.artist.name },
      releaseDate: albumD.release_date,
      trackCount: albumD.nb_tracks || 0,
      tracks: (albumD.tracks?.data || []).map(transformTrack),
      genre: albumD.genres?.data?.length > 0 ? albumD.genres.data[0].name : null,
    },
    moreByArtist: (artistAlbumsD.data || [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((a: any) => String(a.id) !== String(albumId))
      .slice(0, 4)
      .map(transformAlbum),
  };
}

export async function getDeezerTrackDirect(trackId: string) {
  return dzGet(`/track/${trackId}`);
}

export async function getDeezerTrackMetaDirect(trackId: string) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const trackD = await dzGet(`/track/${trackId}`) as any;
    const albumId = trackD.album?.id;
    const trackNumber = trackD.track_position ?? null;
    const releaseDate: string | undefined = trackD.release_date;
    const year = releaseDate ? parseInt(releaseDate.split('-')[0], 10) : null;
    let genre: string | null = null;
    if (albumId) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const albumD = await dzGet(`/album/${albumId}`) as any;
        genre = albumD.genres?.data?.length > 0 ? albumD.genres.data[0].name : null;
      } catch { /* genre is non-critical */ }
    }
    return { success: true, genre, year, trackNumber };
  } catch {
    return { success: true, genre: null, year: null, trackNumber: null };
  }
}

export async function getDeezerHomeDirect() {
  const genreIds = [132, 116, 152, 106, 165, 197];
  const genreNames: Record<number, string> = {
    132: 'Pop', 116: 'Rap', 152: 'Rock', 106: 'Electronic', 165: 'R&B', 197: 'Latin',
  };
  const paths = [
    '/chart/0/tracks?limit=20',
    '/genre',
    '/chart/0/artists?limit=12',
    '/chart/0/albums?limit=12',
    ...genreIds.map((gid) => `/chart/${gid}/tracks?limit=10`),
  ];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [topTracksD, genresD, artistsD, albumsD, ...genreTracks] = await dzGetMany(paths) as any[];

  const byGenre: Record<string, { genreId: number; tracks: unknown[] }> = {};
  genreIds.forEach((gid, i) => {
    byGenre[genreNames[gid]] = {
      genreId: gid,
      tracks: (genreTracks[i]?.data || []).map(transformTrack),
    };
  });

  return {
    success: true,
    topTracks: (topTracksD.data || []).map(transformTrack),
    genres: (genresD.data || []).slice(0, 50).map((g: { id: number; name: string; picture_xl?: string; picture_big?: string; picture_medium?: string }) => ({
      id: g.id,
      name: g.name,
      picture: g.picture_xl || g.picture_big || g.picture_medium || '',
    })),
    byGenre,
    trendingArtists: (artistsD.data || []).map(transformArtist),
    newAlbums: (albumsD.data || []).map(transformAlbum),
  };
}

export async function getDeezerGenreDirect(genreId: number) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await dzGet(`/chart/${genreId}/tracks?limit=25`) as any;
  const tracks = (data.data || []).map(transformTrack);
  return { success: true, tracks, total: data.total || tracks.length };
}
