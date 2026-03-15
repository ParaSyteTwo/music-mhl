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
    <div className="px-4 sm:px-8 py-6 sm:py-10">
      <div className="mb-8 sm:mb-10">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4 sm:mb-6 font-[family-name:Syne] text-[#F5F5F0]">Search</h1>
        <SearchBar />
      </div>

      {/* View toggle */}
      <div className="flex items-center justify-between mb-6 sm:mb-8">
        <p className="text-xs sm:text-sm text-[#666660]">
          {searchQuery ? `Resultados para "${searchQuery}"` : 'Todos los tracks'} · <span className="timer-font text-[#C8F04B]">{searchResults.length}</span>
        </p>
        <div className="flex items-center gap-1 bg-[rgba(255,255,255,0.04)] rounded-lg p-1">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-1.5 rounded transition-colors ${viewMode === 'grid' ? 'bg-[#C8F04B]/20 text-[#C8F04B]' : 'text-[#666660]'}`}
          >
            <Grid3x3 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-1.5 rounded transition-colors ${viewMode === 'list' ? 'bg-[#C8F04B]/20 text-[#C8F04B]' : 'text-[#666660]'}`}
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Results */}
      {viewMode === 'grid' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-4">
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
          <p className="text-[#666660] text-sm">No se encontraron resultados</p>
        </div>
      )}
    </div>
  );
}
