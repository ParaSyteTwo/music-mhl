import { Settings, Folder, AlertTriangle } from 'lucide-react';
import { motion } from 'framer-motion';
import { useMusicStore } from '@/store/musicStore';
import { Capacitor } from '@capacitor/core';

const isAndroid = Capacitor.getPlatform() === 'android';
const supportsDirectoryPicker = !isAndroid && typeof window !== 'undefined' && 'showDirectoryPicker' in window;

export default function SettingsPage() {
  const { downloadFolderName, setDownloadFolder, clearDownloadFolder } = useMusicStore();

  const handlePickFolder = async () => {
    if (!supportsDirectoryPicker) return;
    try {
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

      {/* Download Folder Section */}
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
            </div>
          </div>
        </div>
      </section>
    </motion.div>
  );
}
