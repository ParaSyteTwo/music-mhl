import type { LocalTrack, LocalAlbum, LocalArtist, LocalGenre } from '@/types/music';

// Generate a unique color gradient based on a string
function getColorGradient(str: string): string {
  const colors = [
    'from-[#C8F04B]/20 to-[#8BC34A]/10',
    'from-[#FF6B9D]/20 to-[#C44569]/10',
    'from-[#4ECDC4]/20 to-[#44A08D]/10',
    'from-[#FFE66D]/20 to-[#FFA502]/10',
    'from-[#95E1D3]/20 to-[#38A169]/10',
    'from-[#A8EDEA]/20 to-[#FED6E3]/10',
    'from-[#FF9A56]/20 to-[#FF6348]/10',
    'from-[#667eea]/20 to-[#764ba2]/10',
  ];
  const hash = str.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return colors[hash % colors.length];
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
