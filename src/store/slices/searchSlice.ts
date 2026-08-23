import { StateCreator } from 'zustand';
import { MusicStore, SearchSlice } from './types';
import { searchDeezer } from '@/lib/api/musicApi';
import { isDirectMediaUrl, resolveTrackFromUrl } from '@/lib/music/urlResolver';

let searchRequestId = 0;

export const createSearchSlice: StateCreator<
  MusicStore,
  [],
  [],
  SearchSlice
> = (set, get) => ({
  searchQuery: '',
  searchResults: [],
  isSearching: false,
  searchOffset: 0,
  hasMoreResults: true,
  isLoadingMore: false,

  performSearch: async (query) => {
    const normalizedQuery = query.trim().replace(/\s+/g, ' ');
    const requestId = ++searchRequestId;
    try {
      if (!normalizedQuery) {
        set({
          searchResults: [],
          isSearching: false,
          isLoadingMore: false,
          searchQuery: '',
          searchOffset: 0,
          hasMoreResults: true,
        });
        document.title = 'MHL Music';
        return;
      }
      set({
        isSearching: true,
        isLoadingMore: false,
        searchQuery: normalizedQuery,
        searchOffset: 0,
        hasMoreResults: true,
      });

      if (isDirectMediaUrl(normalizedQuery)) {
        const resolved = await resolveTrackFromUrl(normalizedQuery);
        if (requestId !== searchRequestId) return;
        set({
          searchResults: resolved ? [resolved] : [],
          isSearching: false,
          hasMoreResults: false,
        });
        return;
      }

      const tracks = await searchDeezer(normalizedQuery, 0, 25);
      if (requestId !== searchRequestId) return;
      set({ searchResults: tracks, isSearching: false, hasMoreResults: tracks.length >= 25 });
      try {
        const stored = JSON.parse(localStorage.getItem('mhl-recent-searches') || '[]') as string[];
        const updated = [normalizedQuery, ...stored.filter((s) => s.toLowerCase() !== normalizedQuery.toLowerCase())].slice(0, 5);
        localStorage.setItem('mhl-recent-searches', JSON.stringify(updated));
      } catch { /* ignore */ }
    } catch (error) {
      console.error('Search error:', error);
      if (requestId === searchRequestId) set({ isSearching: false });
    }
  },

  loadMoreResults: async () => {
    const { isLoadingMore, hasMoreResults, searchQuery, searchOffset, searchResults } = get();
    if (isLoadingMore || !hasMoreResults || !searchQuery.trim()) return;
    const requestId = searchRequestId;
    const requestedQuery = searchQuery;
    set({ isLoadingMore: true });
    try {
      const newOffset = searchOffset + 25;
      const tracks = await searchDeezer(requestedQuery, newOffset, 25);
      const current = get();
      if (requestId !== searchRequestId || current.searchQuery !== requestedQuery) return;
      if (tracks.length < 25) set({ hasMoreResults: false });
      const existingIds = new Set(searchResults.map((t) => t.id));
      const newTracks = tracks.filter((t) => !existingIds.has(t.id));
      set({ searchResults: [...searchResults, ...newTracks], searchOffset: newOffset, isLoadingMore: false });
    } catch (error) {
      console.error('Load more error:', error);
      if (requestId === searchRequestId) set({ isLoadingMore: false });
    }
  },

  setDirectTrack: (track) => {
    set({
      searchQuery: track.title,
      searchResults: [track],
      isSearching: false,
      hasMoreResults: false,
      isLoadingMore: false,
      searchOffset: 0,
    });
  },

  clearSearch: () => {
    set({
      searchQuery: '',
      searchResults: [],
      isSearching: false,
      isLoadingMore: false,
      searchOffset: 0,
      hasMoreResults: true,
    });
    document.title = 'MHL Music';
  },
});
