import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import { BottomPlayer } from './BottomPlayer';
import { Search, Download, Settings } from 'lucide-react';
import { t } from '@/lib/i18n';
import { useMusicStore } from '@/store/musicStore';

const RAILWAY_URL = (import.meta as { env: Record<string, string> }).env.VITE_RAILWAY_URL;

export function AppLayout() {
  const downloadCount = useMusicStore((s) => s.downloads.filter((d) => d.status === 'downloading').length);
  const dominantColor = useMusicStore((s) => s.dominantColor);
  const currentTrack = useMusicStore((s) => s.currentTrack);
  const isMaintenanceMode = useMusicStore((s) => s.isMaintenanceMode);
  const setMaintenanceMode = useMusicStore((s) => s.setMaintenanceMode);
  const navigate = useNavigate();

  // Poll /health para detectar mantenimiento proactivamente
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch(`${RAILWAY_URL}/health`);
        const data = await res.json() as { maintenance?: boolean };
        setMaintenanceMode(!!data.maintenance);
      } catch { /* ignorar errores de red */ }
    };
    check();
    pollRef.current = setInterval(check, 30_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [setMaintenanceMode]);

  return (
    <div className="flex flex-col h-[100dvh] bg-background overflow-hidden">
      {/* Dynamic color gradient from album art */}
      {currentTrack && dominantColor && (
        <div
          className="fixed top-0 left-0 right-0 h-40 z-0 pointer-events-none"
          style={{
            background: `linear-gradient(to bottom, rgba(${dominantColor}, 0.08), transparent)`,
            transition: 'background 800ms ease',
          }}
        />
      )}

      {/* Banner de mantenimiento */}
      {isMaintenanceMode && (
        <div className="relative z-50 flex items-center justify-center gap-2.5 px-4 py-3 text-sm bg-amber-500/10 border-b border-amber-500/20 text-amber-200 flex-shrink-0 select-none">
          <span className="text-base animate-bounce">🔧</span>
          <span className="font-medium tracking-wide">
            Mantenimiento en curso
            <span className="text-amber-400/70 font-normal ml-1.5">— descargas disponibles en ≈5 min</span>
          </span>
          <span className="ml-1 flex gap-0.5">
            <span className="w-1 h-1 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1 h-1 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1 h-1 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: '300ms' }} />
          </span>
        </div>
      )}

      {/* Mobile top bar — only visible on mobile, shows app name + settings icon */}
      <header
        className="sm:hidden flex items-center justify-between px-4 bg-[rgba(8,8,8,0.9)] border-b border-[rgba(255,255,255,0.06)] flex-shrink-0 z-30"
        style={{
          backdropFilter: 'blur(12px)',
          paddingTop: 'calc(var(--sat) + 10px)',
          paddingBottom: '10px',
          minHeight: 'calc(44px + var(--sat))',
        }}
      >
        <span className="text-sm font-semibold tracking-tight text-[#F5F5F0]">MHL Music</span>
        <button
          onClick={() => navigate('/settings')}
          className="w-9 h-9 flex items-center justify-center rounded-xl text-[#999] active:text-[#C8F04B] active:bg-[rgba(200,240,75,0.1)] transition-colors"
          aria-label="Ajustes"
        >
          <Settings className="w-5 h-5" />
        </button>
      </header>

      {/* Desktop top nav */}
      <nav
        className="hidden sm:flex sticky top-0 z-30 items-center gap-6 px-8 bg-[rgba(8,8,8,0.9)] border-b border-[rgba(255,255,255,0.06)] flex-shrink-0"
        style={{
          backdropFilter: 'blur(12px)',
          paddingTop: 'calc(var(--sat) + 8px)',
          paddingBottom: '8px',
          minHeight: 'calc(48px + var(--sat))',
        }}
      >
        <NavLink to="/" className={({ isActive }) => `flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg transition-colors ${isActive ? 'text-[#C8F04B] bg-[rgba(200,240,75,0.1)]' : 'text-[#999] hover:text-[#F5F5F0]'}`}>
          <Search className="w-4 h-4" /> {t('search')}
        </NavLink>
        <NavLink to="/downloads" className={({ isActive }) => `flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg transition-colors ${isActive ? 'text-[#C8F04B] bg-[rgba(200,240,75,0.1)]' : 'text-[#999] hover:text-[#F5F5F0]'}`}>
          <Download className="w-4 h-4" /> {t('downloads')}
        </NavLink>
        <NavLink to="/settings" className={({ isActive }) => `flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg transition-colors ${isActive ? 'text-[#C8F04B] bg-[rgba(200,240,75,0.1)]' : 'text-[#999] hover:text-[#F5F5F0]'}`}>
          <Settings className="w-4 h-4" /> {t('settings')}
        </NavLink>
        <div className="flex-1" />
      </nav>

      {/* Scrollable content area */}
      <main
        className="flex-1 overflow-y-auto relative z-10"
        style={{
          paddingTop: 'var(--sat)',
          paddingBottom: 'calc(var(--player-height) + var(--nav-height) + var(--sab) + 24px)',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <Outlet />
      </main>

      {/* Player — always outside scroll container */}
      <BottomPlayer />

      {/* Mobile bottom tab bar */}
      <nav
        className="sm:hidden fixed bottom-0 left-0 right-0 z-50 bg-[rgba(8,8,8,0.97)] border-t border-[rgba(255,255,255,0.06)] flex flex-shrink-0"
        style={{
          backdropFilter: 'blur(12px)',
          paddingBottom: 'var(--sab)',
          height: 'calc(var(--nav-height) + var(--sab))',
        }}
      >
        <NavLink to="/" className={({ isActive }) => `flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors min-h-[44px] ${isActive ? 'text-[#C8F04B] bg-[rgba(200,240,75,0.06)]' : 'text-[#666]'}`}>
          <Search className="w-5 h-5" />
          <span className="text-[10px] font-medium">{t('search')}</span>
        </NavLink>
        <NavLink to="/downloads" className={({ isActive }) => `flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors relative min-h-[44px] ${isActive ? 'text-[#C8F04B] bg-[rgba(200,240,75,0.06)]' : 'text-[#666]'}`}>
          <Download className="w-5 h-5" />
          <span className="text-[10px] font-medium">{t('downloads')}</span>
          {downloadCount > 0 && (
            <span className="absolute top-1.5 right-[calc(50%-2px)] translate-x-3 w-4 h-4 rounded-full bg-[#C8F04B] text-[#080808] text-[9px] font-bold flex items-center justify-center">
              {downloadCount}
            </span>
          )}
        </NavLink>
        <NavLink to="/settings" className={({ isActive }) => `flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors min-h-[44px] ${isActive ? 'text-[#C8F04B] bg-[rgba(200,240,75,0.06)]' : 'text-[#666]'}`}>
          <Settings className="w-5 h-5" />
          <span className="text-[10px] font-medium">{t('settings')}</span>
        </NavLink>
      </nav>
    </div>
  );
}
