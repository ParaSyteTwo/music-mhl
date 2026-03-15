import { useState, useEffect } from 'react';

export interface SearchResult {
  tracks: any[];
  artists: any[];
  albums: any[];
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

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
  const [results, setResults] = useState<SearchResult>({ tracks: [], artists: [], albums: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { addSearch } = useSearchHistory();

  const search = async (q: string) => {
    if (!q.trim()) {
      setResults({ tracks: [], artists: [], albums: [] });
      setError(null);
      return;
    }

    setQuery(q);
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/deezer-search`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${SUPABASE_KEY}`,
          },
          body: JSON.stringify({ action: 'searchAll', query: q }),
        }
      );

      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`);
      }

      const data: SearchResult = await response.json();
      setResults(data);
      addSearch(q);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Search failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return { query, results, loading, error, search };
}
