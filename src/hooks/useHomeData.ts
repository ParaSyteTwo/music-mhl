import { useState, useEffect } from 'react';
import { fetchDeezerHome } from '@/lib/api/musicApi';

export interface HomeTrack {
  id: string;
  deezerId: number;
  title: string;
  artist: string;
  album: string;
  duration: number;
  cover: string;
  coverSmall: string;
  coverXL?: string;
  preview: string;
  artistId?: number;
  albumId?: number;
  rank?: number;
}

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

export interface HomeGenre {
  id: number;
  name: string;
  picture: string;
}

export interface HomeData {
  topTracks: HomeTrack[];
  genres: HomeGenre[];
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
          topTracks: homeData.topTracks as HomeTrack[],
          genres: [],
          byGenre: Object.fromEntries(
            Object.entries(homeData.byGenre).map(([genreName, tracks]) => [
              genreName,
              {
                genreId: 0,
                tracks: tracks as HomeTrack[],
              },
            ])
          ),
          trendingArtists: [],
          newAlbums: [],
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
