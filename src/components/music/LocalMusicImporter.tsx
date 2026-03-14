import { useState, useRef } from 'react';
import { Upload, Music } from 'lucide-react';
import { useMusicStore } from '@/store/musicStore';
import { Track } from '@/types/music';
import { motion } from 'framer-motion';
import { IAudioMetadata, parseBlob } from 'music-metadata-browser';

export function LocalMusicImporter() {
  const { addToLibrary } = useMusicStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [totalFiles, setTotalFiles] = useState(0);

  const getAudioDuration = async (file: File): Promise<number> => {
    return new Promise((resolve) => {
      const audio = new Audio();
      const url = URL.createObjectURL(file);
      audio.addEventListener(
        'loadedmetadata',
        () => {
          URL.revokeObjectURL(url);
          resolve(audio.duration);
        },
        { once: true }
      );
      audio.addEventListener(
        'error',
        () => {
          URL.revokeObjectURL(url);
          resolve(0);
        },
        { once: true }
      );
      audio.src = url;
    });
  };

  const extractMetadata = async (file: File): Promise<Partial<Track>> => {
    try {
      const metadata: IAudioMetadata = await parseBlob(file);
      const common = metadata.common;

      return {
        title: common?.title || file.name.replace(/\.[^/.]+$/, ''),
        artist: common?.artist || 'Desconocido',
        album: common?.album || 'Sin álbum',
        cover:
          common?.picture?.[0]?.data
            ? `data:${common.picture[0].type};base64,${common.picture[0].data.toString('base64')}`
            : 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=100&h=100&fit=crop',
      };
    } catch {
      const fileName = file.name.replace(/\.[^/.]+$/, '');
      return {
        title: fileName,
        artist: 'Desconocido',
        album: 'Sin álbum',
        cover: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=100&h=100&fit=crop',
      };
    }
  };

  const processFiles = async (files: File[]) => {
    setIsProcessing(true);
    setTotalFiles(files.length);
    setProgress(0);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      // Validar que sea audio
      if (!file.type.startsWith('audio/')) {
        console.warn(`Saltando ${file.name} - no es un archivo de audio`);
        setProgress(i + 1);
        continue;
      }

      try {
        // Obtener metadata
        const metadata = await extractMetadata(file);

        // Obtener duración
        const duration = await getAudioDuration(file);

        // Crear blob URL para reproducción
        const url = URL.createObjectURL(file);

        // Crear track
        const track: Track = {
          id: `local-${Date.now()}-${Math.random()}`,
          title: metadata.title || 'Desconocido',
          artist: metadata.artist || 'Desconocido',
          album: metadata.album || 'Sin álbum',
          cover: metadata.cover || '',
          duration: Math.round(duration),
          url,
          isLocal: true,
          localFile: file,
          isDownloaded: true,
        };

        // Agregar a biblioteca
        addToLibrary(track);

        setProgress(i + 1);
      } catch (error) {
        console.error(`Error procesando ${file.name}:`, error);
        setProgress(i + 1);
      }
    }

    setIsProcessing(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    processFiles(files);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    processFiles(files);
  };

  return (
    <div className="w-full">
      {/* Drag & Drop Area */}
      <motion.div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative rounded-xl border-2 border-dashed transition-colors p-8 mb-6 ${
          isDragging
            ? 'border-primary bg-primary/5'
            : 'border-muted-foreground/30 hover:border-muted-foreground/50 hover:bg-muted/30'
        }`}
      >
        <div className="flex flex-col items-center justify-center gap-3">
          <div className={`rounded-full p-3 ${isDragging ? 'bg-primary/20' : 'bg-muted'}`}>
            <Upload className={`w-6 h-6 ${isDragging ? 'text-primary' : 'text-muted-foreground'}`} />
          </div>
          <div className="text-center">
            <p className="font-medium">Arrastra archivos de audio aquí</p>
            <p className="text-sm text-muted-foreground">o utiliza el botón para seleccionar</p>
          </div>
          <button
            onClick={() => inputRef.current?.click()}
            disabled={isProcessing}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            Seleccionar archivos
          </button>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="audio/*"
            onChange={handleFileSelect}
            disabled={isProcessing}
            className="hidden"
          />
        </div>
      </motion.div>

      {/* Progress */}
      {isProcessing && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 p-4 rounded-lg bg-primary/10 border border-primary/20"
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium">
              Analizando {Math.min(progress, totalFiles)} / {totalFiles} archivos...
            </p>
            <span className="text-xs text-muted-foreground">
              {Math.round((progress / totalFiles) * 100)}%
            </span>
          </div>
          <div className="w-full bg-primary/20 rounded-full h-2">
            <motion.div
              className="bg-primary h-full rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${(progress / totalFiles) * 100}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </motion.div>
      )}

      {/* Empty State */}
      {!isProcessing && (
        <div className="text-center py-6">
          <Music className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-50" />
          <p className="text-sm text-muted-foreground">
            Importa canciones para crear una biblioteca local
          </p>
        </div>
      )}
    </div>
  );
}
