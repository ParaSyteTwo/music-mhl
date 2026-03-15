import { useState, useEffect } from 'react';

export interface HomeTrack {
  id: string;
  deezerId: number;
  title: string;
  artist: string;
  album: string;
  duration: number;
  cover: string;
  coverSmall: string;
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

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

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

        const response = await fetch(
          `${SUPABASE_URL}/functions/v1/deezer-search`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${SUPABASE_KEY}`,
            },
            body: JSON.stringify({ action: 'home' }),
          }
        );

        if (!response.ok) {
          throw new Error(`API error: ${response.statusText}`);
        }

        const data: HomeData = await response.json();
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
