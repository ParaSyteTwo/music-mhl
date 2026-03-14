import { Settings as SettingsIcon } from 'lucide-react';

export default function SettingsPage() {
  return (
    <div className="px-8 py-10">
      <h1 className="text-2xl font-semibold tracking-tighter mb-2">Settings</h1>
      <p className="text-sm text-muted-foreground mb-8">Configura tu experiencia MHL</p>

      <div className="space-y-6 max-w-lg">
        {/* Audio quality */}
        <div className="glass-panel rounded-lg p-5">
          <h3 className="text-sm font-medium mb-3">Calidad de audio</h3>
          <div className="space-y-2">
            {['Auto', 'Alta (FLAC)', 'Media (320kbps)', 'Baja (128kbps)'].map((q) => (
              <label key={q} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 cursor-pointer transition-colors">
                <input
                  type="radio"
                  name="quality"
                  defaultChecked={q === 'Auto'}
                  className="w-3.5 h-3.5 accent-primary"
                />
                <span className="text-sm">{q}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Download path */}
        <div className="glass-panel rounded-lg p-5">
          <h3 className="text-sm font-medium mb-3">Formato de nombre</h3>
          <div className="flex items-center gap-2 px-3 py-2 bg-secondary/50 rounded-lg">
            <code className="text-sm font-mono text-primary">Song - Artist.ext</code>
          </div>
        </div>

        {/* Storage */}
        <div className="glass-panel rounded-lg p-5">
          <h3 className="text-sm font-medium mb-3">Almacenamiento local</h3>
          <p className="text-xs text-muted-foreground mb-3">
            Las canciones se guardan en el almacenamiento del navegador para reproducción offline.
          </p>
          <div className="h-2 bg-muted/30 rounded-full overflow-hidden">
            <div className="h-full bg-primary/60 rounded-full" style={{ width: '23%' }} />
          </div>
          <p className="text-xs text-muted-foreground mt-2 timer-font">45.2MB / 200MB usado</p>
        </div>

        {/* APIs */}
        <div className="glass-panel rounded-lg p-5">
          <h3 className="text-sm font-medium mb-3">APIs externas</h3>
          <p className="text-xs text-muted-foreground mb-3">
            Conecta servicios externos para metadatos, letras y audio.
          </p>
          <div className="space-y-2">
            {[
              { name: 'MusicBrainz', desc: 'Metadatos', status: 'Disponible' },
              { name: 'Genius', desc: 'Letras', status: 'No conectado' },
              { name: 'LRCLib', desc: 'Letras sincronizadas', status: 'No conectado' },
            ].map((api) => (
              <div key={api.name} className="flex items-center justify-between px-3 py-2 rounded-lg bg-secondary/30">
                <div>
                  <p className="text-sm font-medium">{api.name}</p>
                  <p className="text-xs text-muted-foreground">{api.desc}</p>
                </div>
                <span className={`text-xs font-mono ${api.status === 'Disponible' ? 'text-primary' : 'text-muted-foreground'}`}>
                  {api.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
