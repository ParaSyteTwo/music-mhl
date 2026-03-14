import { useMusicStore, DownloadQuality, FileNameFormat } from '@/store/musicStore';
import { CheckCircle2 } from 'lucide-react';

const qualities: { value: DownloadQuality; label: string; desc: string }[] = [
  { value: 'auto', label: 'Auto', desc: 'Mejor calidad disponible' },
  { value: 'high', label: 'Alta (320kbps)', desc: 'Mayor tamaño de archivo' },
  { value: 'medium', label: 'Media (192kbps)', desc: 'Balance calidad/tamaño' },
  { value: 'low', label: 'Baja (128kbps)', desc: 'Menor tamaño de archivo' },
];

const nameFormats: { value: FileNameFormat; label: string; example: string }[] = [
  { value: 'title-artist', label: 'Título - Artista', example: 'Despacito - Luis Fonsi.mp3' },
  { value: 'artist-title', label: 'Artista - Título', example: 'Luis Fonsi - Despacito.mp3' },
  { value: 'title', label: 'Solo título', example: 'Despacito.mp3' },
];

const apis = [
  { name: 'Deezer', desc: 'Búsqueda y previews 30s', status: true },
  { name: 'YouTube MP3', desc: 'Audio completo via RapidAPI', status: true },
  { name: 'LRCLib', desc: 'Letras sincronizadas', status: true },
  { name: 'MyMemory', desc: 'Traducción de letras', status: true },
];

export default function SettingsPage() {
  const { settings, updateSettings, library, downloads, playlists } = useMusicStore();

  return (
    <div className="px-4 sm:px-8 py-6 sm:py-10">
      <h1 className="text-xl sm:text-2xl font-semibold tracking-tighter mb-2">Settings</h1>
      <p className="text-xs sm:text-sm text-muted-foreground mb-6 sm:mb-8">Configura tu experiencia MHL</p>

      <div className="space-y-4 sm:space-y-6 max-w-lg">
        {/* Audio quality */}
        <div className="glass-panel rounded-lg p-3 sm:p-5">
          <h3 className="text-xs sm:text-sm font-medium mb-2 sm:mb-3">Calidad de descarga</h3>
          <div className="space-y-1">
            {qualities.map((q) => (
              <label
                key={q.value}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                  settings.downloadQuality === q.value ? 'bg-primary/10' : 'hover:bg-white/5'
                }`}
              >
                <input
                  type="radio"
                  name="quality"
                  checked={settings.downloadQuality === q.value}
                  onChange={() => updateSettings({ downloadQuality: q.value })}
                  className="w-3.5 h-3.5 accent-primary"
                />
                <div>
                  <span className="text-sm font-medium">{q.label}</span>
                  <p className="text-xs text-muted-foreground">{q.desc}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* File name format */}
        <div className="glass-panel rounded-lg p-5">
          <h3 className="text-sm font-medium mb-3">Formato de nombre</h3>
          <div className="space-y-1">
            {nameFormats.map((f) => (
              <label
                key={f.value}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                  settings.fileNameFormat === f.value ? 'bg-primary/10' : 'hover:bg-white/5'
                }`}
              >
                <input
                  type="radio"
                  name="nameFormat"
                  checked={settings.fileNameFormat === f.value}
                  onChange={() => updateSettings({ fileNameFormat: f.value })}
                  className="w-3.5 h-3.5 accent-primary"
                />
                <div>
                  <span className="text-sm font-medium">{f.label}</span>
                  <code className="block text-xs text-muted-foreground font-mono mt-0.5">{f.example}</code>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div className="glass-panel rounded-lg p-5">
          <h3 className="text-sm font-medium mb-3">Estadísticas</h3>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-2xl font-semibold tracking-tighter timer-font">{library.length}</p>
              <p className="text-xs text-muted-foreground">En biblioteca</p>
            </div>
            <div>
              <p className="text-2xl font-semibold tracking-tighter timer-font">{playlists.length}</p>
              <p className="text-xs text-muted-foreground">Playlists</p>
            </div>
            <div>
              <p className="text-2xl font-semibold tracking-tighter timer-font">
                {downloads.filter(d => d.status === 'completed').length}
              </p>
              <p className="text-xs text-muted-foreground">Descargas</p>
            </div>
          </div>
        </div>

        {/* APIs */}
        <div className="glass-panel rounded-lg p-5">
          <h3 className="text-sm font-medium mb-3">APIs conectadas</h3>
          <div className="space-y-2">
            {apis.map((api) => (
              <div key={api.name} className="flex items-center justify-between px-3 py-2 rounded-lg bg-secondary/30">
                <div>
                  <p className="text-sm font-medium">{api.name}</p>
                  <p className="text-xs text-muted-foreground">{api.desc}</p>
                </div>
                <CheckCircle2 className={`w-4 h-4 ${api.status ? 'text-primary' : 'text-muted-foreground'}`} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
