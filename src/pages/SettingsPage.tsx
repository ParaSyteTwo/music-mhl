import { Settings, Folder, AlertTriangle, Wifi } from 'lucide-react';
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
    appLanguage, setAppLanguage
  } = useMusicStore();

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
