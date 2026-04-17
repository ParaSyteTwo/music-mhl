import { useState, useEffect } from 'react';

export function useNetworkStatus(): boolean {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  return isOnline;
}

export type SearchMode = 'local' | 'deezer' | 'youtube';

export function useSearchMode(): SearchMode | null {
  const { searchMode } = useMusicStore_t();
  return searchMode;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function useMusicStore_t(): any {
  // Lazy import to avoid circular deps
  // eslint-disable-next-line @typescript-eslint/no-shadow
  const { useMusicStore } = require('@/store/musicStore');
  return useMusicStore();
}
