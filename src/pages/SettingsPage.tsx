import { useState, useEffect, type ReactNode } from 'react';
import {
  Folder,
  RefreshCw,
  CheckCircle2,
  FolderOpen,
  X,
  Music2,
  ChevronDown,
  ChevronRight,
  Palette,
  Zap,
  FileText,
  Globe,
  Download,
  HardDrive,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { useMusicStore } from '@/store/musicStore';
import { useI18n } from '@/lib/useI18n';
import type { LyricsTargetLanguage, UiLanguageMode } from '@/lib/language';
import { APP_THEMES, getTheme } from '@/lib/themes/themeCatalog';
import { Capacitor } from '@capacitor/core';
import { isPyWebView } from '@/lib/platform';
import type { AudioPlayer } from '@/lib/openFileBridge';
import { useAppUpdateStore } from '@/store/appUpdateStore';
import { getRemainingSafetyDays } from '@/lib/appUpdatePolicy';
import {
  exportAppBackup,
  importAppBackupDesktop,
  parseAndValidateBackup,
} from '@/lib/backupBridge';

const isAndroid = Capacitor.getPlatform() === 'android';

function ToggleSwitch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
        checked ? 'bg-[var(--accent-primary)]' : 'bg-white/15'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full shadow ring-0 transition duration-200 ease-in-out ${
          checked ? 'translate-x-4 bg-[#080808]' : 'translate-x-0 bg-[#C8C8C0]'
        }`}
      />
    </button>
  );
}

function CompactAccordionRow({
  icon: Icon,
  title,
  badge,
  badgeHighlight,
  open,
  onToggle,
  rightExtra,
  children,
}: {
  icon: typeof Palette;
  title: string;
  badge?: string;
  badgeHighlight?: boolean;
  open: boolean;
  onToggle: () => void;
  rightExtra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2.5 px-3.5 py-3 hover:bg-white/[0.02] transition-colors text-left group"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-[var(--accent-primary)]/10 border border-[var(--accent-primary)]/20 flex items-center justify-center flex-shrink-0">
            <Icon className="w-4 h-4 text-[var(--accent-primary)]" />
          </div>
          <span className="text-[13px] font-semibold text-[#F5F5F0] truncate">{title}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 min-w-0">
          {rightExtra}
          {badge && (
            <span
              className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-medium truncate max-w-[140px] sm:max-w-[200px] ${
                badgeHighlight
                  ? 'bg-[var(--accent-primary)]/15 text-[var(--accent-primary)]'
                  : 'bg-white/[0.06] text-[#9E9E98]'
              }`}
            >
              {badge}
            </span>
          )}
          {open ? (
            <ChevronDown className="w-4 h-4 text-[var(--accent-primary)] flex-shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 text-[#8E8E88] group-hover:text-[#F5F5F0] transition-colors flex-shrink-0" />
          )}
        </div>
      </button>
      {open && (
        <div className="px-3.5 pb-3.5 pt-2 border-t border-white/[0.04] bg-white/[0.015] animate-in slide-in-from-top-1 fade-in duration-150">
          {children}
        </div>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const { t } = useI18n();
  const {
    downloadFolderName, setDownloadFolder, clearDownloadFolder,
    ytDlpVersion, ytDlpUpdateAvailable, ytDlpUpdating,
    setYtDlpVersion, setYtDlpUpdateAvailable, setYtDlpUpdating,
    preferredPlayerPackage, setPreferredPlayerPackage,
    lyricOriginal, setLyricOriginal,
    lyricRomanization, setLyricRomanization,
    lyricTranslation, setLyricTranslation,
    lyricLatinOnly, setLyricLatinOnly,
    uiLanguageMode, setUiLanguageMode,
    animeSearchEnabled, setAnimeSearchEnabled,
    lyricsTargetLanguage, setLyricsTargetLanguage,
    autoCandidateResolution, setAutoCandidateResolution,
    resolutionProfile, setResolutionProfile,
    setCellularResolutionPolicy,
    autoDownload, setAutoDownload,
    allowLongAudioDownloads, setAllowLongAudioDownloads,
    downloadAudioFormat, setDownloadAudioFormat,
    appTheme, setAppTheme,
  } = useMusicStore();

  const [updateStatus, setUpdateStatus] = useState<'idle' | 'done' | 'skipped' | 'error'>('idle');
  const [showThemes, setShowThemes] = useState(false);
  const [showDownloads, setShowDownloads] = useState(false);
  const [showLyrics, setShowLyrics] = useState(false);
  const [showBackup, setShowBackup] = useState(false);
  const [showUpdates, setShowUpdates] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [audioPlayers, setAudioPlayers] = useState<AudioPlayer[]>([]);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [lastBackupLocation, setLastBackupLocation] = useState<string | null>(null);
  const [backupBusy, setBackupBusy] = useState(false);

  const appUpdateStatus = useAppUpdateStore((state) => state.status);
  const appUpdateError = useAppUpdateStore((state) => state.error);
  const appUpdateDecision = useAppUpdateStore((state) => state.decision);
  const appUpdateTrustedTimeMs = useAppUpdateStore((state) => state.lastTrustedTimeMs);
  const installedBuild = useAppUpdateStore((state) => state.installedBuild);
  const remoteBuild = useAppUpdateStore((state) => state.remoteBuild);
  const updateApp = useAppUpdateStore((state) => state.updateApp);
  const cancelAvailableUpdateDownload = useAppUpdateStore(
    (state) => state.cancelAvailableUpdateDownload,
  );
  const appUpdateProgress = useAppUpdateStore((state) => state.downloadProgress);
  const openInstallPermission = useAppUpdateStore((state) => state.openInstallPermission);
  const resumeInstallAfterPermission = useAppUpdateStore(
    (state) => state.resumeInstallAfterPermission,
  );
  const updateChannel = useAppUpdateStore((state) => state.updateChannel);
  const setUpdateChannel = useAppUpdateStore((state) => state.setUpdateChannel);

  useEffect(() => {
    if (!isAndroid && !isPyWebView) return;
    (async () => {
      try {
        const { getYtDlpVersion, isYtDlpVersionOutdated } = await import('@/lib/ytdlpBridge');
        const version = await getYtDlpVersion();
        setYtDlpVersion(version);
        setYtDlpUpdateAvailable(isYtDlpVersionOutdated(version, 30));
      } catch { /* silencioso */ }
    })();
  }, [setYtDlpVersion, setYtDlpUpdateAvailable]);

  useEffect(() => {
    if (!isAndroid) return;
    setLoadingPlayers(true);
    import('@/lib/openFileBridge').then(({ getAudioPlayers }) =>
      getAudioPlayers().then((list) => setAudioPlayers(list)).catch(() => {})
    ).catch(() => {}).finally(() => setLoadingPlayers(false));
  }, []);

  useEffect(() => {
    if (!isAndroid || appUpdateStatus !== 'permissionRequired') return;
    const resumeInstallation = () => {
      if (document.visibilityState === 'visible') {
        void resumeInstallAfterPermission();
      }
    };
    document.addEventListener('visibilitychange', resumeInstallation);
    window.addEventListener('focus', resumeInstallation);
    return () => {
      document.removeEventListener('visibilitychange', resumeInstallation);
      window.removeEventListener('focus', resumeInstallation);
    };
  }, [appUpdateStatus, resumeInstallAfterPermission]);

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
    if ('pywebview' in window) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const api = (window as any).pywebview?.api;
        if (api?.pick_folder) {
          const folder = await api.pick_folder();
          if (folder) {
            await api.save_setting('download_folder', folder);
            setDownloadFolder(folder, folder.split(/[/\\]/).pop() || folder);
          }
        }
      } catch { /* cancelado */ }
      return;
    }
    if (!('showDirectoryPicker' in window)) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
      setDownloadFolder(handle, handle.name);
    } catch {
      // Usuario canceló
    }
  };

  const activeTheme = getTheme(appTheme);
  const activeLyricsLayers = [
    lyricOriginal ? t('lyricsOriginal') : null,
    lyricRomanization ? t('lyricsRomanization') : null,
    lyricLatinOnly ? t('lyricsLatinOnly') : null,
    lyricTranslation ? t('lyricsTranslation') : null,
  ].filter(Boolean) as string[];
  const lyricsBadgeText = activeLyricsLayers.length > 0
    ? activeLyricsLayers.join(' · ')
    : t('lyricsDisabledBadge');

  const channelLabel = updateChannel === 'experimental'
    ? t('updateChannelExperimental')
    : updateChannel === 'beta'
      ? t('updateChannelBeta')
      : t('updateChannelStable');

  const isDataSaverEnabled = resolutionProfile === 'economy' || !autoCandidateResolution;

  const handleToggleDataSaver = (enabled: boolean) => {
    setAutoCandidateResolution(true);
    if (enabled) {
      setResolutionProfile('economy');
      setCellularResolutionPolicy('light');
    } else {
      setResolutionProfile('adaptive');
      setCellularResolutionPolicy('full');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="px-3 sm:px-6 py-4 sm:py-8 max-w-2xl mx-auto"
    >
      <header className="mb-4 px-0.5">
        <h1 className="text-lg sm:text-xl font-semibold tracking-tight text-[#F5F5F0]">{t('settings')}</h1>
        <p className="text-xs text-[#7A7A74]">{t('appSettingsSubtitle')}</p>
      </header>

      <div className="rounded-2xl bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] divide-y divide-white/[0.06] overflow-hidden shadow-sm">
        {/* 1. Idioma (fila inline compacta) */}
        <div className="flex items-center justify-between gap-2.5 px-3.5 py-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[var(--accent-primary)]/10 border border-[var(--accent-primary)]/20 flex items-center justify-center flex-shrink-0">
              <Globe className="w-4 h-4 text-[var(--accent-primary)]" />
            </div>
            <span className="text-[13px] font-semibold text-[#F5F5F0] truncate">{t('language')}</span>
          </div>
          <div className="inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-white/[0.04] border border-white/[0.06] flex-shrink-0">
            {([
              ['system', t('languageSystem')],
              ['es', t('languageSpanish')],
              ['en', t('languageEnglish')],
            ] as Array<[UiLanguageMode, string]>).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setUiLanguageMode(mode)}
                className={`px-2 sm:px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                  uiLanguageMode === mode
                    ? 'bg-[var(--accent-primary)] text-[#18181A]'
                    : 'text-[#A0A098] hover:text-[#F5F5F0]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* 2. Apariencia */}
        <CompactAccordionRow
          icon={Palette}
          title={t('appearanceTitle')}
          badge={`${activeTheme.emoji} ${t(activeTheme.nameKey)}`}
          badgeHighlight
          open={showThemes}
          onToggle={() => setShowThemes((v) => !v)}
          rightExtra={(
            <div className="hidden sm:flex items-center gap-1">
              {activeTheme.swatch.map((c, i) => (
                <span key={i} className="w-2 h-2 rounded-full border border-black/40" style={{ backgroundColor: c }} />
              ))}
            </div>
          )}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
            {Object.values(APP_THEMES).map((theme) => {
              const isActive = (appTheme || 'original_minimalist') === theme.id;
              return (
                <button
                  key={theme.id}
                  type="button"
                  onClick={() => setAppTheme(theme.id)}
                  className={`group relative flex flex-col p-2.5 rounded-xl border text-left transition-all overflow-hidden active:scale-[0.98] min-w-0 ${
                    isActive
                      ? 'border-[var(--accent-primary)] bg-white/[0.08] ring-1 ring-[var(--accent-primary)]/40'
                      : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/[0.15]'
                  }`}
                >
                  <div className="w-full h-16 rounded-lg mb-2 overflow-hidden relative border border-white/10 bg-black/50 flex-shrink-0">
                    <img
                      src={theme.artworkUrl}
                      alt={t(theme.nameKey)}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />
                    <div className="absolute top-1.5 left-1.5 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10">
                      <span className="text-[10px]">{theme.emoji}</span>
                      <span className="text-[8px] font-mono tracking-wider text-[#F5F5F0] uppercase font-bold">
                        {theme.badge}
                      </span>
                    </div>
                    {isActive && (
                      <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-full bg-[var(--accent-primary)] text-[#080808] text-[8px] font-bold tracking-wider uppercase">
                        ACTIVO
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-1.5 w-full">
                    <p className={`text-xs font-bold leading-tight truncate ${isActive ? 'text-[var(--accent-primary)]' : 'text-[#F5F5F0]'}`}>
                      {t(theme.nameKey)}
                    </p>
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      {theme.swatch.map((color, idx) => (
                        <span
                          key={idx}
                          className="w-2 h-2 rounded-full border border-black/40"
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>
                  <p className="text-[9px] text-[#8E8E88] leading-snug line-clamp-1 mt-0.5">
                    {t(theme.descKey)}
                  </p>
                </button>
              );
            })}
          </div>
        </CompactAccordionRow>

        {/* 3. Descargas y audio */}
        <CompactAccordionRow
          icon={Download}
          title={t('settingsGroupDownloads')}
          badge={(downloadAudioFormat || 'm4a').toUpperCase()}
          badgeHighlight
          open={showDownloads}
          onToggle={() => setShowDownloads((v) => !v)}
        >
          <div className="space-y-3 pt-1">
            {/* Formato de audio */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDownloadAudioFormat('m4a')}
                className={`p-2.5 rounded-xl border text-left transition-all ${
                  (downloadAudioFormat || 'm4a') === 'm4a'
                    ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/10 ring-1 ring-[var(--accent-primary)]/30'
                    : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05]'
                }`}
              >
                <div className="flex items-center justify-between gap-1.5 mb-0.5">
                  <span className={`text-xs font-bold ${(downloadAudioFormat || 'm4a') === 'm4a' ? 'text-[var(--accent-primary)]' : 'text-[#F5F5F0]'}`}>
                    💎 {t('downloadFormatQuality')}
                  </span>
                  {(downloadAudioFormat || 'm4a') === 'm4a' && (
                    <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-[var(--accent-primary)] text-[#18181A]">
                      {t('formatActive')}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-[#8E8E88] line-clamp-2 leading-tight">{t('downloadFormatQualityDesc')}</p>
              </button>

              <button
                type="button"
                onClick={() => setDownloadAudioFormat('mp3')}
                className={`p-2.5 rounded-xl border text-left transition-all ${
                  downloadAudioFormat === 'mp3'
                    ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/10 ring-1 ring-[var(--accent-primary)]/30'
                    : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05]'
                }`}
              >
                <div className="flex items-center justify-between gap-1.5 mb-0.5">
                  <span className={`text-xs font-bold ${downloadAudioFormat === 'mp3' ? 'text-[var(--accent-primary)]' : 'text-[#F5F5F0]'}`}>
                    🚗 {t('downloadFormatCompatibility')}
                  </span>
                  {downloadAudioFormat === 'mp3' && (
                    <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-[var(--accent-primary)] text-[#18181A]">
                      {t('formatActive')}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-[#8E8E88] line-clamp-2 leading-tight">{t('downloadFormatCompatibilityDesc')}</p>
              </button>
            </div>

            {/* Carpeta de descargas */}
            <div className="pt-2 border-t border-white/[0.06]">
              {isAndroid ? (
                <div className="flex items-center gap-2 text-xs text-[#9E9E98]">
                  <Folder className="w-3.5 h-3.5 text-[var(--accent-primary)] flex-shrink-0" />
                  <span className="truncate">{t('androidFolderTitle')}</span>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <Folder className="w-3.5 h-3.5 text-[var(--accent-primary)] flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-[#F5F5F0] truncate">
                        {downloadFolderName ? `${downloadFolderName}/` : t('noFolderSelected')}
                      </p>
                      <p className="text-[11px] text-[#8E8E88] truncate">
                        {downloadFolderName
                          ? t('selectedFolderHelp')
                          : ('showDirectoryPicker' in window || isPyWebView ? t('folderPickerHelp') : t('folderPickerUnsupported'))}
                      </p>
                    </div>
                  </div>
                  {(('showDirectoryPicker' in window) || isPyWebView) && (
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {downloadFolderName && !isPyWebView && (
                        <button
                          type="button"
                          onClick={clearDownloadFolder}
                          className="p-1.5 rounded-lg text-[#9E9E98] hover:text-[#F5F5F0] hover:bg-white/[0.06] transition-colors"
                          title={t('removeFolder')}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handlePickFolder}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-[var(--accent-primary)] text-[#18181A] hover:opacity-90 transition-opacity"
                      >
                        <FolderOpen className="w-3 h-3" />
                        {downloadFolderName ? t('changeFolder') : t('chooseFolder')}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Reproductor predeterminado (solo Android) */}
            {isAndroid && (
              <div className="pt-2 border-t border-white/[0.06] space-y-1.5">
                <p className="text-xs font-semibold text-[#F5F5F0] flex items-center gap-1.5">
                  <Music2 className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                  {t('defaultPlayer')}
                </p>
                {loadingPlayers ? (
                  <p className="text-[11px] text-[#8E8E88]">{t('loadingPlayers')}</p>
                ) : audioPlayers.length === 0 ? (
                  <p className="text-[11px] text-[#8E8E88]">{t('noAudioPlayers')}</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    <label className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.04] cursor-pointer text-xs text-[#F5F5F0]">
                      <input
                        type="radio"
                        name="defaultPlayer"
                        checked={preferredPlayerPackage === null}
                        onChange={() => setPreferredPlayerPackage(null)}
                        className="accent-[var(--accent-primary)]"
                      />
                      <span className="truncate">{t('askAlways')}</span>
                    </label>
                    {audioPlayers.map((player) => (
                      <label
                        key={player.packageName}
                        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.04] cursor-pointer text-xs text-[#F5F5F0]"
                      >
                        <input
                          type="radio"
                          name="defaultPlayer"
                          checked={preferredPlayerPackage === player.packageName}
                          onChange={() => setPreferredPlayerPackage(player.packageName)}
                          className="accent-[var(--accent-primary)]"
                        />
                        <span className="truncate">{player.label}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Modo Anime (opt-in explícito) */}
            <div className="flex items-center justify-between gap-3 pt-2 border-t border-white/[0.06]">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[#F5F5F0]">{t('animeToggleTitle')}</p>
                <p className="text-[11px] text-[#8E8E88] line-clamp-2">{t('animeToggleDescription')}</p>
              </div>
              <ToggleSwitch
                checked={animeSearchEnabled}
                onChange={setAnimeSearchEnabled}
                label={t('animeToggleTitle')}
              />
            </div>
          </div>
        </CompactAccordionRow>

        {/* 4. Letras */}
        <CompactAccordionRow
          icon={FileText}
          title={t('lyrics')}
          badge={lyricsBadgeText}
          badgeHighlight={activeLyricsLayers.length > 0}
          open={showLyrics}
          onToggle={() => setShowLyrics((v) => !v)}
        >
          <div className="space-y-2.5 pt-1">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[#F5F5F0]">{t('lyricsOriginal')}</p>
                <p className="text-[11px] text-[#8E8E88] truncate">{t('lyricsOriginalHelp')}</p>
              </div>
              <ToggleSwitch checked={lyricOriginal} onChange={setLyricOriginal} label={t('lyricsOriginal')} />
            </div>

            <div className="flex items-center justify-between gap-3 pt-2 border-t border-white/[0.05]">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[#F5F5F0]">{t('lyricsRomanization')}</p>
                <p className="text-[11px] text-[#8E8E88] truncate">{t('lyricsRomanizationHelp')}</p>
              </div>
              <ToggleSwitch checked={lyricRomanization} onChange={setLyricRomanization} label={t('lyricsRomanization')} />
            </div>

            <div className="flex items-center justify-between gap-3 pt-2 border-t border-white/[0.05]">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[#F5F5F0]">{t('lyricsLatinOnly')}</p>
                <p className="text-[11px] text-[#8E8E88] truncate">{t('lyricsLatinOnlyHelp')}</p>
              </div>
              <ToggleSwitch checked={lyricLatinOnly} onChange={setLyricLatinOnly} label={t('lyricsLatinOnly')} />
            </div>

            <div className="pt-2 border-t border-white/[0.05] space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[#F5F5F0]">{t('lyricsTranslation')}</p>
                  <p className="text-[11px] text-[#8E8E88] truncate">{t('lyricsTranslationHelp')}</p>
                </div>
                <ToggleSwitch checked={lyricTranslation} onChange={setLyricTranslation} label={t('lyricsTranslation')} />
              </div>

              <div className={`transition-opacity ${lyricTranslation ? 'opacity-100' : 'opacity-45 pointer-events-none'}`}>
                <p className="text-[11px] text-[#8E8E88] mb-1.5">{t('lyricsTargetLanguage')}</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {([
                    ['system', t('languageSystem')],
                    ['es', t('languageSpanish')],
                    ['en', t('languageEnglish')],
                  ] as Array<[LyricsTargetLanguage, string]>).map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      disabled={!lyricTranslation}
                      onClick={() => setLyricsTargetLanguage(mode)}
                      className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
                        lyricsTargetLanguage === mode
                          ? 'bg-[var(--accent-primary)] text-[#18181A]'
                          : 'bg-[rgba(255,255,255,0.04)] text-[#B0B0B0] hover:text-[#F5F5F0]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </CompactAccordionRow>

        {/* 5. Copia de seguridad */}
        <CompactAccordionRow
          icon={HardDrive}
          title={t('backupRestore')}
          badge="JSON"
          open={showBackup}
          onToggle={() => setShowBackup((v) => !v)}
        >
          <div className="space-y-2.5 pt-1">
            <p className="text-[11px] text-[#8E8E88]">{t('backupHowItWorks')}</p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={backupBusy}
                onClick={async () => {
                  const state = localStorage.getItem('mhl-store');
                  if (!state) {
                    toast.error(t('backupNothingToExport'));
                    return;
                  }
                  setBackupBusy(true);
                  try {
                    const res = await exportAppBackup(state);
                    if (res.cancelled) return;
                    if (res.success && res.location) {
                      setLastBackupLocation(res.location);
                      toast.success(t('backupSavedAt', { location: res.location }));
                    } else {
                      toast.error(res.error || t('backupExportFailed'));
                    }
                  } finally {
                    setBackupBusy(false);
                  }
                }}
                className="flex-1 py-1.5 rounded-lg bg-[rgba(255,255,255,0.06)] text-xs font-semibold text-[#F5F5F0] border border-[rgba(255,255,255,0.06)] hover:bg-[rgba(255,255,255,0.1)] disabled:opacity-50 transition-colors"
              >
                {t('exportBackup')}
              </button>
              {isPyWebView ? (
                <button
                  type="button"
                  disabled={backupBusy}
                  onClick={async () => {
                    setBackupBusy(true);
                    try {
                      const res = await importAppBackupDesktop();
                      if (res.cancelled) return;
                      if (!res.success || !res.data) {
                        toast.error(res.error || t('corruptBackup'));
                        return;
                      }
                      const parsed = parseAndValidateBackup(res.data);
                      if (parsed.valid === false) {
                        toast.error(t(parsed.reason === 'corrupt' ? 'corruptBackup' : 'invalidBackup'));
                        return;
                      }
                      localStorage.setItem('mhl-store', parsed.normalized);
                      toast.success(t('backupRestored', { count: parsed.trackCount }));
                      window.setTimeout(() => window.location.reload(), 600);
                    } finally {
                      setBackupBusy(false);
                    }
                  }}
                  className="flex-1 py-1.5 rounded-lg bg-[var(--accent-primary)] text-xs font-semibold text-[#18181A] hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {t('importBackup')}
                </button>
              ) : (
                <label className="flex-1 cursor-pointer">
                  <div className="w-full text-center py-1.5 rounded-lg bg-[var(--accent-primary)] text-xs font-semibold text-[#18181A] hover:opacity-90 transition-opacity">
                    {t('importBackup')}
                  </div>
                  <input
                    type="file"
                    accept="application/json,text/plain,.json,*/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = (event) => {
                        const data = event.target?.result as string;
                        const parsed = parseAndValidateBackup(data);
                        if (parsed.valid === false) {
                          toast.error(t(parsed.reason === 'corrupt' ? 'corruptBackup' : 'invalidBackup'));
                          return;
                        }
                        localStorage.setItem('mhl-store', parsed.normalized);
                        toast.success(t('backupRestored', { count: parsed.trackCount }));
                        window.setTimeout(() => window.location.reload(), 600);
                      };
                      reader.readAsText(file);
                    }}
                  />
                </label>
              )}
            </div>
            {lastBackupLocation && (
              <p className="text-[11px] text-[var(--accent-primary)] break-all">
                {t('backupSavedAt', { location: lastBackupLocation })}
              </p>
            )}
          </div>
        </CompactAccordionRow>

        {/* 6. Actualizaciones (Android y Desktop) */}
        {(isAndroid || isPyWebView) && (
          <CompactAccordionRow
            icon={RefreshCw}
            title={t('appUpdates')}
            badge={`v${installedBuild?.versionName ?? '…'} · ${channelLabel}`}
            badgeHighlight={appUpdateStatus === 'available' || appUpdateStatus === 'readyToInstall'}
            open={showUpdates}
            onToggle={() => setShowUpdates((v) => !v)}
          >
            <div className="space-y-2.5 pt-1">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-[#F5F5F0]">
                    {t('installedVersion', { version: installedBuild?.versionName ?? '…' })}
                    {remoteBuild ? ` · ${t('remoteVersion', { version: remoteBuild.versionName })}` : ''}
                  </p>
                  {appUpdateStatus === 'upToDate' && (
                    <p className="text-[11px] text-[#8E8E88]">{t('appUpToDate')}</p>
                  )}
                  {appUpdateStatus === 'available' && remoteBuild && (
                    <p className="text-[11px] text-[var(--accent-primary)]">
                      {t('appUpdateReady', { version: remoteBuild.versionName })}
                    </p>
                  )}
                  {appUpdateStatus === 'waiting' && remoteBuild && appUpdateDecision?.status === 'waiting' && (
                    <p className="text-[11px] text-amber-400">
                      {t('appUpdateSafetyDetail', {
                        version: remoteBuild.versionName,
                        days: getRemainingSafetyDays(
                          appUpdateDecision.eligibleAt,
                          appUpdateTrustedTimeMs || Date.now(),
                        ),
                      })}
                    </p>
                  )}
                  {appUpdateStatus === 'downloading' && (
                    <p className="text-[11px] text-[var(--accent-primary)]">
                      {t('appUpdateDownloading', { progress: appUpdateProgress })}
                    </p>
                  )}
                  {appUpdateStatus === 'validating' && (
                    <p className="text-[11px] text-[var(--accent-primary)]">{t('appUpdateValidating')}</p>
                  )}
                  {appUpdateStatus === 'readyToInstall' && (
                    <p className="text-[11px] text-[var(--accent-primary)]">{t('appUpdateValidated')}</p>
                  )}
                  {appUpdateStatus === 'permissionRequired' && (
                    <p className="text-[11px] text-amber-400">{t('appUpdatePermissionRequired')}</p>
                  )}
                  {appUpdateStatus === 'installing' && (
                    <p className="text-[11px] text-[var(--accent-primary)]">{t('appUpdateInstallerOpened')}</p>
                  )}
                  {appUpdateStatus === 'error' && (
                    <p className="text-[11px] text-red-300 break-words">
                      {appUpdateError ? `${appUpdateError.code}: ${appUpdateError.detail}` : t('appUpdateCheckFailed')}
                    </p>
                  )}
                </div>

                <div className="flex-shrink-0">
                  {appUpdateStatus === 'downloading' && (
                    <button
                      type="button"
                      onClick={() => void cancelAvailableUpdateDownload()}
                      className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-white/[0.06] text-[#F5F5F0]"
                    >
                      {t('cancelUpdateDownload')}
                    </button>
                  )}
                  {appUpdateStatus === 'permissionRequired' && (
                    <button
                      type="button"
                      onClick={() => void openInstallPermission()}
                      className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-amber-400 text-[#18181A]"
                    >
                      {t('allowInstallations')}
                    </button>
                  )}
                  {appUpdateStatus !== 'downloading' && appUpdateStatus !== 'permissionRequired' && (
                    <button
                      type="button"
                      onClick={() => void updateApp()}
                      disabled={appUpdateStatus === 'checking' || appUpdateStatus === 'validating' || appUpdateStatus === 'installing'}
                      className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold disabled:opacity-50 transition-colors ${
                        appUpdateStatus === 'available' || appUpdateStatus === 'readyToInstall' || appUpdateStatus === 'error'
                          ? 'bg-[var(--accent-primary)] text-[#18181A]'
                          : 'bg-[rgba(255,255,255,0.06)] text-[#D0D0C8] hover:text-[#F5F5F0]'
                      }`}
                    >
                      {appUpdateStatus === 'checking' || appUpdateStatus === 'validating' || appUpdateStatus === 'installing'
                        ? t('updating')
                        : appUpdateStatus === 'available' || appUpdateStatus === 'readyToInstall' || appUpdateStatus === 'error'
                          ? t('update')
                          : t('checkUpdates')}
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-1.5">
                {(['stable', 'beta', 'experimental'] as const).map((channel) => (
                  <button
                    key={channel}
                    type="button"
                    onClick={() => void setUpdateChannel(channel)}
                    disabled={
                      appUpdateStatus === 'checking' ||
                      appUpdateStatus === 'downloading' ||
                      appUpdateStatus === 'validating' ||
                      appUpdateStatus === 'installing'
                    }
                    className={`px-2 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
                      updateChannel === channel
                        ? 'bg-[var(--accent-primary)] text-[#18181A]'
                        : 'bg-[rgba(255,255,255,0.04)] text-[#B0B0B0] hover:text-[#F5F5F0]'
                    }`}
                  >
                    {channel === 'experimental'
                      ? t('updateChannelExperimental')
                      : channel === 'beta'
                        ? t('updateChannelBeta')
                        : t('updateChannelStable')}
                  </button>
                ))}
              </div>
              <p className={`text-[11px] ${updateChannel === 'experimental' ? 'text-amber-400/90' : 'text-[#8E8E88]'}`}>
                {updateChannel === 'experimental'
                  ? t('updateChannelExperimentalHelp')
                  : updateChannel === 'beta'
                    ? t('updateChannelBetaHelp')
                    : t('updateChannelStableHelp')}
              </p>
            </div>
          </CompactAccordionRow>
        )}

        {/* 7. Avanzado */}
        <CompactAccordionRow
          icon={Zap}
          title={t('advancedOptions')}
          badge={ytDlpUpdateAvailable ? t('updateAvailable') : (ytDlpVersion ? `yt-dlp ${ytDlpVersion}` : 'yt-dlp')}
          badgeHighlight={ytDlpUpdateAvailable}
          open={showAdvanced}
          onToggle={() => setShowAdvanced((v) => !v)}
        >
          <div className="space-y-2.5 pt-1">
            {/* Descarga automática */}
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[#F5F5F0]">{t('autoDownload')}</p>
                <p className="text-[11px] text-[#8E8E88] truncate">{t('autoDownloadDesc')}</p>
              </div>
              <ToggleSwitch
                checked={autoDownload}
                onChange={setAutoDownload}
                label={t('autoDownload')}
              />
            </div>

            {/* Ahorro de datos en búsquedas (simplificado a 1 switch) */}
            <div className="flex items-center justify-between gap-3 pt-2 border-t border-white/[0.05]">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[#F5F5F0]">{t('searchDataSaver')}</p>
                <p className="text-[11px] text-[#8E8E88] truncate">{t('searchDataSaverHelp')}</p>
              </div>
              <ToggleSwitch
                checked={isDataSaverEnabled}
                onChange={handleToggleDataSaver}
                label={t('searchDataSaver')}
              />
            </div>

            {/* Audios largos (>20 min) */}
            <div className="flex items-center justify-between gap-3 pt-2 border-t border-white/[0.05]">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[#F5F5F0]">{t('allowLongAudioDownloads')}</p>
                <p className="text-[11px] text-[#8E8E88] truncate">{t('allowLongAudioShortHelp')}</p>
              </div>
              <ToggleSwitch
                checked={allowLongAudioDownloads}
                onChange={setAllowLongAudioDownloads}
                label={t('allowLongAudioDownloads')}
              />
            </div>

            {/* Motor yt-dlp */}
            {(isAndroid || isPyWebView) && (
              <div className="flex items-center justify-between gap-3 pt-2 border-t border-white/[0.05]">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-[#F5F5F0]">yt-dlp</span>
                    <span className="text-[11px] font-mono text-[#8E8E88]">{ytDlpVersion ?? t('loading')}</span>
                  </div>
                  {updateStatus === 'done' && (
                    <p className="text-[11px] text-[var(--accent-primary)] flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> {t('updatedOk')}
                    </p>
                  )}
                  {updateStatus === 'skipped' && (
                    <p className="text-[11px] text-[#8E8E88]">{t('alreadyLatest')}</p>
                  )}
                  {updateStatus === 'error' && (
                    <p className="text-[11px] text-red-400">{t('updateError')}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleUpdate}
                  disabled={ytDlpUpdating}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors flex-shrink-0 ${
                    ytDlpUpdateAvailable
                      ? 'bg-[var(--accent-primary)] text-[#18181A] hover:opacity-90'
                      : 'bg-[rgba(255,255,255,0.06)] text-[#D0D0C8] hover:text-[#F5F5F0]'
                  } disabled:opacity-50 disabled:cursor-wait`}
                >
                  <RefreshCw className={`w-3 h-3 ${ytDlpUpdating ? 'animate-spin' : ''}`} />
                  {ytDlpUpdating ? t('updating') : t('update')}
                </button>
              </div>
            )}
          </div>
        </CompactAccordionRow>
      </div>

      <footer className="mt-4 text-center text-[11px] text-[#6E6E68]">
        MHL Music ·{' '}
        <a
          href="https://paul-dev.vercel.app"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-[#B0B0A8] transition-colors"
        >
          {t('developedBy')}
        </a>
      </footer>
    </motion.div>
  );
}
