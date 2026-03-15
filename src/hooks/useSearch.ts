import { useState, useEffect } from 'react';
import { searchAll as searchAllDeezer } from '@/lib/api/musicApi';

export interface SearchResult {
  tracks: any[];
  artists: any[];
  albums: any[];
}

const LOCAL_STORAGE_KEY = 'music_search_history';

export function useSearchHistory() {
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (saved) {
      setRecentSearches(JSON.parse(saved));
    }
  }, []);

  const addSearch = (query: string) => {
    const filtered = recentSearches.filter((s) => s !== query);
    const updated = [query, ...filtered].slice(0, 8);
    setRecentSearches(updated);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
  };

  const clearHistory = () => {
    setRecentSearches([]);
    localStorage.removeItem(LOCAL_STORAGE_KEY);
  };

  return { recentSearches, addSearch, clearHistory };
}

export function useUnifiedSearch() {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [results, setResults] = useState<SearchResult>({ tracks: [], artists: [], albums: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { addSearch } = useSearchHistory();

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 400);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (debouncedQuery.trim()) {
      search(debouncedQuery);
    } else {
      setResults({ tracks: [], artists: [], albums: [] });
      setError(null);
    }
  }, [debouncedQuery]);

  const search = async (q: string) => {
    if (!q.trim()) {
      setResults({ tracks: [], artists: [], albums: [] });
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await searchAllDeezer(q);
      setResults(data);
      addSearch(q);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Search failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return { query, setQuery, results, loading, error, search };
}
