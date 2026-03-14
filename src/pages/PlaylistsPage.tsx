import { useMusicStore } from '@/store/musicStore';
import { TrackRow } from '@/components/music/TrackRow';
import { Plus, ListMusic } from 'lucide-react';
import { motion } from 'framer-motion';
import { useState } from 'react';

export default function PlaylistsPage() {
  const { playlists, createPlaylist } = useMusicStore();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [selectedPlaylist, setSelectedPlaylist] = useState<string | null>(null);

  const handleCreate = () => {
    if (newName.trim()) {
      createPlaylist(newName.trim());
      setNewName('');
      setShowCreate(false);
    }
  };

  const active = selectedPlaylist ? playlists.find(p => p.id === selectedPlaylist) : null;

  return (
    <div className="px-8 py-10">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold tracking-tighter">Playlists</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Nueva
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="glass-panel rounded-lg p-4 mb-6 flex items-center gap-3"
        >
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="Nombre de la playlist..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <button onClick={handleCreate} className="text-sm font-medium text-primary hover:text-primary/80">
            Crear
          </button>
          <button onClick={() => setShowCreate(false)} className="text-sm text-muted-foreground hover:text-foreground">
            Cancelar
          </button>
        </motion.div>
      )}

      <div className="flex gap-6">
        {/* Playlist list */}
        <div className="w-64 shrink-0 space-y-1">
          {playlists.map((pl, i) => (
            <motion.button
              key={pl.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              onClick={() => setSelectedPlaylist(pl.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors ${
                selectedPlaylist === pl.id ? 'bg-primary/10 text-primary' : 'hover:bg-white/5 text-foreground'
              }`}
            >
              <div className="w-10 h-10 rounded bg-gradient-to-br from-primary/20 to-accent/10 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{pl.name}</p>
                <p className="text-xs text-muted-foreground timer-font">{pl.tracks.length} tracks</p>
              </div>
            </motion.button>
          ))}
        </div>

        {/* Playlist tracks */}
        <div className="flex-1">
          {active ? (
            <>
              <h2 className="text-lg font-semibold tracking-tight mb-4">{active.name}</h2>
              {active.tracks.length > 0 ? (
                <div className="space-y-1">
                  {active.tracks.map((track, i) => (
                    <TrackRow key={track.id} track={track} index={i} />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-10 text-center">Esta playlist está vacía</p>
              )}
            </>
          ) : (
            <div className="flex items-center justify-center py-20">
              <div className="text-center">
                <ListMusic className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Selecciona una playlist</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
