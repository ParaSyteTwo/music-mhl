import { Track } from '../types/music';

const EDGE_FUNCTION_URL = import.meta.env.VITE_SUPABASE_URL
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/deezer-search`
  : 'http://localhost:54321/functions/v1/deezer-search';

export const deezerService = {
  // Fetch album details
  async getAlbum(albumId: number) {
    const response = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'album', albumId }),
    });

    if (!response.ok) throw new Error('Album fetch failed');

    const data = await response.json();
    return data;
  },

  // Search unified
  async searchAll(query: string) {
    const response = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'searchAll', query }),
    });

    if (!response.ok) throw new Error('Search failed');

    const data = await response.json();
    return data;
  },

  // Get home data
  async getHomeData() {
    const response = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'home' }),
    });

    if (!response.ok) throw new Error('Home data fetch failed');

    const data = await response.json();
    return data;
  },

  // Get artist details
  async getArtist(artistId: number) {
    const response = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'artist', artistId }),
    });

    if (!response.ok) throw new Error('Artist fetch failed');

    const data = await response.json();
    return data;
  },
};
