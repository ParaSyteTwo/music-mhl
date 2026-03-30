import { useState, useEffect } from 'react';
import { Settings, Folder, AlertTriangle, Wifi, RefreshCw, CheckCircle2, Download } from 'lucide-react';
import { motion } from 'framer-motion';
import { useMusicStore } from '@/store/musicStore';
import { t } from '@/lib/i18n';
import { Capacitor } from '@capacitor/core';



const isAndroid = Capacitor.getPlatform() === 'android';
const supportsDirectoryPicker = !isAndroid && typeof window !== 'undefined' && 'showDirectoryPicker' in window;

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

  const [updateStatus, setUpdateStatus] = useState<'idle' | 'downloading' | 'done' | 'skipped' | 'error'>('idle');
  const [versionAge, setVersionAge] = useState<number | null>(null);
  const [showAutoUpdate, setShowAutoUpdate] = useState(false);

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
          const ageDays = Math.floor((Date.now() - versionDate.getTime()) / 86_400_000);
          setVersionAge(ageDays);
          if (ageDays > 60) {
            setYtDlpUpdateAvailable(true);
            setShowAutoUpdate(true);
          }
        }
      } catch { /* silencioso */ }
    })();
  }, [setYtDlpVersion, setYtDlpUpdateAvailable]);

  const handleUpdate = async () => {
    if (ytDlpUpdating) return;
    setYtDlpUpdating(true);
    setUpdateStatus('downloading');
    try {
      const { updateYtDlp, getYtDlpVersion } = await import('@/lib/ytdlpBridge');
      const status = await updateYtDlp();
      const newVersion = await getYtDlpVersion();
      setYtDlpVersion(newVersion);
      setYtDlpUpdateAvailable(false);
      setShowAutoUpdate(false);
      setUpdateStatus(status === 'DONE' ? 'done' : 'skipped');
      // Limpiar estado después de 3s
      setTimeout(() => setUpdateStatus('idle'), 3000);
    } catch {
      setUpdateStatus('error');
      setTimeout(() => setUpdateStatus('idle'), 3000);
    } finally {
      setYtDlpUpdating(false);
    }
  };

  const handlePickFolder = async () => {
    if (!supportsDirectoryPicker) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dirHandle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
      setDownloadFolder(dirHandle, dirHandle.name);
    } catch {
      // User cancelled the picker
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
              <div>
                <p className="text-sm text-[#F5F5F0] font-medium">MHL Music/</p>
                <p className="text-xs text-[#666660] mt-0.5">
                  Las descargas se guardan automáticamente en esta carpeta del dispositivo
                </p>
              </div>
            </div>
          ) : supportsDirectoryPicker ? (
            <div>
              {downloadFolderName ? (
                <div className="flex items-center gap-3">
                  <Folder className="w-5 h-5 text-[#C8F04B] flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[#F5F5F0] font-medium truncate">{downloadFolderName}</p>
                    <p className="text-xs text-[#666660] mt-0.5">
                      Las descargas se guardarán en esta carpeta automáticamente
                    </p>
                    <p className="text-[10px] text-[#555] mt-1">
                      Deberás volver a elegir la carpeta tras recargar la página
                    </p>
                  </div>
                  <button
                    onClick={handlePickFolder}
                    className="text-xs text-[#C8F04B] hover:underline px-3 py-1.5 flex-shrink-0"
                  >
                    Cambiar
                  </button>
                  <button
                    onClick={clearDownloadFolder}
                    className="text-xs text-[#666660] hover:text-red-400 px-2 py-1.5 flex-shrink-0"
                  >
                    Quitar
                  </button>
                </div>
              ) : (
                <div className="text-center py-2">
                  <button
                    onClick={handlePickFolder}
                    className="btn-primary px-6 py-2.5 text-sm"
                  >
                    Elegir carpeta
                  </button>
                  <p className="text-xs text-[#666660] mt-3">
                    Selecciona una carpeta donde guardar las descargas
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-yellow-500/90 font-medium">Selección de carpeta no disponible</p>
                <p className="text-xs text-[#666660] mt-0.5">
                  Tu navegador no soporta selección de carpeta. Las descargas irán a tu carpeta de Descargas predeterminada.
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* yt-dlp — solo visible en Android, con diseño coherente */}
      {isAndroid && (
        <section className="mb-8">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-[#8A8A8A] mb-2">Motor de descarga</h2>

          {/* Card principal */}
          <motion.div
            className={`p-4 rounded-xl transition-all ${
              ytDlpUpdateAvailable
                ? 'bg-gradient-to-r from-[#C8F04B]/10 via-[#18181A] to-[#18181A] border border-[#C8F04B]/30'
                : 'bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)]'
            }`}
            animate={showAutoUpdate && !ytDlpUpdating ? { borderColor: ['#C8F04B50', '#C8F04B20', '#C8F04B50'] } : {}}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <div className="flex items-start gap-3">
              <motion.div
                className={`rounded-full p-2.5 flex-shrink-0 ${
                  ytDlpUpdateAvailable ? 'bg-[#C8F04B]/15' : 'bg-[#232325]'
                }`}
                animate={ytDlpUpdating ? { scale: [1, 1.05, 1] } : {}}
                transition={{ duration: 0.6, repeat: Infinity }}
              >
                <Download className={`w-5 h-5 ${
                  ytDlpUpdating ? 'text-[#C8F04B] animate-pulse' :
                  ytDlpUpdateAvailable ? 'text-[#C8F04B]' :
                  'text-[#8A8A8A]'
                }`} />
              </motion.div>

              <div className="flex-1 min-w-0">
                {/* Encabezado: nombre + versión */}
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-semibold text-[#F5F5F0]">yt-dlp</span>
                  <span className="text-xs font-mono text-[#8A8A8A]">
                    {ytDlpVersion ?? 'cargando…'}
                  </span>
                  {versionAge !== null && !ytDlpUpdateAvailable && (
                    <span className="text-[10px] text-[#666660] ml-auto">
                      {versionAge} días
                    </span>
                  )}
                </div>

                {/* Descripción */}
                <p className="text-xs text-[#8A8A8A] mb-2">
                  Gestor de descargas para YouTube y otras fuentes de música
                </p>

                {/* Estados */}
                <motion.div
                  initial={false}
                  animate={{ height: 'auto' }}
                  transition={{ duration: 0.3 }}
                >
                  {/* En descarga: barra de progreso */}
                  {ytDlpUpdating && updateStatus === 'downloading' && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                      className="mb-2"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <RefreshCw className="w-3 h-3 text-[#C8F04B] animate-spin" />
                        <span className="text-xs text-[#C8F04B] font-medium">Descargando actualización…</span>
                      </div>
                      {/* Barra de progreso animada */}
                      <div className="w-full h-1.5 bg-[#232325] rounded-full overflow-hidden">
                        <motion.div
                          className="h-full bg-gradient-to-r from-[#C8F04B] to-[#d4f56a]"
                          initial={{ width: 0 }}
                          animate={{ width: '100%' }}
                          transition={{ duration: 6, ease: 'easeInOut' }}
                        />
                      </div>
                    </motion.div>
                  )}

                  {/* Completado */}
                  {updateStatus === 'done' && (
                    <motion.p
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-xs text-[#C8F04B] flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>Actualizado a la última versión</span>
                    </motion.p>
                  )}

                  {/* Ya está actualizado */}
                  {updateStatus === 'skipped' && (
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-xs text-[#8A8A8A]"
                    >
                      Ya tienes la versión más reciente
                    </motion.p>
                  )}

                  {/* Error */}
                  {updateStatus === 'error' && (
                    <motion.p
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-xs text-red-400 flex items-center gap-1.5"
                    >
                      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>Error en la descarga — revisa tu conexión</span>
                    </motion.p>
                  )}

                  {/* Versión antigua — mostrar sugerencia */}
                  {ytDlpUpdateAvailable && updateStatus === 'idle' && versionAge !== null && (
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-xs text-[#C8F04B] font-medium flex items-center gap-1.5"
                    >
                      <span className="inline-block w-1.5 h-1.5 bg-[#C8F04B] rounded-full animate-pulse" />
                      Versión de {versionAge} días — actualización recomendada
                    </motion.p>
                  )}
                </motion.div>
              </div>

              {/* Botón */}
              <motion.button
                onClick={handleUpdate}
                disabled={ytDlpUpdating}
                whileHover={!ytDlpUpdating ? { scale: 1.05 } : {}}
                whileTap={!ytDlpUpdating ? { scale: 0.95 } : {}}
                className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all shadow-sm ${
                  ytDlpUpdateAvailable && !ytDlpUpdating
                    ? 'bg-[#C8F04B] text-[#18181A] hover:bg-[#d4f56a] active:bg-[#C8F04B]'
                    : 'bg-[#232325] text-[#8A8A8A] hover:text-[#F5F5F0]'
                } ${ytDlpUpdating ? 'opacity-60 cursor-wait' : ''}`}
              >
                <RefreshCw className={`w-4 h-4 ${ytDlpUpdating ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">
                  {ytDlpUpdating ? 'Descargando…' : 'Actualizar'}
                </span>
                <span className="sm:hidden">
                  {ytDlpUpdating ? '…' : 'Act.'}
                </span>
              </motion.button>
            </div>
          </motion.div>

          {/* Información adicional (opcional) */}
          {ytDlpUpdateAvailable && showAutoUpdate && !ytDlpUpdating && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-xs text-[#666660] mt-2 px-1"
            >
              Se detectó una versión antigua. Pulsa el botón para descargar la última versión desde GitHub.
            </motion.p>
          )}
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
                href="https://pauldev.es"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs mt-2 block"
                style={{ color: "rgba(102,102,96,0.6)" }}
              >
                Desarrollado por Paul · pauldev.es
              </a>
            </div>
          </div>
        </div>
      </section>
    </motion.div>
  );
}
