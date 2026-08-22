import { Outlet, NavLink } from 'react-router-dom';
import { BottomPlayer } from './BottomPlayer';
import { Search, Download, Settings } from 'lucide-react';
import { useI18n } from '@/lib/useI18n';
import { useMusicStore } from '@/store/musicStore';
import { AppUpdateNotice } from '@/components/updates/AppUpdateNotice';

export function AppLayout() {
  const { t } = useI18n();
  const downloadCount = useMusicStore((s) => s.downloads.filter((d) => d.status === 'downloading').length);
  const dominantColor = useMusicStore((s) => s.dominantColor);
  const currentTrack = useMusicStore((s) => s.currentTrack);
  return (
    <div className="relative isolate flex flex-col h-[100dvh] bg-background overflow-hidden">
      <div className="app-ambient fixed inset-0 z-0 pointer-events-none" aria-hidden="true" />

      {/* Dynamic color gradient from album art */}
      {currentTrack && dominantColor && (
        <div
          className="fixed top-0 left-0 right-0 h-52 z-0 pointer-events-none"
          style={{
            background: `radial-gradient(ellipse at 50% -15%, rgba(${dominantColor}, 0.15), transparent 68%)`,
            transition: 'background 800ms ease',
          }}
        />
      )}

      <AppUpdateNotice />

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
        <span className="mr-2 inline-flex items-center gap-2 font-[family-name:Syne] text-sm font-bold tracking-[-0.03em] text-[#F5F5F0]">
          <span className="h-2.5 w-2.5 rotate-12 rounded-[3px] bg-[#C8F04B] shadow-[0_0_16px_rgba(200,240,75,0.45)]" />
          MHL
        </span>
        <span className="h-4 w-px bg-white/[0.08]" aria-hidden="true" />
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
