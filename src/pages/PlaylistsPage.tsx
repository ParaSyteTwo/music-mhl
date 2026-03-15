import { useMusicStore } from '@/store/musicStore';
import { TrackRow } from '@/components/music/TrackRow';
import { Plus, ListMusic, Trash2, Pencil, Play } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { EmptyState, ListIcon } from '@/components/ui/empty-state';

export default function PlaylistsPage() {
  const { playlists, createPlaylist, deletePlaylist, renamePlaylist, playQueue } = useMusicStore();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [selectedPlaylist, setSelectedPlaylist] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const handleCreate = () => {
    if (newName.trim()) {
      createPlaylist(newName.trim());
      setNewName('');
      setShowCreate(false);
    }
  };

  const handleRename = (id: string) => {
    if (editName.trim()) {
      renamePlaylist(id, editName.trim());
    }
    setEditingId(null);
  };

  const active = selectedPlaylist ? playlists.find(p => p.id === selectedPlaylist) : null;

  return (
    <div className="px-4 sm:px-8 py-6 sm:py-10">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 sm:gap-0 mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tighter">Playlists</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Nueva
        </button>
      </div>

      {/* Create form */}
      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
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
      </AnimatePresence>

      {playlists.length === 0 && !showCreate && (
        <EmptyState
          icon={<ListIcon />}
          title="No Playlists Yet"
          description="Create your first playlist to organize and enjoy your music."
          action={{
            label: 'Create Playlist',
            onClick: () => setShowCreate(true),
          }}
        />
      )}

      {playlists.length > 0 && (
        <div className="flex gap-6">
          {/* Playlist list */}
          <div className="w-64 shrink-0 space-y-1">
            {playlists.map((pl, i) => (
              <motion.div
                key={pl.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className={`group flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors cursor-pointer ${
                  selectedPlaylist === pl.id ? 'bg-primary/10 text-primary' : 'hover:bg-white/5 text-foreground'
                }`}
                onClick={() => setSelectedPlaylist(pl.id)}
              >
                <div className="w-10 h-10 rounded bg-gradient-to-br from-primary/20 to-accent/10 shrink-0 flex items-center justify-center">
                  <ListMusic className="w-4 h-4 text-primary/60" />
                </div>
                <div className="min-w-0 flex-1">
                  {editingId === pl.id ? (
                    <input
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleRename(pl.id); if (e.key === 'Escape') setEditingId(null); }}
                      onBlur={() => handleRename(pl.id)}
                      className="text-sm font-medium bg-transparent outline-none w-full"
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <p className="text-sm font-medium truncate">{pl.name}</p>
                  )}
                  <p className="text-xs text-muted-foreground timer-font">{pl.tracks.length} tracks</p>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditingId(pl.id); setEditName(pl.name); }}
                    className="p-1 hover:text-primary transition-colors"
                    title="Renombrar"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (selectedPlaylist === pl.id) setSelectedPlaylist(null);
                      deletePlaylist(pl.id);
                    }}
                    className="p-1 hover:text-destructive transition-colors"
                    title="Eliminar"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Playlist tracks */}
          <div className="flex-1">
            {active ? (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold tracking-tight">{active.name}</h2>
                  {active.tracks.length > 0 && (
                    <button
                      onClick={() => playQueue(active.tracks, 0)}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                    >
                      <Play className="w-3.5 h-3.5" />
                      Reproducir todo
                    </button>
                  )}
                </div>
                {active.tracks.length > 0 ? (
                  <div className="space-y-1">
                    {active.tracks.map((track, i) => (
                      <TrackRow key={track.id} track={track} index={i} playlistId={active.id} contextTracks={active.tracks} />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground py-10 text-center">Esta playlist está vacía. Busca canciones y añádelas desde el menú ···</p>
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
      )}
    </div>
  );
}
