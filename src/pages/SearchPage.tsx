import { useMusicStore } from '@/store/musicStore';
import { TrackCard } from '@/components/music/TrackCard';
import { TrackRow } from '@/components/music/TrackRow';
import { SearchBar } from '@/components/music/SearchBar';
import { Grid3x3, List } from 'lucide-react';
import { useState } from 'react';
import { ViewMode } from '@/types/music';

export default function SearchPage() {
  const { searchResults, searchQuery } = useMusicStore();
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  return (
    <div className="px-8 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tighter mb-4">Search</h1>
        <SearchBar />
      </div>

      {/* View toggle */}
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-muted-foreground">
          {searchQuery ? `Resultados para "${searchQuery}"` : 'Todos los tracks'} · <span className="timer-font">{searchResults.length}</span>
        </p>
        <div className="flex items-center gap-1 bg-secondary/50 rounded-lg p-1">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-1.5 rounded transition-colors ${viewMode === 'grid' ? 'bg-muted text-foreground' : 'text-muted-foreground'}`}
          >
            <Grid3x3 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-1.5 rounded transition-colors ${viewMode === 'list' ? 'bg-muted text-foreground' : 'text-muted-foreground'}`}
          >
            <List className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Results */}
      {viewMode === 'grid' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {searchResults.map((track, i) => (
            <TrackCard key={track.id} track={track} index={i} />
          ))}
        </div>
      ) : (
        <div className="space-y-1">
          {searchResults.map((track, i) => (
            <TrackRow key={track.id} track={track} index={i} />
          ))}
        </div>
      )}

      {searchResults.length === 0 && (
        <div className="text-center py-20">
          <p className="text-muted-foreground text-sm">No se encontraron resultados</p>
        </div>
      )}
    </div>
  );
}
