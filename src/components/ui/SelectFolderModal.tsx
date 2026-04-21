import { useState } from 'react';
import { FolderOpen, FolderCheck, X } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';

interface SelectFolderModalProps {
  onConfirm: (path: string) => void;
  onCancel: () => void;
}

export function SelectFolderModal({ onConfirm, onCancel }: SelectFolderModalProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const defaultPath = `${window.navigator.userAgent.includes('Windows') ? 'C:\\Users\\' + (window as any).__username || '' : '~'}/Music/MHL Music`;

  async function handleBrowse() {
    setLoading(true);
    try {
      const folder = await open({ directory: true, title: 'Carpeta de descargas' });
      if (typeof folder === 'string') setSelected(folder);
    } finally {
      setLoading(false);
    }
  }

  function handleConfirm() {
    onConfirm(selected || '~/Music/MHL Music');
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Modal */}
      <div className="relative w-full max-w-sm rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[#111] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[rgba(200,240,75,0.12)] flex items-center justify-center">
              <FolderOpen className="w-5 h-5 text-[#C8F04B]" />
            </div>
            <div>
              <h2 className="text-[#F5F5F0] text-sm font-semibold">Carpeta de descargas</h2>
              <p className="text-[#666] text-xs mt-0.5">Elige dónde guardar la música</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[#555] hover:text-[#999] hover:bg-[rgba(255,255,255,0.06)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 pb-5 space-y-3">
          {/* Carpeta seleccionada o placeholder */}
          <button
            onClick={handleBrowse}
            disabled={loading}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.06)] hover:border-[rgba(200,240,75,0.3)] transition-all text-left group"
          >
            <FolderCheck className={`w-4 h-4 flex-shrink-0 transition-colors ${selected ? 'text-[#C8F04B]' : 'text-[#555] group-hover:text-[#888]'}`} />
            <span className={`text-xs truncate flex-1 ${selected ? 'text-[#F5F5F0]' : 'text-[#555]'}`}>
              {selected || 'Hacer clic para elegir carpeta...'}
            </span>
          </button>

          {/* Default path hint */}
          {!selected && (
            <p className="text-[#444] text-xs px-1">
              Si no eliges, se usará: <span className="text-[#666]">~/Music/MHL Music</span>
            </p>
          )}

          {/* Botones */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={onCancel}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium text-[#666] hover:text-[#999] hover:bg-[rgba(255,255,255,0.06)] transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirm}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-[#C8F04B] text-[#080808] hover:bg-[#d4f55f] active:scale-95 transition-all"
            >
              {selected ? 'Confirmar' : 'Usar predeterminada'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
