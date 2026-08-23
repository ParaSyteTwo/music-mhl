import { useState, useEffect } from 'react';
import { Settings, Folder, RefreshCw, CheckCircle2, FolderOpen, X, Music2, ChevronDown, ChevronRight, Palette, Zap } from 'lucide-react';
import { motion } from 'framer-motion';
import { useMusicStore } from '@/store/musicStore';
import { useI18n } from '@/lib/useI18n';
import type { LyricsTargetLanguage, UiLanguageMode } from '@/lib/language';
import { APP_THEMES, getTheme, type AppThemeId } from '@/lib/themes/themeCatalog';
import { Capacitor } from '@capacitor/core';
import { isPyWebView } from '@/lib/platform';
import type { AudioPlayer } from '@/lib/openFileBridge';
import { useAppUpdateStore } from '@/store/appUpdateStore';
import { getRemainingSafetyDays } from '@/lib/appUpdatePolicy';

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
        checked ? 'bg-[#C8F04B]' : 'bg-white/15'
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
    editionPreference, setEditionPreference,
    autoDownload, setAutoDownload,
    allowLongAudioDownloads, setAllowLongAudioDownloads,
    appTheme, setAppTheme,
  } = useMusicStore();

  const [updateStatus, setUpdateStatus] = useState<'idle' | 'done' | 'skipped' | 'error'>('idle');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showThemes, setShowThemes] = useState(false);
  const [showDefaultPlayer, setShowDefaultPlayer] = useState(false);
  const [audioPlayers, setAudioPlayers] = useState<AudioPlayer[]>([]);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
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
    // pywebview (Desktop Python): usar diálogo nativo de bridge.py
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="px-4 sm:px-8 py-4 sm:py-10 max-w-3xl mx-auto"
    >
      <h1 className="text-lg sm:text-2xl font-semibold tracking-tighter mb-1 sm:mb-2">{t('settings')}</h1>
      <p className="text-xs sm:text-sm text-[#666660] mb-6 sm:mb-8">{t('appSettingsSubtitle')}</p>

      {/* Apariencia & Temas (Desplegable Coherente con ADN Único) */}
      <section className="mb-6">
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
            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              {Object.values(APP_THEMES).map((theme) => {
                const isActive = (appTheme || 'original_minimalist') === theme.id;
                return (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={() => setAppTheme(theme.id)}
                    className={`group relative flex flex-col p-2.5 sm:p-3 rounded-xl border text-left transition-all overflow-hidden active:scale-95 min-w-0 ${
                      isActive
                        ? 'border-[var(--accent-primary)] bg-white/[0.08] shadow-lg shadow-[var(--accent-glow)] ring-1 ring-[var(--accent-primary)]/50'
                        : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/[0.12]'
                    }`}
                  >
                    {/* Top ambient banner with theme gradient */}
                    <div 
                      className="w-full h-1 sm:h-1.5 rounded-full mb-2 opacity-85 group-hover:opacity-100 transition-opacity flex-shrink-0"
                      style={{ background: theme.gradient }}
                    />
                    
                    <div className="flex items-center justify-between gap-1.5 mb-1.5 w-full">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <div 
                          className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg flex items-center justify-center text-xs sm:text-sm flex-shrink-0 shadow-sm border border-white/10"
                          style={{ background: theme.bgSurface }}
                        >
                          {theme.emoji}
                        </div>
                        <span className="text-[7.5px] sm:text-[8px] font-mono tracking-wider px-1 sm:px-1.5 py-0.5 rounded bg-white/[0.06] text-[#A0A098] uppercase font-bold truncate">
                          {theme.badge}
                        </span>
                      </div>
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

                    <p className={`text-xs font-bold leading-tight mt-0.5 truncate w-full ${isActive ? 'text-[var(--accent-primary)]' : 'text-[#F5F5F0]'}`}>
                      {t(theme.nameKey)}
                    </p>
                    
                    {/* Unique Signature feature & Font tags */}
                    <div className="flex flex-col gap-0.5 mt-1.5 mb-1 w-full min-w-0">
                      <span className="text-[7px] sm:text-[8px] font-semibold px-1 py-0.5 rounded bg-white/[0.05] text-[#D0D0C8] border border-white/[0.05] truncate w-full">
                        {theme.signatureFx}
                      </span>
                      <span className="text-[7px] sm:text-[8px] font-mono px-1 py-0.5 rounded bg-white/[0.03] text-[#8E8E88] truncate w-full">
                        Aa {theme.font}
                      </span>
                    </div>

                    <p className="text-[9px] sm:text-[9.5px] text-[#8E8E88] leading-tight line-clamp-2 mt-0.5 hidden sm:block">
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
      <section className="mb-6">
        <h2 className="text-xs font-mono uppercase tracking-widest text-[#666660] mb-2.5">{t('language')}</h2>
        <div className="p-3.5 sm:p-4 rounded-2xl bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)]">
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
        </div>
      </section>

      {/* Opciones Avanzadas Accordion (Contiene Anime, Descarga Auto, Resolución y Letras) */}
      <section className="mb-6">
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full flex items-center justify-between gap-3 p-4 rounded-2xl bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.12)] transition-all group text-left shadow-sm"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center flex-shrink-0 group-hover:border-[var(--accent-primary)]/30 transition-colors">
              <Zap className="w-4 h-4 text-[#A0A098] group-hover:text-[var(--accent-primary)] transition-colors" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#F5F5F0]">{t('advancedOptions')}</p>
              <p className="text-xs text-[#9E9E98] mt-0.5">Anime, descargas automáticas, resolución y letras</p>
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
            {/* Búsqueda Anime */}
            <div className="p-4 rounded-2xl bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.06)]">
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
            </div>

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

            {/* Podcasts y Audios Extensos */}
            <div className="p-4 rounded-2xl bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.06)] space-y-3">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-[#F5F5F0]">{t('allowLongAudioDownloads')}</p>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      Térmico / CPU
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

            {/* Resolución de Candidatos */}
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
                  <button key={profile} type="button" onClick={() => setResolutionProfile(profile)} className={`px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${resolutionProfile === profile ? 'bg-[var(--accent-primary)] text-[#18181A]' : 'bg-[rgba(255,255,255,0.04)] text-[#B0B0B0] hover:text-[#F5F5F0]'}`}>
                    {t(profile === 'adaptive' ? 'resolutionAdaptive' : 'resolutionEconomy')}
                  </button>
                ))}
              </div>
              <div>
                <p className="text-xs text-[#9E9E98] mb-2">{t('cellularResolutionPolicy')}</p>
                <div className="grid grid-cols-3 gap-2">
                  {(['off', 'light', 'full'] as const).map((policy) => (
                    <button key={policy} type="button" onClick={() => setCellularResolutionPolicy(policy)} className={`px-2 py-2 rounded-xl text-xs font-medium transition-colors ${cellularResolutionPolicy === policy ? 'bg-[var(--accent-primary)] text-[#18181A]' : 'bg-[rgba(255,255,255,0.04)] text-[#B0B0B0] hover:text-[#F5F5F0]'}`}>
                      {t(`resolutionCellular${policy[0].toUpperCase()}${policy.slice(1)}`)}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Detalle de Letras */}
            <div className="p-4 rounded-2xl bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.06)] space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-[#F5F5F0]">{t('lyricsOriginal')}</p>
                  <p className="text-xs text-[#9E9E98] mt-0.5">{t('lyricsOriginalHelp')}</p>
                </div>
                <ToggleSwitch checked={lyricOriginal} onChange={setLyricOriginal} label={t('lyricsOriginal')} />
              </div>
              <div className="flex items-center justify-between gap-4 pt-2 border-t border-white/[0.06]">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-[#F5F5F0]">{t('lyricsRomanization')}</p>
                  <p className="text-xs text-[#9E9E98] mt-0.5">{t('lyricsRomanizationHelp')}</p>
                </div>
                <ToggleSwitch checked={lyricRomanization} onChange={setLyricRomanization} label={t('lyricsRomanization')} />
              </div>
              <div className="flex items-center justify-between gap-4 pt-2 border-t border-white/[0.06]">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-[#F5F5F0]">{t('lyricsLatinOnly')}</p>
                  <p className="text-xs text-[#9E9E98] mt-0.5">{t('lyricsLatinOnlyHelp')}</p>
                </div>
                <ToggleSwitch checked={lyricLatinOnly} onChange={setLyricLatinOnly} label={t('lyricsLatinOnly')} />
              </div>
              <div className="flex items-center justify-between gap-4 pt-2 border-t border-white/[0.06]">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-[#F5F5F0]">{t('lyricsTranslation')}</p>
                  <p className="text-xs text-[#9E9E98] mt-0.5">{t('lyricsTranslationHelp')}</p>
                </div>
                <ToggleSwitch checked={lyricTranslation} onChange={setLyricTranslation} label={t('lyricsTranslation')} />
              </div>
            </div>

            {/* Letras */}
            <section>
              <h2 className="text-xs font-mono uppercase tracking-widest text-[#666660] mb-3">{t('lyrics')}</h2>
              <div className="p-4 rounded-xl bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] space-y-3">
                <div>
                  <p className="text-xs text-[#777] mb-2">{t('lyricsTargetLanguage')}</p>
                  <div className="grid grid-cols-3 gap-2">
                    {([['system', t('languageSystem')], ['es', t('languageSpanish')], ['en', t('languageEnglish')]] as Array<[LyricsTargetLanguage, string]>).map(([mode, label]) => (
                      <button key={mode} type="button" onClick={() => setLyricsTargetLanguage(mode)} className={`px-3 py-2 rounded-lg text-xs font-semibold ${lyricsTargetLanguage === mode ? 'bg-[#C8F04B] text-[#18181A]' : 'bg-[rgba(255,255,255,0.04)] text-[#B0B0B0]'}`}>{label}</button>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            {/* yt-dlp — solo visible en Android, con diseño coherente */}
            {isAndroid && (
              <section>
                <h2 className="text-xs font-semibold uppercase tracking-widest text-[#8A8A8A] mb-2 flex items-center gap-2">
                  {t('downloadEngine')}
                  {ytDlpUpdateAvailable && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#C8F04B]/20 text-[#C8F04B] border border-[#C8F04B]/30">
                      {t('updateAvailable')}
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
                      <p className="text-xs text-[#8A8A8A] mt-0.5">{t('downloadEngineHelp')}</p>
                      {ytDlpUpdateAvailable && (
                        <p className="text-xs text-[#C8F04B] mt-1 font-medium">
                          {t('updateRecommended')}
                        </p>
                      )}
                      {updateStatus === 'done' && (
                        <p className="text-xs text-[#C8F04B] mt-1 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> {t('updatedOk')}
                        </p>
                      )}
                      {updateStatus === 'skipped' && (
                        <p className="text-xs text-[#8A8A8A] mt-1">{t('alreadyLatest')}</p>
                      )}
                      {updateStatus === 'error' && (
                        <p className="text-xs text-red-400 mt-1">{t('updateError')}</p>
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
                      {ytDlpUpdating ? t('updating') : t('update')}
                    </button>
                  </div>
                </div>
              </section>
            )}

            {/* Backup Section */}
            <section>
              <h2 className="text-xs font-mono uppercase tracking-widest text-[#666660] mb-3">{t('backupRestore') || 'BACKUP & RESTORE'}</h2>
              <div className="p-4 rounded-xl bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] flex flex-col gap-4">
                <p className="text-xs text-[#8A8A8A]">
                  {t('backupDesc') || 'Exporta tu historial de descargas para restaurarlo en otro dispositivo. Esto solo guarda la lista de canciones, no los archivos de audio.'}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const state = localStorage.getItem('mhl-store');
                      if (!state) return;
                      const blob = new Blob([state], { type: 'application/json' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `mhl-music-backup-${new Date().toISOString().split('T')[0]}.json`;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                    }}
                    className="flex-1 py-2 rounded-md bg-[#232325] text-xs font-semibold text-[#F5F5F0] border border-[rgba(255,255,255,0.05)] hover:bg-[#2A2A2D]"
                  >
                    {t('exportBackup') || 'Exportar JSON'}
                  </button>
                  <label className="flex-1 cursor-pointer">
                    <div className="w-full text-center py-2 rounded-md bg-[#C8F04B] text-xs font-semibold text-[#18181A] hover:bg-[#d4f56a]">
                      {t('importBackup') || 'Importar JSON'}
                    </div>
                    <input
                      type="file"
                      accept=".json"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = (event) => {
                          try {
                            const data = event.target?.result as string;
                            const parsed = JSON.parse(data);
                            if (parsed && parsed.state && parsed.state.downloads) {
                              localStorage.setItem('mhl-store', data);
                              window.location.reload();
                            } else {
                              alert(t('invalidBackup') || 'El archivo no tiene el formato correcto.');
                            }
                          } catch {
                            alert(t('invalidBackup') || 'El archivo está corrupto.');
                          }
                        };
                        reader.readAsText(file);
                      }}
                    />
                  </label>
                </div>
              </div>
            </section>
          </div>
        )}
      </section>

      <section className="mb-8">
        <h2 className="text-xs font-mono uppercase tracking-widest text-[#666660] mb-3">{t('downloadFolder')}</h2>

        <div className="p-4 rounded-xl bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)]">
          {isAndroid ? (
            <div className="flex items-center gap-3">
              <Folder className="w-5 h-5 text-[#C8F04B] flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-[#F5F5F0] font-medium">{t('androidFolderTitle')}</p>
                <p className="text-xs text-[#666660] mt-0.5">
                  {t('androidFolderHelp')}
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
                    <p className="text-xs text-[#666660] mt-0.5">{t('selectedFolderHelp')}</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-[#F5F5F0] font-medium">{t('noFolderSelected')}</p>
                    <p className="text-xs text-[#666660] mt-0.5">
                      {'showDirectoryPicker' in window
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
                      onClick={clearDownloadFolder}
                      className="p-1.5 rounded-md text-[#666660] hover:text-[#F5F5F0] hover:bg-[rgba(255,255,255,0.06)] transition-colors"
                      title={t('removeFolder')}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={handlePickFolder}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-[#C8F04B] text-[#18181A] hover:bg-[#d4f56a] transition-colors"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    {downloadFolderName ? t('changeFolder') : t('chooseFolder')}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Reproductor predeterminado — solo Android (Desplegable Acordeón) */}
      {isAndroid && (
        <section className="mb-6">
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
                  {/* Opción "Preguntar siempre" */}
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

                  {/* Lista de reproductores instalados */}
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

      {/* yt-dlp — solo visible en Android, con diseño coherente */}
      {isAndroid && (
        <section className="mb-8">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-[#8A8A8A] mb-2">
            {t('appUpdates')}
          </h2>
          <div className="p-4 rounded-lg bg-[#18181A] border border-[#232325] flex items-center gap-3">
            <RefreshCw className={`w-6 h-6 flex-shrink-0 ${
              appUpdateStatus === 'available' ? 'text-[#C8F04B]' : 'text-[#8A8A8A]'
            } ${
              ['checking', 'downloading', 'validating', 'installing'].includes(appUpdateStatus)
                ? 'animate-spin'
                : ''
            }`} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[#F5F5F0]">
                {t('installedVersion', { version: installedBuild?.versionName ?? '…' })}
              </p>
              <p className="text-xs text-[#8A8A8A] mt-1">
                {t('updateChannelActive', {
                  channel: updateChannel === 'beta' ? t('updateChannelBeta') : t('updateChannelStable'),
                })}
                {remoteBuild ? ` · ${t('remoteVersion', { version: remoteBuild.versionName })}` : ''}
              </p>
              {appUpdateStatus === 'upToDate' && (
                <p className="text-xs text-[#8A8A8A] mt-1">{t('appUpToDate')}</p>
              )}
              {appUpdateStatus === 'available' && remoteBuild && (
                <p className="text-xs text-[#C8F04B] mt-1">
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
                <p className="text-xs text-[#C8F04B] mt-1">
                  {t('appUpdateDownloading', { progress: appUpdateProgress })}
                </p>
              )}
              {appUpdateStatus === 'validating' && (
                <p className="text-xs text-[#C8F04B] mt-1">{t('appUpdateValidating')}</p>
              )}
              {appUpdateStatus === 'readyToInstall' && (
                <p className="text-xs text-[#C8F04B] mt-1">{t('appUpdateValidated')}</p>
              )}
              {appUpdateStatus === 'permissionRequired' && (
                <p className="text-xs text-amber-400 mt-1">{t('appUpdatePermissionRequired')}</p>
              )}
              {appUpdateStatus === 'installing' && (
                <p className="text-xs text-[#C8F04B] mt-1">{t('appUpdateInstallerOpened')}</p>
              )}
              {appUpdateStatus === 'error' && (
                <>
                  <p className="text-xs text-[#8A8A8A] mt-1">{t('appUpdateCheckFailed')}</p>
                  {appUpdateError && (
                    <p className="text-[11px] text-red-300 mt-1 break-words">
                      {appUpdateError.code}: {appUpdateError.detail}
                    </p>
                  )}
                </>
              )}
            </div>
            <div className="flex flex-col gap-2">
              {appUpdateStatus === 'downloading' && (
                <button
                  type="button"
                  onClick={() => void cancelAvailableUpdateDownload()}
                  className="px-3 py-2 rounded-md text-xs font-semibold bg-[#232325] text-[#F5F5F0]"
                >
                  {t('cancelUpdateDownload')}
                </button>
              )}
              {appUpdateStatus === 'permissionRequired' && (
                <button
                  type="button"
                  onClick={() => void openInstallPermission()}
                  className="px-3 py-2 rounded-md text-xs font-semibold bg-amber-400 text-[#18181A]"
                >
                  {t('allowInstallations')}
                </button>
              )}
              {appUpdateStatus !== 'downloading' && appUpdateStatus !== 'permissionRequired' && (
                <button
                  type="button"
                  onClick={() => void updateApp()}
                  disabled={appUpdateStatus === 'checking' || appUpdateStatus === 'validating' || appUpdateStatus === 'installing'}
                  className={`px-3 py-2 rounded-md text-xs font-semibold disabled:opacity-50 ${
                    appUpdateStatus === 'available' || appUpdateStatus === 'readyToInstall' || appUpdateStatus === 'error'
                      ? 'bg-[#C8F04B] text-[#18181A]'
                      : 'bg-[#232325] text-[#B0B0B0] hover:text-[#F5F5F0]'
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
          <div className="grid grid-cols-2 gap-2 mt-2">
            {(['stable', 'beta'] as const).map((channel) => (
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
                className={`px-3 py-2 rounded-md text-xs font-semibold transition-colors ${
                  updateChannel === channel
                    ? 'bg-[#C8F04B] text-[#18181A]'
                    : 'bg-[#18181A] border border-[#232325] text-[#8A8A8A]'
                }`}
              >
                {channel === 'stable' ? t('updateChannelStable') : t('updateChannelBeta')}
              </button>
            ))}
          </div>
          <p className="text-xs text-[#666660] mt-2">
            {updateChannel === 'beta' ? t('updateChannelBetaHelp') : t('updateChannelStableHelp')}
          </p>
        </section>
      )}

      {/* About Section */}
      <section className="mb-8">
        <h2 className="text-xs font-mono uppercase tracking-widest text-[#666660] mb-3">{t('about')}</h2>
        <div className="p-4 rounded-xl bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)]">
          <div className="flex items-center gap-3">
            <Settings className="w-5 h-5 text-[#C8F04B] flex-shrink-0" />
            <div>
              <p className="text-sm text-[#F5F5F0] font-medium">MHL Music</p>
              <p className="text-xs text-[#666660] mt-0.5">{t('aboutTagline')}</p>
              <a
                href="https://paul-dev.vercel.app"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs mt-2 block"
                style={{ color: "rgba(102,102,96,0.6)" }}
              >
                {t('developedBy')}
              </a>
            </div>
          </div>
        </div>
      </section>
    </motion.div>
  );
}
