import { useParams, useNavigate } from 'react-router-dom';
import { useMusicStore } from '@/store/musicStore';
import { Play, Download, Plus, ArrowLeft, ChevronDown } from 'lucide-react';
import { motion } from 'framer-motion';
import { useState } from 'react';
import { AudioFormat } from '@/types/music';

const formats: AudioFormat[] = ['AUTO', 'MP3', 'AAC', 'FLAC', 'OPUS'];

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function TrackDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { searchResults, library, playTrack, playTrackWithYouTube, addToLibrary, startDownload } = useMusicStore();
  const [selectedFormat, setSelectedFormat] = useState<AudioFormat>('AUTO');
  const [showFormats, setShowFormats] = useState(false);

  const allTracks = [...searchResults, ...library];
  const track = allTracks.find(t => t.id === id);

  if (!track) {
    return (
      <div className="px-8 py-10 text-center">
        <p className="text-muted-foreground">Track no encontrado</p>
        <button onClick={() => navigate(-1)} className="text-primary text-sm mt-2">Volver</button>
      </div>
    );
  }

  const isInLibrary = library.some(t => t.id === track.id);

  return (
    <div className="px-8 py-10">
      {/* Back button */}
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Volver
      </button>

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="flex gap-8 mb-12"
      >
        {/* Cover */}
        <div className="w-56 h-56 rounded-lg bg-secondary shrink-0 overflow-hidden ring-1 ring-inset ring-white/5">
          {track.cover ? (
            <img src={track.cover} alt={track.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-primary/30 via-accent/15 to-secondary" />
          )}
        </div>

        {/* Info */}
        <div className="flex-1 flex flex-col justify-end">
          <p className="text-xs text-muted-foreground font-mono uppercase tracking-widest mb-2">Track</p>
          <h1 className="text-4xl font-semibold tracking-tighter mb-1">{track.title}</h1>
          <p className="text-lg text-muted-foreground mb-4">{track.artist}</p>
          <p className="text-sm text-muted-foreground mb-6">{track.album}</p>

          {/* Metadata */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground timer-font mb-6">
            <span>{formatDuration(track.duration)}</span>
            {track.bitrate && <><span>·</span><span>{track.bitrate}</span></>}
            {track.format && <><span>·</span><span>{track.format}</span></>}
            {track.fileSize && <><span>·</span><span>{track.fileSize}</span></>}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => playTrackWithYouTube(track)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <Play className="w-4 h-4" />
              Reproducir
            </button>

            {/* Download segmented control */}
            <div className="flex items-center rounded-lg ring-1 ring-inset ring-white/10 overflow-hidden">
              <button
                onClick={() => startDownload(track, selectedFormat)}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium hover:bg-white/5 transition-colors"
              >
                <Download className="w-4 h-4" />
                Descargar
              </button>
              <div className="w-px h-6 bg-border" />
              <div className="relative">
                <button
                  onClick={() => setShowFormats(!showFormats)}
                  className="flex items-center gap-1 px-3 py-2.5 text-sm font-mono hover:bg-white/5 transition-colors"
                >
                  {selectedFormat}
                  <ChevronDown className="w-3 h-3" />
                </button>
                {showFormats && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="absolute right-0 top-full mt-1 glass-panel rounded-lg py-1 min-w-[100px] z-10"
                  >
                    {formats.map((f) => (
                      <button
                        key={f}
                        onClick={() => { setSelectedFormat(f); setShowFormats(false); }}
                        className={`w-full text-left px-4 py-2 text-sm font-mono hover:bg-white/5 transition-colors ${
                          selectedFormat === f ? 'text-primary' : 'text-foreground'
                        }`}
                      >
                        {f}
                      </button>
                    ))}
                  </motion.div>
                )}
              </div>
            </div>

            {!isInLibrary && (
              <button
                onClick={() => addToLibrary(track)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg ring-1 ring-inset ring-white/10 text-sm font-medium hover:bg-white/5 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Añadir a biblioteca
              </button>
            )}
          </div>
        </div>
      </motion.div>

      {/* Lyrics split view */}
      {(track.lyrics || track.translatedLyrics) && (
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
        >
          <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-6">Letras</h2>
          <div className="grid grid-cols-2 gap-8 glass-panel rounded-lg p-8">
            {/* Original */}
            <div>
              <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-4">Original</p>
              <div className="space-y-2">
                {(track.lyrics || '').split('\n').map((line, i) => (
                  <p key={i} className="text-sm text-foreground/80 leading-relaxed">{line || '\u00A0'}</p>
                ))}
              </div>
            </div>
            {/* Translated */}
            <div>
              <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-4">Traducción</p>
              <div className="space-y-2">
                {(track.translatedLyrics || '').split('\n').map((line, i) => (
                  <p key={i} className="text-sm text-foreground/60 leading-relaxed">{line || '\u00A0'}</p>
                ))}
              </div>
            </div>
          </div>
        </motion.section>
      )}
    </div>
  );
}
