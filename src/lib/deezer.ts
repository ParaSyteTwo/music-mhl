// Deezer API is now called directly from the browser.
// All Deezer functionality has been moved to @/lib/api/musicApi.ts
// This file is kept for backwards compatibility.
export {
  searchDeezer,
  searchAll,
  fetchDeezerHome,
  fetchArtistDetail,
  fetchAlbumDetail,
  fetchGenreChart,
} from './api/musicApi';
