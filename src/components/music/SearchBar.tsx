import { Search, Command } from 'lucide-react';
import { useMusicStore } from '@/store/musicStore';

export function SearchBar() {
  const { searchQuery, setSearchQuery } = useMusicStore();

  return (
    <div className="relative group">
      <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
      <input
        type="text"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Search songs, artists, albums, or paste a URL..."
        className="w-full h-11 pl-11 pr-16 rounded-lg bg-secondary/50 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all duration-200"
      />
      <kbd className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:flex items-center gap-0.5 text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-mono">
        <Command className="w-2.5 h-2.5" />K
      </kbd>
    </div>
  );
}
