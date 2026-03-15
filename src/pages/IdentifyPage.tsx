import { useState } from 'react';
import { Loader, AlertCircle, CheckCircle, Music, Grid3x3, List } from 'lucide-react';
import { useMusicStore } from '../store/musicStore';
import { TrackCard } from '../components/music/TrackCard';
import { TrackRow } from '../components/music/TrackRow';
import type { Track, ViewMode } from '../types/music';

export default function IdentifyPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [identifiedTrack, setIdentifiedTrack] = useState<Track | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  const { addToLibrary } = useMusicStore();
  const AUDD_API_KEY = import.meta.env.VITE_AUDD_API_KEY;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    // Validar que sea un archivo de audio
    if (!selectedFile.type.startsWith('audio/')) {
      setError('Por favor selecciona un archivo de audio válido');
      return;
    }

    // Limitar tamaño (AudD acepta hasta 10MB)
    if (selectedFile.size > 10 * 1024 * 1024) {
      setError('El archivo es demasiado grande (máximo 10MB)');
      return;
    }

    setFile(selectedFile);
    setError(null);
  };

  const handleIdentify = async () => {
    if (!file) {
      setError('Por favor selecciona un archivo');
      return;
    }

    if (!AUDD_API_KEY) {
      setError('API key de AudD no configurada. Por favor define VITE_AUDD_API_KEY');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('api_token', AUDD_API_KEY);
      formData.append('return', 'apple_music,spotify');

      const response = await fetch('https://api.audd.io/', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Error HTTP: ${response.status}`);
      }

      const data = await response.json();

      if (!data.success) {
        setError(
          data.result?.message || 'No se pudo identificar la canción. Intenta con otro archivo.'
        );
        return;
      }

      if (!data.result) {
        setError('No se encontró información de la canción');
        return;
      }

      const { title, artist, album, duration } = data.result;

      if (!title || !artist) {
        setError('La respuesta de AudD no contiene información completa');
        return;
      }

      const identifiedTrackData: Track = {
        id: `audd-${Date.now()}`,
        title,
        artist,
        album: album || 'Desconocido',
        duration: duration || 0,
        url: '', // No tenemos URL desde AudD
        isLocal: false,
        source: 'identified',
      };

      setIdentifiedTrack(identifiedTrackData);
      addToLibrary(identifiedTrackData);
    } catch (err) {
      console.error('Error identificando canción:', err);
      setError(
        err instanceof Error ? err.message : 'Error al conectar con AudD. Intenta de nuevo.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleNewSearch = () => {
    setFile(null);
    setIdentifiedTrack(null);
    setError(null);
  };

  return (
    <div className="px-4 sm:px-8 py-6 sm:py-10">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tighter mb-3 sm:mb-4 flex items-center gap-2">
          <Music size={24} />
          Identificar Canción
        </h1>
      </div>

      {!identifiedTrack ? (
        <div className="max-w-md mx-auto bg-slate-900/50 rounded-lg shadow-lg p-6 sm:p-8 border border-slate-700">
          {/* File Input */}
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">
                Selecciona un archivo de audio
              </label>
              <input
                type="file"
                accept="audio/*"
                onChange={handleFileSelect}
                disabled={loading}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-white disabled:opacity-50 focus:outline-none focus:border-blue-500"
              />
              {file && (
                <p className="text-xs text-slate-400">
                  Seleccionado: {file.name} ({(file.size / 1024 / 1024).toFixed(2)}MB)
                </p>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="flex gap-2 p-3 bg-red-900/20 border border-red-700/50 rounded text-sm text-red-200">
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Button */}
            <button
              onClick={handleIdentify}
              disabled={!file || loading}
              className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 text-white rounded font-medium transition-colors disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading && <Loader size={18} className="animate-spin" />}
              {loading ? 'Identificando...' : 'Identificar'}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Success Alert */}
          <div className="max-w-md mx-auto flex gap-3 p-4 bg-green-900/20 border border-green-700/50 rounded">
            <CheckCircle size={20} className="text-green-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-green-100">
              <p className="font-medium">¡Canción identificada!</p>
            </div>
          </div>

          {/* Track Info */}
          <div className="max-w-md mx-auto bg-slate-900/50 rounded-lg p-4 sm:p-6 border border-slate-700">
            <div className="space-y-3">
              <div>
                <p className="text-xs text-slate-400">Título</p>
                <p className="text-white font-medium text-lg">{identifiedTrack.title}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Artista</p>
                <p className="text-slate-200">{identifiedTrack.artist}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Álbum</p>
                <p className="text-slate-200">{identifiedTrack.album}</p>
              </div>
            </div>

            <button
              onClick={handleNewSearch}
              className="w-full mt-6 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded font-medium transition-colors"
            >
              Identificar otra canción
            </button>
          </div>

          {/* View toggle */}
          <div className="flex items-center justify-between">
            <p className="text-xs sm:text-sm text-muted-foreground">
              Opciones de descarga
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

          {/* Track Display */}
          {viewMode === 'grid' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-4">
              <TrackCard track={identifiedTrack} index={0} />
            </div>
          ) : (
            <div className="space-y-1">
              <TrackRow track={identifiedTrack} index={0} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
