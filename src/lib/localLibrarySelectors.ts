import type { LocalTrack, LocalAlbum, LocalArtist, LocalGenre } from '@/types/music';

/** FNV-1a hash → integer in [0, 360) for deterministic hue mapping */
function artistHueHash(str: string): number {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return hash % 360;
}

/** Map a hue (0-359) to a gradient CSS class spanning the full color wheel */
function hueToGradient(hue: number): string {
  const h1 = hue;
  const h2 = (hue + 40) % 360;
  return `from-[hsl(${h1},75%,65%)]/20 to-[hsl(${h2},60%,45%)]/10`;
}

function getColorGradient(str: string): string {
  return hueToGradient(artistHueHash(str));
}

export function deriveAlbums(tracks: LocalTrack[]): LocalAlbum[] {
  const map = new Map<string, LocalTrack[]>();

  for (const track of tracks) {
    const key = `${track.album}__${track.artist}`;
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key)!.push(track);
  }

  return Array.from(map.entries())
    .map(([, albumTracks]) => {
      const first = albumTracks[0];
      const albumKey = `${first.album}__${first.artist}`;
      return {
        id: `album-${first.album}-${first.artist}`.toLowerCase().replace(/\s+/g, '-'),
        name: first.album,
        artist: first.artist,
        cover: first.cover,
        colorGradient: getColorGradient(albumKey),
        trackCount: albumTracks.length,
        tracks: albumTracks.sort((a, b) => a.title.localeCompare(b.title)),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function deriveArtists(tracks: LocalTrack[]): LocalArtist[] {
  const map = new Map<string, LocalTrack[]>();

  for (const track of tracks) {
    const artist = track.artist;
    if (!map.has(artist)) {
      map.set(artist, []);
    }
    map.get(artist)!.push(track);
  }

  return Array.from(map.entries())
    .map(([artist, artistTracks]) => {
      const albums = new Set(artistTracks.map((t) => t.album));
      const first = artistTracks[0];
      return {
        id: `artist-${artist}`.toLowerCase().replace(/\s+/g, '-'),
        name: artist,
        cover: first.cover,
        colorGradient: getColorGradient(artist),
        albumCount: albums.size,
        trackCount: artistTracks.length,
        tracks: artistTracks,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function deriveGenres(tracks: LocalTrack[]): LocalGenre[] {
  const map = new Map<string, LocalTrack[]>();

  for (const track of tracks) {
    const genre = track.genre || 'Sin género';
    if (!map.has(genre)) {
      map.set(genre, []);
    }
    map.get(genre)!.push(track);
  }

  return Array.from(map.entries())
    .map(([genre, genreTracks]) => ({
      id: `genre-${genre}`.toLowerCase().replace(/\s+/g, '-'),
      name: genre,
      colorGradient: getColorGradient(genre),
      trackCount: genreTracks.length,
      tracks: genreTracks.sort((a, b) => a.title.localeCompare(b.title)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function deriveTopPlayed(tracks: LocalTrack[], limit = 20): LocalTrack[] {
  return [...tracks].sort((a, b) => (b.playCount ?? 0) - (a.playCount ?? 0)).slice(0, limit);
}
