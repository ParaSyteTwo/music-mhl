import { useState, useEffect } from 'react';
import {
  Settings,
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
import { VideoSettingsCard } from '@/components/settings/VideoSettingsCard';

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
      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
        checked ? 'bg-[var(--accent-primary)]' : 'bg-white/15'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full shadow-lg ring-0 transition duration-200 ease-in-out ${
          checked ? 'translate-x-5 bg-[#080808]' : 'translate-x-0 bg-[#C8C8C0]'
        }`}
      />
    </button>
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
    cellularResolutionPolicy, setCellularResolutionPolicy,
    autoDownload, setAutoDownload,
    allowLongAudioDownloads, setAllowLongAudioDownloads,
    downloadAudioFormat, setDownloadAudioFormat,
    appTheme, setAppTheme,
  } = useMusicStore();

  const [updateStatus, setUpdateStatus] = useState<'idle' | 'done' | 'skipped' | 'error'>('idle');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showThemes, setShowThemes] = useState(false);
  const [showLyrics, setShowLyrics] = useState(false);
  const [showDefaultPlayer, setShowDefaultPlayer] = useState(false);
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
      // Usuario canceló — no hacer nada
    }
  };

  const activeLyricsLayers = [
    lyricOriginal ? t('lyricsOriginal') : null,
    lyricRomanization ? t('lyricsRomanization') : null,
    lyricLatinOnly ? t('lyricsLatinOnly') : null,
    lyricTranslation ? t('lyricsTranslation') : null,
  ].filter(Boolean) as string[];

  const lyricsBadgeText = activeLyricsLayers.length > 0
    ? activeLyricsLayers.join(' · ')
    : t('lyricsDisabledBadge');

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="px-4 sm:px-8 py-4 sm:py-10 max-w-3xl mx-auto space-y-8"
    >
      <header>
        <h1 className="text-lg sm:text-2xl font-semibold tracking-tighter mb-1 sm:mb-2">{t('settings')}</h1>
        <p className="text-xs sm:text-sm text-[#666660]">{t('appSettingsSubtitle')}</p>
      </header>

      {/* Bloque 1: Personalización */}
      <div className="space-y-4">
        <h2 className="text-xs font-mono uppercase tracking-widest text-[#666660]">
          {t('settingsGroupPersonalization')}
        </h2>

        {/* Apariencia & Temas */}
        <section>
          <button
            type="button"
            onClick={() => setShowThemes(!showThemes)}
            className="w-full flex items-center justify-between gap-3 p-4 rounded-2xl bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.12)] transition-all group text-left shadow-sm"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-[var(--accent-primary)]/10 border border-[var(--accent-primary)]/20 flex items-center justify-center flex-shrink-0 transition-colors duration-300 shadow-sm">
                <Palette className="w-4 h-4 text-[var(--accent-primary)]" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-[#F5F5F0]">{t('appearanceTitle')}</p>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[var(--accent-primary)]/15 text-[var(--accent-primary)] font-medium transition-colors duration-300">
                    {getTheme(appTheme).emoji} {t(getTheme(appTheme).nameKey)}
                  </span>
                </div>
                <p className="text-xs text-[#9E9E98] mt-0.5 truncate">{t('appearanceHelp')}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="hidden sm:flex items-center gap-1">
                {getTheme(appTheme).swatch.map((c, i) => (
                  <span key={i} className="w-2 h-2 rounded-full border border-black/40" style={{ backgroundColor: c }} />
                ))}
              </div>
              {showThemes ? (
                <ChevronDown className="w-4 h-4 text-[var(--accent-primary)]" />
              ) : (
                <ChevronRight className="w-4 h-4 text-[#9E9E98] group-hover:text-[#F5F5F0] transition-colors" />
              )}
            </div>
          </button>

          {showThemes && (
            <div className="mt-3 p-3 sm:p-4 rounded-2xl bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.06)] animate-in slide-in-from-top-2 fade-in duration-200">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {Object.values(APP_THEMES).map((theme) => {
                  const isActive = (appTheme || 'original_minimalist') === theme.id;
                  return (
                    <button
                      key={theme.id}
                      type="button"
                      onClick={() => setAppTheme(theme.id)}
                      className={`group relative flex flex-col p-3 rounded-2xl border text-left transition-all overflow-hidden active:scale-[0.98] min-w-0 ${
                        isActive
                          ? 'border-[var(--accent-primary)] bg-white/[0.08] shadow-xl shadow-[var(--accent-glow)] ring-1 ring-[var(--accent-primary)]/50'
                          : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/[0.15]'
                      }`}
                    >
                      <div className="w-full h-20 sm:h-24 rounded-xl mb-2.5 overflow-hidden relative border border-white/10 bg-black/50 flex-shrink-0">
                        <img
                          src={theme.artworkUrl}
                          alt={t(theme.nameKey)}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          loading="lazy"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />
                        <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10">
                          <span className="text-xs">{theme.emoji}</span>
                          <span className="text-[8px] font-mono tracking-wider text-[#F5F5F0] uppercase font-bold">
                            {theme.badge}
                          </span>
                        </div>
                        {isActive && (
                          <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-[var(--accent-primary)] text-[#080808] text-[8px] font-bold tracking-wider uppercase shadow-md">
                            ACTIVO
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-1.5 mb-1 w-full">
                        <p className={`text-xs sm:text-sm font-bold leading-tight truncate ${isActive ? 'text-[var(--accent-primary)]' : 'text-[#F5F5F0]'}`}>
                          {t(theme.nameKey)}
                        </p>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {theme.swatch.map((color, idx) => (
                            <span
                              key={idx}
                              className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full border border-black/40 shadow-sm flex-shrink-0"
                              style={{ backgroundColor: color }}
                            />
                          ))}
                        </div>
                      </div>

                      <div className="flex flex-col gap-1 mt-1 mb-1 w-full min-w-0">
                        <span className="text-[8px] font-semibold px-1.5 py-0.5 rounded-md bg-white/[0.05] text-[#D0D0C8] border border-white/[0.05] truncate w-full">
                          {theme.signatureFx}
                        </span>
                        <span className="text-[7.5px] font-mono px-1.5 py-0.5 rounded-md bg-white/[0.03] text-[#8E8E88] truncate w-full">
                          Aa {theme.font}
                        </span>
                      </div>

                      <p className="text-[9px] text-[#8E8E88] leading-snug line-clamp-2 mt-0.5">
                        {t(theme.descKey)}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* Idioma */}
        <section className="p-4 rounded-2xl bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] space-y-3">
          <div>
            <p className="text-sm font-semibold text-[#F5F5F0]">{t('language')}</p>
            <p className="text-xs text-[#9E9E98] mt-0.5">{t('languageHelp')}</p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {([
              ['system', t('languageSystem')],
              ['es', t('languageSpanish')],
              ['en', t('languageEnglish')],
            ] as Array<[UiLanguageMode, string]>).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setUiLanguageMode(mode)}
                className={`px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                  uiLanguageMode === mode
                    ? 'bg-[var(--accent-primary)] text-[#18181A]'
                    : 'bg-[rgba(255,255,255,0.04)] text-[#B0B0B0] hover:text-[#F5F5F0]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </section>
      </div>

      {/* Bloque 2: Descargas y audio */}
      <div className="space-y-4">
        <h2 className="text-xs font-mono uppercase tracking-widest text-[#666660]">
          {t('settingsGroupDownloads')}
        </h2>

        {/* Formato de Audio (Calidad M4A vs Compatibilidad MP3) */}
        <section className="p-4 rounded-2xl bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] space-y-3">
          <div>
            <p className="text-sm font-semibold text-[#F5F5F0]">{t('downloadFormatTitle')}</p>
            <p className="text-xs text-[#9E9E98] mt-0.5">{t('downloadFormatHelp')}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-white/[0.06]">
            <button
              type="button"
              onClick={() => setDownloadAudioFormat('m4a')}
              className={`p-3 rounded-xl border text-left transition-all ${
                (downloadAudioFormat || 'm4a') === 'm4a'
                  ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/10 shadow-sm ring-1 ring-[var(--accent-primary)]/30'
                  : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05]'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className={`text-xs font-bold ${(downloadAudioFormat || 'm4a') === 'm4a' ? 'text-[var(--accent-primary)]' : 'text-[#F5F5F0]'}`}>
                  💎 {t('downloadFormatQuality')}
                </span>
                {(downloadAudioFormat || 'm4a') === 'm4a' && (
                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-[var(--accent-primary)] text-[#18181A]">
                    {t('formatActive')}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[#8E8E88] leading-tight">
                {t('downloadFormatQualityDesc')}
              </p>
            </button>

            <button
              type="button"
              onClick={() => setDownloadAudioFormat('mp3')}
              className={`p-3 rounded-xl border text-left transition-all ${
                downloadAudioFormat === 'mp3'
                  ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/10 shadow-sm ring-1 ring-[var(--accent-primary)]/30'
                  : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05]'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className={`text-xs font-bold ${downloadAudioFormat === 'mp3' ? 'text-[var(--accent-primary)]' : 'text-[#F5F5F0]'}`}>
                  🚗 {t('downloadFormatCompatibility')}
                </span>
                {downloadAudioFormat === 'mp3' && (
                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-[var(--accent-primary)] text-[#18181A]">
                    {t('formatActive')}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[#8E8E88] leading-tight">
                {t('downloadFormatCompatibilityDesc')}
              </p>
            </button>
          </div>
        </section>

        <VideoSettingsCard />

        {/* Carpeta de descargas */}
        <section className="p-4 rounded-2xl bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)]">
          <p className="text-xs font-mono uppercase tracking-wider text-[#9E9E98] mb-2.5">{t('downloadFolder')}</p>
          {isAndroid ? (
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[var(--accent-primary)]/10 border border-[var(--accent-primary)]/20 flex items-center justify-center flex-shrink-0">
                <Folder className="w-4 h-4 text-[var(--accent-primary)]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-[#F5F5F0] font-medium">{t('androidFolderTitle')}</p>
                <p className="text-xs text-[#9E9E98] mt-0.5">
                  {t('androidFolderHelp')}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[var(--accent-primary)]/10 border border-[var(--accent-primary)]/20 flex items-center justify-center flex-shrink-0">
                <Folder className="w-4 h-4 text-[var(--accent-primary)]" />
              </div>
              <div className="flex-1 min-w-0">
                {downloadFolderName ? (
                  <>
                    <p className="text-sm text-[#F5F5F0] font-medium truncate">{downloadFolderName}/</p>
                    <p className="text-xs text-[#9E9E98] mt-0.5">{t('selectedFolderHelp')}</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-[#F5F5F0] font-medium">{t('noFolderSelected')}</p>
                    <p className="text-xs text-[#9E9E98] mt-0.5">
                      {'showDirectoryPicker' in window || isPyWebView
                        ? t('folderPickerHelp')
                        : t('folderPickerUnsupported')}
                    </p>
                  </>
                )}
              </div>
              {(('showDirectoryPicker' in window) || isPyWebView) && (
                <div className="flex items-center gap-2 flex-shrink-0">
                  {downloadFolderName && !isPyWebView && (
                    <button
                      type="button"
                      onClick={clearDownloadFolder}
                      className="p-1.5 rounded-lg text-[#9E9E98] hover:text-[#F5F5F0] hover:bg-[rgba(255,255,255,0.06)] transition-colors"
                      title={t('removeFolder')}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handlePickFolder}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-[var(--accent-primary)] text-[#18181A] hover:opacity-90 transition-opacity"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    {downloadFolderName ? t('changeFolder') : t('chooseFolder')}
                  </button>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Reproductor predeterminado — solo Android */}
        {isAndroid && (
          <section>
            <button
              type="button"
              onClick={() => setShowDefaultPlayer(!showDefaultPlayer)}
              className="w-full flex items-center justify-between gap-3 p-4 rounded-2xl bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.12)] transition-all group text-left shadow-sm"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-[var(--accent-primary)]/10 border border-[var(--accent-primary)]/20 flex items-center justify-center flex-shrink-0 transition-colors duration-300 shadow-sm">
                  <Music2 className="w-4 h-4 text-[var(--accent-primary)]" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-[#F5F5F0]">{t('defaultPlayer')}</p>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/[0.06] text-[#A0A098] font-medium truncate">
                      {preferredPlayerPackage
                        ? (audioPlayers.find((p) => p.packageName === preferredPlayerPackage)?.label || preferredPlayerPackage)
                        : t('askAlways')}
                    </span>
                  </div>
                  <p className="text-xs text-[#9E9E98] mt-0.5 truncate">{t('defaultPlayerHelp')}</p>
                </div>
              </div>
              <div className="flex-shrink-0">
                {showDefaultPlayer ? (
                  <ChevronDown className="w-4 h-4 text-[var(--accent-primary)]" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-[#9E9E98] group-hover:text-[#F5F5F0] transition-colors" />
                )}
              </div>
            </button>

            {showDefaultPlayer && (
              <div className="mt-3 p-4 rounded-2xl bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.06)] space-y-3 animate-in slide-in-from-top-2 fade-in duration-200">
                {loadingPlayers ? (
                  <p className="text-xs text-[#666] py-2">{t('loadingPlayers')}</p>
                ) : audioPlayers.length === 0 ? (
                  <p className="text-xs text-[#666] py-2">{t('noAudioPlayers')}</p>
                ) : (
                  <div className="space-y-2">
                    <label className="flex items-center gap-3 p-2.5 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.04] cursor-pointer transition-colors">
                      <input
                        type="radio"
                        name="defaultPlayer"
                        checked={preferredPlayerPackage === null}
                        onChange={() => setPreferredPlayerPackage(null)}
                        className="accent-[var(--accent-primary)]"
                      />
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-white/[0.06] flex items-center justify-center flex-shrink-0">
                          <Music2 className="w-3.5 h-3.5 text-[#A0A098]" />
                        </div>
                        <span className="text-xs font-semibold text-[#F5F5F0] truncate">{t('askAlways')}</span>
                      </div>
                    </label>

                    {audioPlayers.map((player) => (
                      <label key={player.packageName} className="flex items-center gap-3 p-2.5 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.04] cursor-pointer transition-colors">
                        <input
                          type="radio"
                          name="defaultPlayer"
                          checked={preferredPlayerPackage === player.packageName}
                          onChange={() => setPreferredPlayerPackage(player.packageName)}
                          className="accent-[var(--accent-primary)]"
                        />
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-7 h-7 rounded-lg bg-[var(--accent-primary)]/10 flex items-center justify-center flex-shrink-0">
                            <Music2 className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                          </div>
                          <span className="text-xs font-semibold text-[#F5F5F0] truncate">{player.label}</span>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* Modo Anime (opt-in explícito) */}
        <section className="p-4 rounded-2xl bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)]">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1">
              <p className="text-sm font-semibold text-[#F5F5F0]">{t('animeToggleTitle')}</p>
              <p className="text-xs text-[#9E9E98] mt-0.5">{t('animeToggleDescription')}</p>
            </div>
            <ToggleSwitch
              checked={animeSearchEnabled}
              onChange={setAnimeSearchEnabled}
              label={t('animeToggleTitle')}
            />
          </div>
        </section>
      </div>

      {/* Bloque 3: Letras (Acordeón unificado) */}
      <div className="space-y-4">
        <h2 className="text-xs font-mono uppercase tracking-widest text-[#666660]">
          {t('settingsGroupLyrics')}
        </h2>

        <section>
          <button
            type="button"
            onClick={() => setShowLyrics(!showLyrics)}
            className="w-full flex items-center justify-between gap-3 p-4 rounded-2xl bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.12)] transition-all group text-left shadow-sm"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-[var(--accent-primary)]/10 border border-[var(--accent-primary)]/20 flex items-center justify-center flex-shrink-0 transition-colors duration-300 shadow-sm">
                <FileText className="w-4 h-4 text-[var(--accent-primary)]" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-[#F5F5F0]">{t('lyrics')}</p>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[var(--accent-primary)]/15 text-[var(--accent-primary)] font-medium truncate max-w-[220px]">
                    {lyricsBadgeText}
                  </span>
                </div>
                <p className="text-xs text-[#9E9E98] mt-0.5 truncate">{t('lyricsAccordionSubtitle')}</p>
              </div>
            </div>
            <div className="flex-shrink-0">
              {showLyrics ? (
                <ChevronDown className="w-4 h-4 text-[var(--accent-primary)]" />
              ) : (
                <ChevronRight className="w-4 h-4 text-[#9E9E98] group-hover:text-[#F5F5F0] transition-colors" />
              )}
            </div>
          </button>

          {showLyrics && (
            <div className="mt-3 p-4 rounded-2xl bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.06)] space-y-4 animate-in slide-in-from-top-2 fade-in duration-200">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-[#F5F5F0]">{t('lyricsOriginal')}</p>
                  <p className="text-xs text-[#9E9E98] mt-0.5">{t('lyricsOriginalHelp')}</p>
                </div>
                <ToggleSwitch checked={lyricOriginal} onChange={setLyricOriginal} label={t('lyricsOriginal')} />
              </div>

              <div className="flex items-center justify-between gap-4 pt-3 border-t border-white/[0.06]">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-[#F5F5F0]">{t('lyricsRomanization')}</p>
                  <p className="text-xs text-[#9E9E98] mt-0.5">{t('lyricsRomanizationHelp')}</p>
                </div>
                <ToggleSwitch checked={lyricRomanization} onChange={setLyricRomanization} label={t('lyricsRomanization')} />
              </div>

              <div className="flex items-center justify-between gap-4 pt-3 border-t border-white/[0.06]">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-[#F5F5F0]">{t('lyricsLatinOnly')}</p>
                  <p className="text-xs text-[#9E9E98] mt-0.5">{t('lyricsLatinOnlyHelp')}</p>
                </div>
                <ToggleSwitch checked={lyricLatinOnly} onChange={setLyricLatinOnly} label={t('lyricsLatinOnly')} />
              </div>

              <div className="pt-3 border-t border-white/[0.06] space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-[#F5F5F0]">{t('lyricsTranslation')}</p>
                    <p className="text-xs text-[#9E9E98] mt-0.5">{t('lyricsTranslationHelp')}</p>
                  </div>
                  <ToggleSwitch checked={lyricTranslation} onChange={setLyricTranslation} label={t('lyricsTranslation')} />
                </div>

                <div className={`transition-opacity ${lyricTranslation ? 'opacity-100' : 'opacity-45 pointer-events-none'}`}>
                  <p className="text-xs text-[#9E9E98] mb-2">{t('lyricsTargetLanguage')}</p>
                  <div className="grid grid-cols-3 gap-2">
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
                        className={`px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
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
          )}
        </section>
      </div>

      {/* Bloque 4: Sistema y avanzado */}
      <div className="space-y-4">
        <h2 className="text-xs font-mono uppercase tracking-widest text-[#666660]">
          {t('settingsGroupSystem')}
        </h2>

        {/* Actualizaciones de la aplicación — Android y Desktop */}
        {(isAndroid || isPyWebView) && (
          <section className="p-4 rounded-2xl bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] space-y-3">
            <p className="text-xs font-mono uppercase tracking-wider text-[#9E9E98]">{t('appUpdates')}</p>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[var(--accent-primary)]/10 border border-[var(--accent-primary)]/20 flex items-center justify-center flex-shrink-0">
                <RefreshCw
                  className={`w-4 h-4 ${
                    appUpdateStatus === 'available' ? 'text-[var(--accent-primary)]' : 'text-[#9E9E98]'
                  } ${
                    ['checking', 'downloading', 'validating', 'installing'].includes(appUpdateStatus)
                      ? 'animate-spin text-[var(--accent-primary)]'
                      : ''
                  }`}
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[#F5F5F0]">
                  {t('installedVersion', { version: installedBuild?.versionName ?? '…' })}
                </p>
                <p className="text-xs text-[#9E9E98] mt-0.5">
                  {t('updateChannelActive', {
                    channel: updateChannel === 'experimental'
                      ? t('updateChannelExperimental')
                      : updateChannel === 'beta'
                        ? t('updateChannelBeta')
                        : t('updateChannelStable'),
                  })}
                  {remoteBuild ? ` · ${t('remoteVersion', { version: remoteBuild.versionName })}` : ''}
                </p>
                {appUpdateStatus === 'upToDate' && (
                  <p className="text-xs text-[#9E9E98] mt-1">{t('appUpToDate')}</p>
                )}
                {appUpdateStatus === 'available' && remoteBuild && (
                  <p className="text-xs text-[var(--accent-primary)] mt-1">
                    {t('appUpdateReady', { version: remoteBuild.versionName })}
                  </p>
                )}
                {appUpdateStatus === 'waiting' && remoteBuild && appUpdateDecision?.status === 'waiting' && (
                  <p className="text-xs text-amber-400 mt-1">
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
                  <p className="text-xs text-[var(--accent-primary)] mt-1">
                    {t('appUpdateDownloading', { progress: appUpdateProgress })}
                  </p>
                )}
                {appUpdateStatus === 'validating' && (
                  <p className="text-xs text-[var(--accent-primary)] mt-1">{t('appUpdateValidating')}</p>
                )}
                {appUpdateStatus === 'readyToInstall' && (
                  <p className="text-xs text-[var(--accent-primary)] mt-1">{t('appUpdateValidated')}</p>
                )}
                {appUpdateStatus === 'permissionRequired' && (
                  <p className="text-xs text-amber-400 mt-1">{t('appUpdatePermissionRequired')}</p>
                )}
                {appUpdateStatus === 'installing' && (
                  <p className="text-xs text-[var(--accent-primary)] mt-1">{t('appUpdateInstallerOpened')}</p>
                )}
                {appUpdateStatus === 'error' && (
                  <>
                    <p className="text-xs text-[#9E9E98] mt-1">{t('appUpdateCheckFailed')}</p>
                    {appUpdateError && (
                      <p className="text-[11px] text-red-300 mt-1 break-words">
                        {appUpdateError.code}: {appUpdateError.detail}
                      </p>
                    )}
                  </>
                )}
              </div>
              <div className="flex flex-col gap-2 flex-shrink-0">
                {appUpdateStatus === 'downloading' && (
                  <button
                    type="button"
                    onClick={() => void cancelAvailableUpdateDownload()}
                    className="px-3 py-2 rounded-xl text-xs font-semibold bg-white/[0.06] text-[#F5F5F0]"
                  >
                    {t('cancelUpdateDownload')}
                  </button>
                )}
                {appUpdateStatus === 'permissionRequired' && (
                  <button
                    type="button"
                    onClick={() => void openInstallPermission()}
                    className="px-3 py-2 rounded-xl text-xs font-semibold bg-amber-400 text-[#18181A]"
                  >
                    {t('allowInstallations')}
                  </button>
                )}
                {appUpdateStatus !== 'downloading' && appUpdateStatus !== 'permissionRequired' && (
                  <button
                    type="button"
                    onClick={() => void updateApp()}
                    disabled={appUpdateStatus === 'checking' || appUpdateStatus === 'validating' || appUpdateStatus === 'installing'}
                    className={`px-3 py-2 rounded-xl text-xs font-semibold disabled:opacity-50 transition-colors ${
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

            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/[0.06]">
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
                  className={`px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
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
          </section>
        )}

        {/* Backup y restaurar */}
        <section className="p-4 rounded-2xl bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] flex flex-col gap-3">
          <div>
            <p className="text-sm font-semibold text-[#F5F5F0]">{t('backupRestore')}</p>
            <p className="text-xs text-[#9E9E98] mt-0.5">{t('backupDesc')}</p>
            <p className="text-[11px] text-[#7A7A74] mt-1">{t('backupHowItWorks')}</p>
          </div>
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
              className="flex-1 py-2 rounded-xl bg-[rgba(255,255,255,0.06)] text-xs font-semibold text-[#F5F5F0] border border-[rgba(255,255,255,0.06)] hover:bg-[rgba(255,255,255,0.1)] disabled:opacity-50 transition-colors"
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
                className="flex-1 py-2 rounded-xl bg-[var(--accent-primary)] text-xs font-semibold text-[#18181A] hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {t('importBackup')}
              </button>
            ) : (
              <label className="flex-1 cursor-pointer">
                <div className="w-full text-center py-2 rounded-xl bg-[var(--accent-primary)] text-xs font-semibold text-[#18181A] hover:opacity-90 transition-opacity">
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
        </section>

        {/* Opciones avanzadas (Plegado por defecto) */}
        <section>
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full flex items-center justify-between gap-3 p-4 rounded-2xl bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.12)] transition-all group text-left shadow-sm"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center flex-shrink-0 group-hover:border-[var(--accent-primary)]/30 transition-colors">
                <Zap className="w-4 h-4 text-[#A0A098] group-hover:text-[var(--accent-primary)] transition-colors" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#F5F5F0]">{t('advancedOptions')}</p>
                <p className="text-xs text-[#9E9E98] mt-0.5 truncate">{t('advancedOptionsSubtitle')}</p>
              </div>
            </div>
            <div className="flex-shrink-0">
              {showAdvanced ? (
                <ChevronDown className="w-4 h-4 text-[var(--accent-primary)]" />
              ) : (
                <ChevronRight className="w-4 h-4 text-[#9E9E98] group-hover:text-[#F5F5F0] transition-colors" />
              )}
            </div>
          </button>

          {showAdvanced && (
            <div className="mt-3 space-y-4 animate-in slide-in-from-top-2 fade-in duration-200">
              {/* Descarga Automática */}
              <div className="p-4 rounded-2xl bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.06)]">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-[#F5F5F0]">{t('autoDownload')}</p>
                    <p className="text-xs text-[#9E9E98] mt-0.5">{t('autoDownloadDesc')}</p>
                  </div>
                  <ToggleSwitch
                    checked={autoDownload}
                    onChange={setAutoDownload}
                    label={t('autoDownload')}
                  />
                </div>
              </div>

              {/* Pre-cargar versiones al buscar */}
              <div className="p-4 rounded-2xl bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.06)] space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-[#F5F5F0]">{t('autoCandidateResolution')}</p>
                    <p className="text-xs text-[#9E9E98] mt-0.5">{t('autoCandidateResolutionHelp')}</p>
                  </div>
                  <ToggleSwitch
                    checked={autoCandidateResolution}
                    onChange={setAutoCandidateResolution}
                    label={t('autoCandidateResolution')}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/[0.06]">
                  {(['adaptive', 'economy'] as const).map((profile) => (
                    <button
                      key={profile}
                      type="button"
                      onClick={() => setResolutionProfile(profile)}
                      className={`px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                        resolutionProfile === profile
                          ? 'bg-[var(--accent-primary)] text-[#18181A]'
                          : 'bg-[rgba(255,255,255,0.04)] text-[#B0B0B0] hover:text-[#F5F5F0]'
                      }`}
                    >
                      {t(profile === 'adaptive' ? 'resolutionAdaptive' : 'resolutionEconomy')}
                    </button>
                  ))}
                </div>

                {isAndroid && (
                  <div>
                    <p className="text-xs text-[#9E9E98] mb-2">{t('cellularResolutionPolicy')}</p>
                    <div className="grid grid-cols-3 gap-2">
                      {(['off', 'light', 'full'] as const).map((policy) => (
                        <button
                          key={policy}
                          type="button"
                          onClick={() => setCellularResolutionPolicy(policy)}
                          className={`px-2 py-2 rounded-xl text-xs font-medium transition-colors ${
                            cellularResolutionPolicy === policy
                              ? 'bg-[var(--accent-primary)] text-[#18181A]'
                              : 'bg-[rgba(255,255,255,0.04)] text-[#B0B0B0] hover:text-[#F5F5F0]'
                          }`}
                        >
                          {t(`resolutionCellular${policy[0].toUpperCase()}${policy.slice(1)}`)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Podcasts y Audios Extensos */}
              <div className="p-4 rounded-2xl bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.06)]">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-[#F5F5F0]">{t('allowLongAudioDownloads')}</p>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        {t('thermalCpu')}
                      </span>
                    </div>
                    <p className="text-xs text-[#9E9E98] mt-1">{t('allowLongAudioDownloadsHelp')}</p>
                  </div>
                  <ToggleSwitch
                    checked={allowLongAudioDownloads}
                    onChange={setAllowLongAudioDownloads}
                    label={t('allowLongAudioDownloads')}
                  />
                </div>
              </div>

              {/* Motor de descarga yt-dlp */}
              {(isAndroid || isPyWebView) && (
                <div className="p-4 rounded-2xl bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.06)] flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    ytDlpUpdateAvailable
                      ? 'bg-[var(--accent-primary)]/15 border border-[var(--accent-primary)]/25'
                      : 'bg-white/[0.04] border border-white/[0.08]'
                  }`}>
                    <RefreshCw className={`w-4 h-4 ${ytDlpUpdateAvailable ? 'text-[var(--accent-primary)]' : 'text-[#9E9E98]'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-[#F5F5F0]">yt-dlp</span>
                      <span className="text-xs font-mono text-[#9E9E98]">{ytDlpVersion ?? t('loading')}</span>
                      {ytDlpUpdateAvailable && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--accent-primary)]/20 text-[var(--accent-primary)] border border-[var(--accent-primary)]/30">
                          {t('updateAvailable')}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#9E9E98] mt-0.5">{t('downloadEngineHelp')}</p>
                    {ytDlpUpdateAvailable && (
                      <p className="text-xs text-[var(--accent-primary)] mt-1 font-medium">
                        {t('updateRecommended')}
                      </p>
                    )}
                    {updateStatus === 'done' && (
                      <p className="text-xs text-[var(--accent-primary)] mt-1 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> {t('updatedOk')}
                      </p>
                    )}
                    {updateStatus === 'skipped' && (
                      <p className="text-xs text-[#9E9E98] mt-1">{t('alreadyLatest')}</p>
                    )}
                    {updateStatus === 'error' && (
                      <p className="text-xs text-red-400 mt-1">{t('updateError')}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleUpdate}
                    disabled={ytDlpUpdating}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors shadow-sm flex-shrink-0 ${
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
          )}
        </section>

        {/* Acerca de */}
        <section className="p-4 rounded-2xl bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[var(--accent-primary)]/10 border border-[var(--accent-primary)]/20 flex items-center justify-center flex-shrink-0">
              <Settings className="w-4 h-4 text-[var(--accent-primary)]" />
            </div>
            <div>
              <p className="text-sm text-[#F5F5F0] font-semibold">MHL Music</p>
              <p className="text-xs text-[#9E9E98] mt-0.5">{t('aboutTagline')}</p>
              <a
                href="https://paul-dev.vercel.app"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[#7A7A74] hover:text-[#B0B0A8] mt-1.5 inline-block transition-colors"
              >
                {t('developedBy')}
              </a>
            </div>
          </div>
        </section>
      </div>
    </motion.div>
  );
}
