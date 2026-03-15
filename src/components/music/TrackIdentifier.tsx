import React, { useState, useEffect } from "react";

interface AudDResult {
  status: string;
  result?: {
    artist?: string;
    title?: string;
    album?: string;
    label?: string;
    release_date?: string;
    song_link?: string;
    [key: string]: any;
  };
  error?: string;
}

const TrackIdentifier: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AudDResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [apiKeyMissing, setApiKeyMissing] = useState(false);

  useEffect(() => {
    const key = import.meta.env.VITE_AUDD_API_KEY;
    if (!key) {
      setApiKeyMissing(true);
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files?.[0] || null);
    setResult(null);
    setError(null);
  };

  const handleIdentify = async () => {
    if (!file) return;
    
    const AUDD_API_KEY = import.meta.env.VITE_AUDD_API_KEY;
    if (!AUDD_API_KEY) {
      setError("Clave de API de AudD no configurada. Agrega VITE_AUDD_API_KEY a .env");
      return;
    }

    setLoading(true);
    setResult(null);
    setError(null);
    
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("api_token", AUDD_API_KEY);
      formData.append("return", "apple_music,spotify,deezer");

      const response = await fetch("https://api.audd.io/", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data: AudDResult = await response.json();
      setResult(data);

      if (data.status !== "success") {
        setError(data.error || "No se pudo identificar la canción");
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
      <h2 className="text-base sm:text-lg font-semibold mb-4">Identificar Canción (AudD)</h2>
      
      {apiKeyMissing && (
        <div className="mb-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-sm text-yellow-600 dark:text-yellow-400">
          ⚠️ Falta configurar VITE_AUDD_API_KEY en tu archivo .env
        </div>
      )}
      
      <div className="space-y-3">
        <input
          type="file"
          accept="audio/*"
          onChange={handleFileChange}
          disabled={apiKeyMissing}
          className="block w-full text-sm text-muted-foreground
            file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0
            file:text-sm file:font-medium file:bg-primary/10 file:text-primary
            hover:file:bg-primary/20 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <button
          onClick={handleIdentify}
          disabled={!file || loading || apiKeyMissing}
          className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium text-sm transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Identificando..." : "Identificar"}
        </button>
        {error && <div className="text-xs sm:text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded p-2">{error}</div>}
        {result && result.status === "success" && result.result && (
          <div className="mt-4 p-3 rounded-lg bg-primary/5 border border-primary/20 space-y-2">
            <div className="text-sm"><span className="font-medium text-foreground">Título:</span> <span className="text-muted-foreground">{result.result.title || "—"}</span></div>
            <div className="text-sm"><span className="font-medium text-foreground">Artista:</span> <span className="text-muted-foreground">{result.result.artist || "—"}</span></div>
            {result.result.album && <div className="text-sm"><span className="font-medium text-foreground">Álbum:</span> <span className="text-muted-foreground">{result.result.album}</span></div>}
            {result.result.release_date && <div className="text-sm"><span className="font-medium text-foreground">Lanzamiento:</span> <span className="text-muted-foreground">{result.result.release_date}</span></div>}
            {result.result.song_link && (
              <div>
                <a
                  href={result.result.song_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline font-medium"
                >
                  → Escuchar en AudD
                </a>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default TrackIdentifier;
