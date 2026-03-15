import React, { useState } from "react";
import { identifyTrackWithShazam, ShazamIdentifyResult } from "@/lib/api/musicApi";

const TrackIdentifier: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ShazamIdentifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files?.[0] || null);
    setResult(null);
    setError(null);
  };

  const handleIdentify = async () => {
    if (!file) return;

    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const apiKey = import.meta.env.VITE_RAPIDAPI_KEY;
      if (!apiKey) {
        setError("Clave de API de RapidAPI no configurada. Agrega RAPIDAPI_KEY a .env");
        setLoading(false);
        return;
      }

      const data = await identifyTrackWithShazam(file);
      
      if (data) {
        setResult(data);
      } else {
        setError("No se pudo identificar la canción. Intenta con otro archivo de audio.");
      }
    } catch (err) {
      console.error("Error en identificación:", err);
      setError(`Error: ${err instanceof Error ? err.message : "Error desconocido"}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-panel rounded-lg p-4 sm:p-6 border border-white/10 mb-6">
      <h2 className="text-base sm:text-lg font-semibold mb-4">Identificar Canción (Shazam)</h2>

      <div className="space-y-3">
        <input
          type="file"
          accept="audio/*"
          onChange={handleFileChange}
          className="block w-full text-sm text-muted-foreground
            file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0
            file:text-sm file:font-medium file:bg-primary/10 file:text-primary
            hover:file:bg-primary/20 cursor-pointer"
        />
        <button
          onClick={handleIdentify}
          disabled={!file || loading}
          className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium text-sm transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Identificando..." : "Identificar"}
        </button>
        {error && <div className="text-xs sm:text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded p-2">{error}</div>}
        {result && (
          <div className="mt-4 p-3 rounded-lg bg-primary/5 border border-primary/20 space-y-2">
            <div className="text-sm"><span className="font-medium text-foreground">Título:</span> <span className="text-muted-foreground">{result.title || "—"}</span></div>
            <div className="text-sm"><span className="font-medium text-foreground">Artista:</span> <span className="text-muted-foreground">{result.artist || "—"}</span></div>
            {result.album && <div className="text-sm"><span className="font-medium text-foreground">Álbum:</span> <span className="text-muted-foreground">{result.album}</span></div>}
            {result.releaseDate && <div className="text-sm"><span className="font-medium text-foreground">Lanzamiento:</span> <span className="text-muted-foreground">{result.releaseDate}</span></div>}
            {result.genres && result.genres.length > 0 && (
              <div className="text-sm"><span className="font-medium text-foreground">Géneros:</span> <span className="text-muted-foreground">{result.genres.join(", ")}</span></div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default TrackIdentifier;
