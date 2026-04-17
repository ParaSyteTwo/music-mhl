import Fuse from 'fuse.js';
import type { Track } from '@/types/music';

const fuseOptions: Fuse.IFuseOptions<Track> = {
  threshold: 0.35,
  distance: 200,
  minMatchCharLength: 1,
  keys: [
    { name: 'title', weight: 0.5 },
    { name: 'artist', weight: 0.35 },
    { name: 'album', weight: 0.15 },
  ],
};

export function buildFuseIndex(tracks: Track[]): Fuse<Track> {
  return new Fuse(tracks, fuseOptions);
}

export function searchLocalTracks(
  tracks: Track[],
  query: string,
  limit = 20,
): Track[] {
  if (!tracks.length || !query.trim()) return [];
  const fuse = buildFuseIndex(tracks);
  return fuse.search(query.trim()).slice(0, limit).map((r) => r.item);
}
