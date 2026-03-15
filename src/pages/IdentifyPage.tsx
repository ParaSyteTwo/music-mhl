import { useState } from 'react';
import { Loader, AlertCircle, CheckCircle, Music, Grid3x3, List, AudioWaveform, Upload } from 'lucide-react';
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
  const [dragActive, setDragActive] = useState(false);

  const { addToLibrary } = useMusicStore();
  const AUDD_API_KEY = import.meta.env.VITE_AUDD_API_KEY;

  const handleFileSelect = (selectedFile: File | null) => {
    if (!selectedFile) return;

    if (!selectedFile.type.startsWith('audio/')) {
      setError('Por favor selecciona un archivo de audio válido');
      return;
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      setError('El archivo es demasiado grande (máximo 10MB)');
      return;
    }

    setFile(selectedFile);
    setError(null);
  };

  const handleDrag = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      handleFileSelect(droppedFile);
    }
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
        cover: '',
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
      {/* Header */}
      <div className="mb-12 sm:mb-16 max-w-2xl">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-[#F5F5F0] font-[family-name:Syne] mb-3">
          Identify
        </h1>
        <p className="text-sm sm:text-base text-[#666660]">
          Drop a track. Get the truth.
        </p>
      </div>

      {!identifiedTrack ? (
        <div className="max-w-lg mx-0">
          {/* Drop zone */}
          <div
            className={`relative border-2 border-dashed rounded-[20px] p-8 sm:p-12 transition-all duration-200 cursor-pointer ${
              dragActive
                ? 'border-[#C8F04B] bg-[rgba(200,240,75,0.08)]'
                : 'border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.02)] hover:border-[rgba(255,255,255,0.2)]'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => document.getElementById('file-input')?.click()}
          >
            <input
              id="file-input"
              type="file"
              accept="audio/*"
              onChange={(e) => handleFileSelect(e.target.files?.[0] || null)}
              disabled={loading}
              className="hidden"
            />

            {/* Icon and text */}
            <div className="flex flex-col items-center justify-center gap-4">
              <div className={`transition-colors duration-200 ${dragActive ? 'text-[#C8F04B]' : 'text-[#333330]'}`}>
                <AudioWaveform size={48} />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-[#F5F5F0] mb-1">
                  Arrastra un archivo de audio
                </p>
                <p className="text-xs text-[#666660]">
                  o haz clic para elegir uno
                </p>
              </div>
            </div>

            {/* File info */}
            {file && (
              <div className="mt-4 pt-4 border-t border-[rgba(255,255,255,0.06)]">
                <p className="text-xs text-[#C8F04B] font-mono">
                  ✓ {file.name} ({(file.size / 1024 / 1024).toFixed(2)}MB)
                </p>
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="mt-6 flex gap-3 p-4 bg-[rgba(255,77,109,0.1)] border border-[#FF4D6D]/30 rounded-lg text-sm text-[#FF4D6D]">
              <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Identify button */}
          <button
            onClick={handleIdentify}
            disabled={!file || loading}
            className="w-full mt-6 py-3 bg-[#C8F04B] hover:bg-[#D4FF57] disabled:bg-[#333330] text-[#080808] disabled:text-[#666660] rounded-lg font-semibold transition-all duration-200 flex items-center justify-center gap-2"
          >
            {loading && <Loader size={18} className="animate-spin" />}
            {loading ? 'Escuchando...' : 'Identificar'}
          </button>
        </div>
      ) : (
        <div className="max-w-4xl mx-0 space-y-8">
          {/* Success */}
          <div className="flex gap-3 p-4 bg-[rgba(200,240,75,0.1)] border border-[#C8F04B]/30 rounded-lg text-sm text-[#C8F04B]">
            <CheckCircle size={18} className="flex-shrink-0 mt-0.5" />
            <span>¡Canción identificada exitosamente!</span>
          </div>

          {/* Track card */}
          <div className="bg-[#0f0f0f] border border-[rgba(255,255,255,0.06)] rounded-[16px] p-6 sm:p-8">
            <div className="flex gap-6">
              {/* Cover */}
              <div className="w-24 h-24 rounded-lg bg-gradient-to-br from-[#C8F04B]/30 to-[#8BC34A]/10 flex-shrink-0">
                {identifiedTrack.cover && (
                  <img src={identifiedTrack.cover} alt={identifiedTrack.title} className="w-full h-full object-cover rounded-lg" />
                )}
              </div>

              {/* Info */}
              <div className="flex-1">
                <h2 className="text-xl sm:text-2xl font-bold text-[#F5F5F0] font-[family-name:Syne] mb-2">
                  {identifiedTrack.title}
                </h2>
                <p className="text-sm text-[#666660] mb-4">{identifiedTrack.artist}</p>
                <p className="text-sm text-[#333330]">{identifiedTrack.album}</p>
              </div>
            </div>

            {/* Buttons */}
            <div className="flex gap-3 mt-6">
              <button
                onClick={handleNewSearch}
                className="flex-1 py-2 bg-[#C8F04B] hover:bg-[#D4FF57] text-[#080808] rounded-lg font-semibold transition-colors"
              >
                Identificar otra
              </button>
            </div>
          </div>

          {/* Download options header */}
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-[#F5F5F0]">Opciones de descarga</h3>
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

          {/* Track display */}
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
