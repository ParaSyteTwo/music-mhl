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
import { SUPPORTED_LANGUAGES, type LyricsTargetLanguage, type UiLanguageMode } from '@/lib/language';
import { APP_THEMES, getTheme } from '@/lib/themes/themeCatalog';
import { VideoSettingsCard } from '@/components/settings/VideoSettingsCard';
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

const LANGUAGE_OPTION_KEYS: Record<UiLanguageMode, string> = {
  system: 'languageSystem',
  es: 'languageSpanish',
  en: 'languageEnglish',
  pt: 'languagePortuguese',
  fr: 'languageFrench',
  de: 'languageGerman',
  it: 'languageItalian',
  ja: 'languageJapanese',
};

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

function AccordionCard({
  icon: Icon,
  title,
  subtitle,
  badge,
  badgeHighlight,
  open,
  onToggle,
  rightExtra,
  children,
}: {
  icon: typeof Palette;
  title: string;
  subtitle: string;
  badge?: string;
  badgeHighlight?: boolean;
  open: boolean;
  onToggle: () => void;
  rightExtra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl theme-card bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] overflow-hidden shadow-sm transition-colors">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-white/[0.025] transition-colors text-left group"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-[var(--accent-primary)]/10 border border-[var(--accent-primary)]/20 flex items-center justify-center flex-shrink-0">
            <Icon className="w-4 h-4 text-[var(--accent-primary)]" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#F5F5F0] truncate">{title}</p>
            <p className="text-xs text-[#8E8E88] truncate mt-0.5">{subtitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0 min-w-0">
          {rightExtra}
          {badge && (
            <span
              className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-medium truncate max-w-[130px] sm:max-w-[190px] ${
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
        <div className="px-4 pb-4 pt-3 border-t border-white/[0.05] bg-white/[0.012] animate-in slide-in-from-top-1 fade-in duration-150">
          {children}
        </div>
      )}
    </section>
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
    videoclipsEnabled, setVideoclipsEnabled,
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
        setYtDlpUpdateAvailable(isYtDlpVersionOutdated(version, 14));
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
      if (status === 'FAILED') {
        setUpdateStatus('error');
      } else {
        setYtDlpUpdateAvailable(false);
        setUpdateStatus(status === 'DONE' ? 'done' : 'skipped');
      }
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

  const downloadsSubtitle = [
    t('downloadFormatTitle'),
    downloadFolderName || (isAndroid ? t('androidFolderTitle') : t('downloadFolder')),
    t('animeToggleTitle'),
  ].join(' · ');

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="px-4 sm:px-8 py-4 sm:py-8 max-w-3xl mx-auto space-y-6"
    >
      <header>
        <h1 className="text-lg sm:text-2xl font-semibold tracking-tight text-[#F5F5F0]">{t('settings')}</h1>
        <p className="text-xs sm:text-sm text-[#7A7A74] mt-0.5">{t('appSettingsSubtitle')}</p>
      </header>

      {/* Bloque 1: Personalización */}
      <div className="space-y-2.5">
        <h2 className="text-[11px] font-mono uppercase tracking-widest text-[#70706B]">
          {t('settingsGroupPersonalization')}
        </h2>

        {/* Idioma */}
        <section className="p-4 rounded-2xl theme-card bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[var(--accent-primary)]/10 border border-[var(--accent-primary)]/20 flex items-center justify-center flex-shrink-0">
              <Globe className="w-4 h-4 text-[var(--accent-primary)]" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#F5F5F0]">{t('language')}</p>
              <p className="text-xs text-[#8E8E88] truncate">{t('languageHelp')}</p>
            </div>
          </div>
          <select
            aria-label={t('language')}
            value={uiLanguageMode}
            onChange={(e) => setUiLanguageMode(e.target.value as UiLanguageMode)}
            className="px-3 py-2 rounded-xl bg-[#1A1A1F] text-[#F5F5F0] border border-white/[0.08] text-xs font-semibold outline-none focus:border-[var(--accent-primary)] transition-colors self-start sm:self-center flex-shrink-0 cursor-pointer"
          >
            {(['system', ...SUPPORTED_LANGUAGES] as UiLanguageMode[]).map((mode) => (
              <option key={mode} value={mode} className="bg-[#141418] text-[#F5F5F0]">
                {t(LANGUAGE_OPTION_KEYS[mode])}
              </option>
            ))}
          </select>
        </section>

        {/* Apariencia & Temas con Galería Viva */}
        <AccordionCard
          icon={Palette}
          title={t('appearanceTitle')}
          subtitle={t('appearanceHelp')}
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Object.values(APP_THEMES).map((theme) => {
              const isActive = (appTheme || 'original_minimalist') === theme.id;
              return (
                <button
                  key={theme.id}
                  type="button"
                  onClick={() => setAppTheme(theme.id)}
                  className={`group relative flex flex-col p-3 text-left transition-all overflow-hidden active:scale-[0.98] min-w-0 border ${
                    isActive
                      ? 'bg-white/[0.08] shadow-xl ring-1'
                      : 'border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/[0.16]'
                  }`}
                  style={{
                    borderRadius: theme.radius,
                    ...(isActive
                      ? {
                          borderColor: theme.accentPrimary,
                          boxShadow: `0 10px 30px -10px ${theme.accentGlow}`,
                        }
                      : {}),
                  }}
                >
                  {/* Mini-escenario en vivo fiel al tema */}
                  <div
                    className="w-full h-24 mb-2.5 overflow-hidden relative border border-white/10 p-2.5 flex flex-col justify-between"
                    style={{
                      backgroundColor: theme.bgBase,
                      backgroundImage: theme.ambientAura,
                      borderRadius: `calc(${theme.radius} * 0.75)`,
                    }}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-black/55 backdrop-blur-md border border-white/10">
                        <span className="text-[11px]">{theme.emoji}</span>
                        <span className="text-[8px] font-mono tracking-wider text-[#F5F5F0] uppercase font-bold">
                          {theme.mood}
                        </span>
                      </span>
                      {isActive && (
                        <span
                          className="px-1.5 py-0.5 rounded-full text-[#080808] text-[8px] font-bold tracking-wider uppercase shadow"
                          style={{ backgroundColor: theme.accentPrimary }}
                        >
                          ACTIVO
                        </span>
                      )}
                    </div>

                    {/* Mini UI preview bar */}
                    <div
                      className="w-full px-2 py-1.5 border border-white/10 flex items-center justify-between gap-2 backdrop-blur-sm"
                      style={{
                        backgroundColor: theme.bgSurface,
                        borderRadius: `calc(${theme.radius} * 0.5)`,
                      }}
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: theme.accentPrimary }}
                        />
                        <span
                          className="h-1.5 w-14 rounded-full opacity-55"
                          style={{ background: theme.gradient }}
                        />
                      </div>
                      <span
                        className="w-4 h-4 flex items-center justify-center text-[8px] font-bold text-[#080808] flex-shrink-0"
                        style={{
                          backgroundColor: theme.accentPrimary,
                          borderRadius: `calc(${theme.radius} * 0.4)`,
                        }}
                      >
                        ▶
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-1.5 mb-1 w-full">
                    <p
                      className="text-xs sm:text-sm font-bold leading-tight truncate"
                      style={{ color: isActive ? theme.accentPrimary : '#F5F5F0' }}
                    >
                      {t(theme.nameKey)}
                    </p>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {theme.swatch.map((color, idx) => (
                        <span
                          key={idx}
                          className="w-2 h-2 rounded-full border border-black/40"
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col gap-1 mb-1 w-full min-w-0">
                    <span className="text-[8.5px] font-semibold px-1.5 py-0.5 rounded-md bg-white/[0.05] text-[#D0D0C8] border border-white/[0.05] truncate w-full">
                      {theme.signatureFx}
                    </span>
                    <span className="text-[8px] font-mono px-1.5 py-0.5 rounded-md bg-white/[0.03] text-[#8E8E88] truncate w-full">
                      Aa {theme.font} · {theme.radius}
                    </span>
                  </div>

                  <p className="text-[10px] text-[#8E8E88] leading-snug line-clamp-2">
                    {t(theme.descKey)}
                  </p>
                </button>
              );
            })}
          </div>
        </AccordionCard>
      </div>

      {/* Bloque 2: Descargas y audio */}
      <div className="space-y-2.5">
        <h2 className="text-[11px] font-mono uppercase tracking-widest text-[#70706B]">
          {t('settingsGroupDownloads')}
        </h2>

        {/* Descargas y audio */}
        <AccordionCard
          icon={Download}
          title={t('settingsGroupDownloads')}
          subtitle={downloadsSubtitle}
          badge={(downloadAudioFormat || 'm4a').toUpperCase()}
          badgeHighlight
          open={showDownloads}
          onToggle={() => setShowDownloads((v) => !v)}
        >
          <div className="space-y-3.5">
            {/* Formato de audio */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setDownloadAudioFormat('m4a')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  (downloadAudioFormat || 'm4a') === 'm4a'
                    ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/10 ring-1 ring-[var(--accent-primary)]/30'
                    : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05]'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className={`text-xs font-bold ${(downloadAudioFormat || 'm4a') === 'm4a' ? 'text-[var(--accent-primary)]' : 'text-[#F5F5F0]'}`}>
                    💎 {t('downloadFormatQuality')}
                  </span>
                  {(downloadAudioFormat || 'm4a') === 'm4a' && (
                    <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-[var(--accent-primary)] text-[#18181A]">
                      {t('formatActive')}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-[#8E8E88] leading-tight">{t('downloadFormatQualityDesc')}</p>
              </button>

              <button
                type="button"
                onClick={() => setDownloadAudioFormat('mp3')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  downloadAudioFormat === 'mp3'
                    ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/10 ring-1 ring-[var(--accent-primary)]/30'
                    : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05]'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className={`text-xs font-bold ${downloadAudioFormat === 'mp3' ? 'text-[var(--accent-primary)]' : 'text-[#F5F5F0]'}`}>
                    🚗 {t('downloadFormatCompatibility')}
                  </span>
                  {downloadAudioFormat === 'mp3' && (
                    <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-[var(--accent-primary)] text-[#18181A]">
                      {t('formatActive')}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-[#8E8E88] leading-tight">{t('downloadFormatCompatibilityDesc')}</p>
              </button>
            </div>

            {/* Carpeta de descargas */}
            <div className="pt-2.5 border-t border-white/[0.06]">
              {isAndroid ? (
                <div className="flex items-center gap-2 text-xs text-[#9E9E98]">
                  <Folder className="w-4 h-4 text-[var(--accent-primary)] flex-shrink-0" />
                  <span className="font-medium text-[#F5F5F0]">{t('androidFolderTitle')}</span>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Folder className="w-4 h-4 text-[var(--accent-primary)] flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-[#F5F5F0] truncate">
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
                          <X className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handlePickFolder}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--accent-primary)] text-[#18181A] hover:opacity-90 transition-opacity"
                      >
                        <FolderOpen className="w-3.5 h-3.5" />
                        {downloadFolderName ? t('changeFolder') : t('chooseFolder')}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Reproductor predeterminado (solo Android) */}
            {isAndroid && (
              <div className="pt-2.5 border-t border-white/[0.06] space-y-2">
                <p className="text-xs font-semibold text-[#F5F5F0] flex items-center gap-1.5">
                  <Music2 className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                  {t('defaultPlayer')}
                </p>
                {loadingPlayers ? (
                  <p className="text-xs text-[#8E8E88]">{t('loadingPlayers')}</p>
                ) : audioPlayers.length === 0 ? (
                  <p className="text-xs text-[#8E8E88]">{t('noAudioPlayers')}</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    <label className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.05] cursor-pointer text-xs text-[#F5F5F0]">
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
                        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.05] cursor-pointer text-xs text-[#F5F5F0]"
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
            <div className="flex items-center justify-between gap-3 pt-2.5 border-t border-white/[0.06]">
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-semibold text-[#F5F5F0]">{t('animeToggleTitle')}</p>
                <p className="text-xs text-[#8E8E88] mt-0.5">{t('animeToggleDescription')}</p>
              </div>
              <ToggleSwitch
                checked={animeSearchEnabled}
                onChange={setAnimeSearchEnabled}
                label={t('animeToggleTitle')}
              />
            </div>

            {/* Modo Videoclips MP4 (opt-in explícito) */}
            <div className="flex items-center justify-between gap-3 pt-2.5 border-t border-white/[0.06]">
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-semibold text-[#F5F5F0]">{t('videoclipsToggleTitle')}</p>
                <p className="text-xs text-[#8E8E88] mt-0.5">{t('videoclipsToggleDesc')}</p>
              </div>
              <ToggleSwitch
                checked={videoclipsEnabled}
                onChange={setVideoclipsEnabled}
                label={t('videoclipsToggleTitle')}
              />
            </div>

            {videoclipsEnabled && (
              <div className="pt-2.5 border-t border-white/[0.06]">
                <VideoSettingsCard />
              </div>
            )}
          </div>
        </AccordionCard>

        {/* Letras */}
        <AccordionCard
          icon={FileText}
          title={t('lyrics')}
          subtitle={t('lyricsAccordionSubtitle')}
          badge={lyricsBadgeText}
          badgeHighlight={activeLyricsLayers.length > 0}
          open={showLyrics}
          onToggle={() => setShowLyrics((v) => !v)}
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-semibold text-[#F5F5F0]">{t('lyricsOriginal')}</p>
                <p className="text-xs text-[#8E8E88]">{t('lyricsOriginalHelp')}</p>
              </div>
              <ToggleSwitch checked={lyricOriginal} onChange={setLyricOriginal} label={t('lyricsOriginal')} />
            </div>

            <div className="flex items-center justify-between gap-3 pt-2.5 border-t border-white/[0.05]">
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-semibold text-[#F5F5F0]">{t('lyricsRomanization')}</p>
                <p className="text-xs text-[#8E8E88]">{t('lyricsRomanizationHelp')}</p>
              </div>
              <ToggleSwitch checked={lyricRomanization} onChange={setLyricRomanization} label={t('lyricsRomanization')} />
            </div>

            <div className="flex items-center justify-between gap-3 pt-2.5 border-t border-white/[0.05]">
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-semibold text-[#F5F5F0]">{t('lyricsLatinOnly')}</p>
                <p className="text-xs text-[#8E8E88]">{t('lyricsLatinOnlyHelp')}</p>
              </div>
              <ToggleSwitch checked={lyricLatinOnly} onChange={setLyricLatinOnly} label={t('lyricsLatinOnly')} />
            </div>

            <div className="pt-2.5 border-t border-white/[0.05] space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm font-semibold text-[#F5F5F0]">{t('lyricsTranslation')}</p>
                  <p className="text-xs text-[#8E8E88]">{t('lyricsTranslationHelp')}</p>
                </div>
                <ToggleSwitch checked={lyricTranslation} onChange={setLyricTranslation} label={t('lyricsTranslation')} />
              </div>

              <div className={`transition-opacity ${lyricTranslation ? 'opacity-100' : 'opacity-45 pointer-events-none'}`}>
                <p className="text-xs text-[#8E8E88] mb-1.5">{t('lyricsTargetLanguage')}</p>
                <select
                  aria-label={t('lyricsTargetLanguage')}
                  disabled={!lyricTranslation}
                  value={lyricsTargetLanguage}
                  onChange={(e) => setLyricsTargetLanguage(e.target.value as LyricsTargetLanguage)}
                  className="w-full sm:w-auto px-3 py-2 rounded-xl bg-[#1A1A1F] text-[#F5F5F0] border border-white/[0.08] text-xs font-semibold outline-none focus:border-[var(--accent-primary)] transition-colors cursor-pointer disabled:opacity-50"
                >
                  {(['system', ...SUPPORTED_LANGUAGES] as LyricsTargetLanguage[]).map((mode) => (
                    <option key={mode} value={mode} className="bg-[#141418] text-[#F5F5F0]">
                      {t(LANGUAGE_OPTION_KEYS[mode])}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </AccordionCard>
      </div>

      {/* Bloque 3: Sistema */}
      <div className="space-y-2.5">
        <h2 className="text-[11px] font-mono uppercase tracking-widest text-[#70706B]">
          {t('settingsGroupSystem')}
        </h2>

        {/* Actualizaciones */}
        {(isAndroid || isPyWebView) && (
          <AccordionCard
            icon={RefreshCw}
            title={t('appUpdates')}
            subtitle={t('updateChannelActive', { channel: channelLabel })}
            badge={`v${installedBuild?.versionName ?? '…'}`}
            badgeHighlight={appUpdateStatus === 'available' || appUpdateStatus === 'readyToInstall'}
            open={showUpdates}
            onToggle={() => setShowUpdates((v) => !v)}
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-[#F5F5F0]">
                    {t('installedVersion', { version: installedBuild?.versionName ?? '…' })}
                    {remoteBuild ? ` · ${t('remoteVersion', { version: remoteBuild.versionName })}` : ''}
                  </p>
                  {appUpdateStatus === 'upToDate' && (
                    <p className="text-xs text-[#8E8E88] mt-0.5">{t('appUpToDate')}</p>
                  )}
                  {appUpdateStatus === 'available' && remoteBuild && (
                    <p className="text-xs text-[var(--accent-primary)] mt-0.5">
                      {t('appUpdateReady', { version: remoteBuild.versionName })}
                    </p>
                  )}
                  {appUpdateStatus === 'waiting' && remoteBuild && appUpdateDecision?.status === 'waiting' && (
                    <p className="text-xs text-amber-400 mt-0.5">
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
                    <p className="text-xs text-[var(--accent-primary)] mt-0.5">
                      {t('appUpdateDownloading', { progress: appUpdateProgress })}
                    </p>
                  )}
                  {appUpdateStatus === 'validating' && (
                    <p className="text-xs text-[var(--accent-primary)] mt-0.5">{t('appUpdateValidating')}</p>
                  )}
                  {appUpdateStatus === 'readyToInstall' && (
                    <p className="text-xs text-[var(--accent-primary)] mt-0.5">{t('appUpdateValidated')}</p>
                  )}
                  {appUpdateStatus === 'permissionRequired' && (
                    <p className="text-xs text-amber-400 mt-0.5">{t('appUpdatePermissionRequired')}</p>
                  )}
                  {appUpdateStatus === 'installing' && (
                    <p className="text-xs text-[var(--accent-primary)] mt-0.5">{t('appUpdateInstallerOpened')}</p>
                  )}
                  {appUpdateStatus === 'error' && (
                    <p className="text-xs text-red-300 mt-0.5 break-words">
                      {appUpdateError ? `${appUpdateError.code}: ${appUpdateError.detail}` : t('appUpdateCheckFailed')}
                    </p>
                  )}
                </div>

                <div className="flex-shrink-0">
                  {appUpdateStatus === 'downloading' && (
                    <button
                      type="button"
                      onClick={() => void cancelAvailableUpdateDownload()}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/[0.06] text-[#F5F5F0]"
                    >
                      {t('cancelUpdateDownload')}
                    </button>
                  )}
                  {appUpdateStatus === 'permissionRequired' && (
                    <button
                      type="button"
                      onClick={() => void openInstallPermission()}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-400 text-[#18181A]"
                    >
                      {t('allowInstallations')}
                    </button>
                  )}
                  {appUpdateStatus !== 'downloading' && appUpdateStatus !== 'permissionRequired' && (
                    <button
                      type="button"
                      onClick={() => void updateApp()}
                      disabled={appUpdateStatus === 'checking' || appUpdateStatus === 'validating' || appUpdateStatus === 'installing'}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50 transition-colors ${
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

              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/[0.05]">
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
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
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
              <p className={`text-xs ${updateChannel === 'experimental' ? 'text-amber-400/90' : 'text-[#8E8E88]'}`}>
                {updateChannel === 'experimental'
                  ? t('updateChannelExperimentalHelp')
                  : updateChannel === 'beta'
                    ? t('updateChannelBetaHelp')
                    : t('updateChannelStableHelp')}
              </p>
            </div>
          </AccordionCard>
        )}

        {/* Backup y restaurar */}
        <AccordionCard
          icon={HardDrive}
          title={t('backupRestore')}
          subtitle={t('backupHowItWorks')}
          badge="JSON"
          open={showBackup}
          onToggle={() => setShowBackup((v) => !v)}
        >
          <div className="space-y-3">
            <p className="text-xs text-[#8E8E88]">{t('backupDesc')}</p>
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
                className="flex-1 py-2 rounded-lg bg-[rgba(255,255,255,0.06)] text-xs font-semibold text-[#F5F5F0] border border-[rgba(255,255,255,0.06)] hover:bg-[rgba(255,255,255,0.1)] disabled:opacity-50 transition-colors"
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
                  className="flex-1 py-2 rounded-lg bg-[var(--accent-primary)] text-xs font-semibold text-[#18181A] hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {t('importBackup')}
                </button>
              ) : (
                <label className="flex-1 cursor-pointer">
                  <div className="w-full text-center py-2 rounded-lg bg-[var(--accent-primary)] text-xs font-semibold text-[#18181A] hover:opacity-90 transition-opacity">
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
        </AccordionCard>

        {/* Opciones avanzadas */}
        <AccordionCard
          icon={Zap}
          title={t('advancedOptions')}
          subtitle={`${t('autoDownload')} · ${t('searchDataSaver')} · yt-dlp`}
          badge={ytDlpUpdateAvailable ? t('updateAvailable') : (ytDlpVersion ? `yt-dlp ${ytDlpVersion}` : 'yt-dlp')}
          badgeHighlight={ytDlpUpdateAvailable}
          open={showAdvanced}
          onToggle={() => setShowAdvanced((v) => !v)}
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-semibold text-[#F5F5F0]">{t('autoDownload')}</p>
                <p className="text-xs text-[#8E8E88]">{t('autoDownloadDesc')}</p>
              </div>
              <ToggleSwitch
                checked={autoDownload}
                onChange={setAutoDownload}
                label={t('autoDownload')}
              />
            </div>

            <div className="flex items-center justify-between gap-3 pt-2.5 border-t border-white/[0.05]">
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-semibold text-[#F5F5F0]">{t('searchDataSaver')}</p>
                <p className="text-xs text-[#8E8E88]">{t('searchDataSaverHelp')}</p>
              </div>
              <ToggleSwitch
                checked={isDataSaverEnabled}
                onChange={handleToggleDataSaver}
                label={t('searchDataSaver')}
              />
            </div>

            <div className="flex items-center justify-between gap-3 pt-2.5 border-t border-white/[0.05]">
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-semibold text-[#F5F5F0]">{t('allowLongAudioDownloads')}</p>
                <p className="text-xs text-[#8E8E88]">{t('allowLongAudioShortHelp')}</p>
              </div>
              <ToggleSwitch
                checked={allowLongAudioDownloads}
                onChange={setAllowLongAudioDownloads}
                label={t('allowLongAudioDownloads')}
              />
            </div>

            {(isAndroid || isPyWebView) && (
              <div className="flex items-center justify-between gap-3 pt-2.5 border-t border-white/[0.05]">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs sm:text-sm font-semibold text-[#F5F5F0]">yt-dlp</span>
                    <span className="text-xs font-mono text-[#8E8E88]">{ytDlpVersion ?? t('loading')}</span>
                  </div>
                  <p className="text-xs text-[#8E8E88]">{t('downloadEngineHelp')}</p>
                  {updateStatus === 'done' && (
                    <p className="text-xs text-[var(--accent-primary)] mt-1 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> {t('updatedOk')}
                    </p>
                  )}
                  {updateStatus === 'skipped' && (
                    <p className="text-xs text-[#8E8E88] mt-1">{t('alreadyLatest')}</p>
                  )}
                  {updateStatus === 'error' && (
                    <p className="text-xs text-red-400 mt-1">{t('updateError')}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleUpdate}
                  disabled={ytDlpUpdating}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex-shrink-0 ${
                    ytDlpUpdateAvailable
                      ? 'bg-[var(--accent-primary)] text-[#18181A] hover:opacity-90'
                      : 'bg-[rgba(255,255,255,0.06)] text-[#D0D0C8] hover:text-[#F5F5F0]'
                  } disabled:opacity-50 disabled:cursor-wait`}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${ytDlpUpdating ? 'animate-spin' : ''}`} />
                  {ytDlpUpdating ? t('updating') : t('update')}
                </button>
              </div>
            )}
          </div>
        </AccordionCard>
      </div>

      <footer className="pt-2 text-center text-[11px] text-[#6E6E68]">
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
