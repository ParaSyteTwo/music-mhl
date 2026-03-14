import { useState } from 'react';
import { Waveform, CheckCircle, AlertCircle } from 'lucide-react';
import { useMusicStore } from '@/store/musicStore';
import { Track } from '@/types/music';
import { searchDeezer } from '@/lib/api/musicApi';
import { writeID3Tags } from '@/lib/id3Writer';
import { motion } from 'framer-motion';

interface TrackIdentifierProps {
  track: Track;
}

type IdentifierState = 'idle' | 'listening' | 'identified' | 'updating' | 'success' | 'error';

export function TrackIdentifier({ track }: TrackIdentifierProps) {
  const { addToLibrary } = useMusicStore();
  const [state, setState] = useState<IdentifierState>('idle');
  const [result, setResult] = useState<string | null>(null);

  if (!track.isLocal || !track.localFile) {
    return null;
  }

  const extractAudioSegment = async (file: File, duration: number = 20): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        const arrayBuffer = e.target?.result as ArrayBuffer;
        if (!arrayBuffer) {
          reject(new Error('Failed to read file'));
          return;
        }

        // Take first 20 seconds worth of bytes (rough estimate)
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        audioContext.decodeAudioData(
          arrayBuffer,
          (audioBuffer) => {
            // Get first 20 seconds
            const sampleRate = audioBuffer.sampleRate;
            const channelData = audioBuffer.getChannelData(0);
            const endSample = Math.min(sampleRate * duration, channelData.length);

            // Convert to WAV format for AudD
            const wav = encodeWAV(channelData.slice(0, endSample), sampleRate);
            const base64 = btoa(String.fromCharCode.apply(null, Array.from(wav) as any));
            resolve(base64);
          },
          () => reject(new Error('Failed to decode audio'))
        );
      };

      reader.readAsArrayBuffer(file);
    });
  };

  const encodeWAV = (floatSamples: Float32Array, sampleRate: number): Uint8Array => {
    const frameLength = floatSamples.length;
    const channelData = [floatSamples];

    // WAV header
    const wav = new Uint8Array(44 + frameLength * 2);
    const view = new DataView(wav.buffer);

    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + frameLength * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, frameLength * 2, true);

    let offset = 44;
    for (let i = 0; i < frameLength; i++) {
      const sample = Math.max(-1, Math.min(1, floatSamples[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }

    return wav;
  };

  const identifyTrack = async () => {
    try {
      setState('listening');

      // Extract audio segment
      const audioBase64 = await extractAudioSegment(track.localFile, 20);

      // Call AudD API
      const apiKey = import.meta.env.VITE_AUDD_API_KEY;
      if (!apiKey) {
        setResult('API key no configurada');
        setState('error');
        return;
      }

      const formData = new FormData();
      formData.append('api_token', apiKey);
      formData.append('audio', audioBase64);

      const response = await fetch('https://api.audd.io/', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!data.result) {
        setResult('No se pudo identificar la canción');
        setState('error');
        return;
      }

      const identified = data.result;
      setState('identified');
      setResult(`${identified.title} - ${identified.artist}`);

      // Search in Deezer for cover and full metadata
      setState('updating');

      let coverUrl = track.cover;
      let deezerId = track.deezerId;

      try {
        const deezerResults = await searchDeezer(`${identified.title} ${identified.artist}`);
        if (deezerResults.length > 0) {
          const deezerTrack = deezerResults[0];
          coverUrl = deezerTrack.cover || coverUrl;
          deezerId = deezerTrack.deezerId;
        }
      } catch (err) {
        console.warn('Failed to search Deezer:', err);
      }

      // Create updated track
      const updatedTrack: Track = {
        ...track,
        title: identified.title,
        artist: identified.artist,
        album: identified.album || track.album,
        cover: coverUrl,
        deezerId,
      };

      // Write ID3 tags
      try {
        if (track.localFile) {
          const updatedFile = await writeID3Tags(track.localFile, {
            title: identified.title,
            artist: identified.artist,
            album: identified.album || track.album,
            cover: coverUrl,
          });

          // Create new blob URL
          const newUrl = URL.createObjectURL(updatedFile);
          updatedTrack.url = newUrl;
          updatedTrack.localFile = updatedFile;
        }
      } catch (err) {
        console.warn('Failed to write ID3 tags:', err);
      }

      // Update library
      addToLibrary(updatedTrack);

      setState('success');
      setTimeout(() => setState('idle'), 3000);
    } catch (error) {
      console.error('Identification error:', error);
      setResult('Error en la identificación');
      setState('error');
      setTimeout(() => setState('idle'), 3000);
    }
  };

  return (
    <motion.button
      onClick={identifyTrack}
      disabled={state !== 'idle'}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${
        state === 'idle'
          ? 'text-blue-500 hover:bg-blue-500/10'
          : 'opacity-60 cursor-not-allowed'
      }`}
      whileHover={{ scale: state === 'idle' ? 1.05 : 1 }}
      whileTap={{ scale: state === 'idle' ? 0.95 : 1 }}
      title={result || 'Identificar canción con Shazam'}
    >
      {state === 'listening' && (
        <>
          <motion.div animate={{ scale: [0.8, 1, 0.8] }} transition={{ duration: 1, repeat: Infinity }}>
            <Waveform className="w-3.5 h-3.5" />
          </motion.div>
          <span>Escuchando...</span>
        </>
      )}
      {state === 'identified' && (
        <>
          <CheckCircle className="w-3.5 h-3.5 text-green-500" />
          <span className="text-green-600">Identificado</span>
        </>
      )}
      {state === 'updating' && (
        <>
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity }}>
            <Waveform className="w-3.5 h-3.5" />
          </motion.div>
          <span>Actualizando...</span>
        </>
      )}
      {state === 'success' && (
        <>
          <CheckCircle className="w-3.5 h-3.5 text-green-500" />
          <span className="text-green-600">✓ Actualizado</span>
        </>
      )}
      {state === 'error' && (
        <>
          <AlertCircle className="w-3.5 h-3.5 text-red-500" />
          <span className="text-red-600">Error</span>
        </>
      )}
      {state === 'idle' && (
        <>
          <Waveform className="w-3.5 h-3.5" />
          <span>Identificar</span>
        </>
      )}
    </motion.button>
  );
}
