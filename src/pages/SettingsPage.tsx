import { useState, useEffect } from 'react';
import { Settings, Folder, AlertTriangle, Wifi, RefreshCw, CheckCircle2, FolderOpen, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { useMusicStore } from '@/store/musicStore';
import { t } from '@/lib/i18n';
import { Capacitor } from '@capacitor/core';

const isAndroid = Capacitor.getPlatform() === 'android';

export default function SettingsPage() {
  const {
    downloadFolderName, setDownloadFolder, clearDownloadFolder,
    downloadFormat, setDownloadFormat,
    mp3Quality, setMp3Quality,
    downloadWifiOnly, setDownloadWifiOnly,
    appLanguage, setAppLanguage,
    ytDlpVersion, ytDlpUpdateAvailable, ytDlpUpdating,
    setYtDlpVersion, setYtDlpUpdateAvailable, setYtDlpUpdating,
  } = useMusicStore();

  const [updateStatus, setUpdateStatus] = useState<'idle' | 'done' | 'skipped' | 'error'>('idle');

  useEffect(() => {
    if (!isAndroid) return;
    (async () => {
      try {
        const { getYtDlpVersion } = await import('@/lib/ytdlpBridge');
        const version = await getYtDlpVersion();
        setYtDlpVersion(version);
        // Versión en formato YYYY.MM.DD — si tiene más de 60 días sugerimos actualizar
        const match = version.match(/(\d{4})\.(\d{2})\.(\d{2})/);
        if (match) {
          const versionDate = new Date(`${match[1]}-${match[2]}-${match[3]}`);
          const ageDays = (Date.now() - versionDate.getTime()) / 86_400_000;
          setYtDlpUpdateAvailable(ageDays > 60);
        }
      } catch { /* silencioso */ }
    })();
  }, [setYtDlpVersion, setYtDlpUpdateAvailable]);

  const handleUpdate = async () => {
    if (ytDlpUpdating) return;
    setYtDlpUpdating(true);
    setUpdateStatus('idle');
    try {
      const { updateYtDlp, getYtDlpVersion } = await import('@/lib/ytdlpBridge');
      const status = await updateYtDlp();
      const newVersion = await getYtDlpVersion();
      setYtDlpVersion(newVersion);
      setYtDlpUpdateAvailable(false);
      setUpdateStatus(status === 'DONE' ? 'done' : 'skipped');
    } catch {
      setUpdateStatus('error');
    } finally {
      setYtDlpUpdating(false);
    }
  };

  const handlePickFolder = async () => {
    if (!('showDirectoryPicker' in window)) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
      setDownloadFolder(handle, handle.name);
    } catch {
      // Usuario canceló — no hacer nada
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="px-4 sm:px-8 py-4 sm:py-10 max-w-3xl mx-auto"
    >
      <h1 className="text-lg sm:text-2xl font-semibold tracking-tighter mb-1 sm:mb-2">Ajustes</h1>
      <p className="text-xs sm:text-sm text-[#666660] mb-6 sm:mb-8">Configuración de la app</p>

      {/* Formato de descarga */}
      <section className="mb-8">
        <h2 className="text-xs font-mono uppercase tracking-widest text-[#666660] mb-3">{t('downloadFormat')}</h2>
        <div className="flex gap-4 items-center p-4 rounded-xl bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)]">
            <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="format" value="mp3" checked={downloadFormat === 'mp3'} onChange={() => setDownloadFormat('mp3')} />
            <span className="text-sm">{t('mp3')}</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="format" value="aac" checked={downloadFormat === 'aac'} onChange={() => setDownloadFormat('aac')} />
            <span className="text-sm">{t('aac')}</span>
          </label>
        </div>
      </section>

      {/* Calidad MP3 */}
      {downloadFormat === 'mp3' && (
        <section className="mb-8">
          <h2 className="text-xs font-mono uppercase tracking-widest text-[#666660] mb-3">{t('mp3Quality')}</h2>
          <div className="flex gap-4 items-center p-4 rounded-xl bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)]">
              <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="mp3q" value="alta" checked={mp3Quality === 'alta'} onChange={() => setMp3Quality('alta')} />
              <span className="text-sm">Alta (192kbps)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="mp3q" value="media" checked={mp3Quality === 'media'} onChange={() => setMp3Quality('media')} />
              <span className="text-sm">Media (128kbps)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="mp3q" value="baja" checked={mp3Quality === 'baja'} onChange={() => setMp3Quality('baja')} />
              <span className="text-sm">Baja (96kbps)</span>
            </label>
          </div>
        </section>
      )}

      {/* Solo WiFi */}
      <section className="mb-8">
        <h2 className="text-xs font-mono uppercase tracking-widest text-[#666660] mb-3">{t('wifiOnly')}</h2>
        <div className="flex items-center gap-3 p-4 rounded-xl bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)]">
          <Wifi className="w-5 h-5 text-[#C8F04B] flex-shrink-0" />
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={downloadWifiOnly} onChange={e => setDownloadWifiOnly(e.target.checked)} />
            <span className="text-sm">Permitir descargas solo cuando haya conexión WiFi</span>
          </label>
        </div>
      </section>

      {/* Selector de idioma */}
      <section className="mb-8">
        <h2 className="text-xs font-mono uppercase tracking-widest text-[#666660] mb-3">{t('appLanguage')}</h2>
        <div className="flex gap-4 items-center p-4 rounded-xl bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)]">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="lang" value="es" checked={appLanguage === 'es'} onChange={() => setAppLanguage('es')} />
            <span className="text-sm">Español</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="lang" value="en" checked={appLanguage === 'en'} onChange={() => setAppLanguage('en')} />
            <span className="text-sm">Inglés</span>
          </label>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-xs font-mono uppercase tracking-widest text-[#666660] mb-3">Carpeta de descargas</h2>

        <div className="p-4 rounded-xl bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)]">
          {isAndroid ? (
            <div className="flex items-center gap-3">
              <Folder className="w-5 h-5 text-[#C8F04B] flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-[#F5F5F0] font-medium">MHL Music/</p>
                <p className="text-xs text-[#666660] mt-0.5">
                  Las descargas se guardan automáticamente en la carpeta Descargas/MHL Music del dispositivo.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <Folder className="w-5 h-5 text-[#C8F04B] flex-shrink-0" />
              <div className="flex-1 min-w-0">
                {downloadFolderName ? (
                  <>
                    <p className="text-sm text-[#F5F5F0] font-medium truncate">{downloadFolderName}/</p>
                    <p className="text-xs text-[#666660] mt-0.5">Las canciones se guardarán en esta carpeta.</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-[#F5F5F0] font-medium">Sin carpeta seleccionada</p>
                    <p className="text-xs text-[#666660] mt-0.5">
                      {'showDirectoryPicker' in window
                        ? 'Elige una carpeta para guardar las descargas directamente.'
                        : 'Tu navegador no soporta selector de carpeta. Las canciones se descargarán al lugar por defecto.'}
                    </p>
                  </>
                )}
              </div>
              {'showDirectoryPicker' in window && (
                <div className="flex items-center gap-2 flex-shrink-0">
                  {downloadFolderName && (
                    <button
                      onClick={clearDownloadFolder}
                      className="p-1.5 rounded-md text-[#666660] hover:text-[#F5F5F0] hover:bg-[rgba(255,255,255,0.06)] transition-colors"
                      title="Quitar carpeta"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={handlePickFolder}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-[#C8F04B] text-[#18181A] hover:bg-[#d4f56a] transition-colors"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    {downloadFolderName ? 'Cambiar' : 'Elegir carpeta'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* yt-dlp — solo visible en Android, con diseño coherente */}
      {isAndroid && (
        <section className="mb-8">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-[#8A8A8A] mb-2 flex items-center gap-2">
            Motor de descarga
            {ytDlpUpdateAvailable && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#C8F04B]/20 text-[#C8F04B] border border-[#C8F04B]/30">
                ¡Actualización disponible!
              </span>
            )}
          </h2>
          <div className="p-4 rounded-lg bg-[#18181A] border border-[#232325] flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <div className={`rounded-full p-2 ${ytDlpUpdateAvailable ? 'bg-[#C8F04B]/10' : 'bg-[#232325]'}`}>
                <RefreshCw className={`w-6 h-6 ${ytDlpUpdateAvailable ? 'text-[#C8F04B]' : 'text-[#8A8A8A]'}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-base font-semibold text-[#F5F5F0]">yt-dlp</span>
                  <span className="text-xs font-mono text-[#8A8A8A]">{ytDlpVersion ?? 'cargando…'}</span>
                </div>
                <p className="text-xs text-[#8A8A8A] mt-0.5">Plugin encargado de las descargas de YouTube y otras fuentes.</p>
                {ytDlpUpdateAvailable && (
                  <p className="text-xs text-[#C8F04B] mt-1 font-medium">
                    Versión desactualizada — se recomienda actualizar para evitar errores de descarga.
                  </p>
                )}
                {updateStatus === 'done' && (
                  <p className="text-xs text-[#C8F04B] mt-1 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Actualizado correctamente
                  </p>
                )}
                {updateStatus === 'skipped' && (
                  <p className="text-xs text-[#8A8A8A] mt-1">Ya tienes la última versión</p>
                )}
                {updateStatus === 'error' && (
                  <p className="text-xs text-red-400 mt-1">Error al actualizar — comprueba tu conexión</p>
                )}
              </div>
              <button
                onClick={handleUpdate}
                disabled={ytDlpUpdating}
                className={`ml-2 flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-semibold transition-colors shadow-sm ${
                  ytDlpUpdateAvailable
                    ? 'bg-[#C8F04B] text-[#18181A] hover:bg-[#d4f56a]'
                    : 'bg-[#232325] text-[#8A8A8A] hover:text-[#F5F5F0]'
                } disabled:opacity-50 disabled:cursor-wait`}
              >
                <RefreshCw className={`w-4 h-4 ${ytDlpUpdating ? 'animate-spin' : ''}`} />
                {ytDlpUpdating ? 'Actualizando…' : 'Actualizar'}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* About Section */}
      <section className="mb-8">
        <h2 className="text-xs font-mono uppercase tracking-widest text-[#666660] mb-3">Acerca de</h2>
        <div className="p-4 rounded-xl bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)]">
          <div className="flex items-center gap-3">
            <Settings className="w-5 h-5 text-[#C8F04B] flex-shrink-0" />
            <div>
              <p className="text-sm text-[#F5F5F0] font-medium">MHL Music</p>
              <p className="text-xs text-[#666660] mt-0.5">Tu música. Sin límites.</p>
              <a
                href="https://paul-dev.vercel.app"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs mt-2 block"
                style={{ color: "rgba(102,102,96,0.6)" }}
              >
                Desarrollado por Paul · paul-dev.vercel.app
              </a>
            </div>
          </div>
        </div>
      </section>
    </motion.div>
  );
}
