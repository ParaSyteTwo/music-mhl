import { useState, useEffect } from 'react';
import { fetchDeezerHome } from '@/lib/api/musicApi';
import { Track } from '@/types/music';

export type HomeTrack = Track;

export interface HomeArtist {
  id: string;
  deezerId: number;
  name: string;
  picture: string;
  pictureSmall: string;
  pictureXL?: string;
  fans: number;
}

export interface HomeAlbum {
  id: string;
  deezerId: number;
  title: string;
  artist: string;
  artistId?: number;
  cover: string;
  coverSmall: string;
  coverXL?: string;
  releaseDate: string;
}

export interface HomeData {
  topTracks: HomeTrack[];
  byGenre: Record<string, { genreId: number; tracks: HomeTrack[] }>;
  trendingArtists: HomeArtist[];
  newAlbums: HomeAlbum[];
}

interface UseHomeDataState {
  data: HomeData | null;
  loading: boolean;
  error: string | null;
}

export function useHomeData(): UseHomeDataState {
  const [state, setState] = useState<UseHomeDataState>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    async function fetchHomeData() {
      try {
        setState({ data: null, loading: true, error: null });
        const homeData = await fetchDeezerHome();

        const data: HomeData = {
          topTracks: homeData.topTracks,
          byGenre: homeData.byGenre,
          trendingArtists: homeData.trendingArtists as HomeArtist[],
          newAlbums: homeData.newAlbums as HomeAlbum[],
        };

        setState({ data, loading: false, error: null });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to load home data';
        setState({ data: null, loading: false, error: msg });
      }
    }

    fetchHomeData();
  }, []);

  return state;
}
