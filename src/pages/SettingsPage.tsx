import { useState, useEffect } from 'react';
import { Settings, Folder, Wifi, RefreshCw, CheckCircle2, FolderOpen, X, Music2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { useMusicStore } from '@/store/musicStore';
import { useI18n } from '@/lib/useI18n';
import type { UiLanguageMode } from '@/lib/language';
import { Capacitor } from '@capacitor/core';
import { isPyWebView } from '@/lib/platform';
import type { AudioPlayer } from '@/lib/openFileBridge';
import { useAppUpdateStore } from '@/store/appUpdateStore';

const isAndroid = Capacitor.getPlatform() === 'android';

export default function SettingsPage() {
  const { t } = useI18n();
  const {
    downloadFolderName, setDownloadFolder, clearDownloadFolder,
    downloadFormat, setDownloadFormat,
    mp3Quality, setMp3Quality,
    downloadWifiOnly, setDownloadWifiOnly,
    ytDlpVersion, ytDlpUpdateAvailable, ytDlpUpdating,
    setYtDlpVersion, setYtDlpUpdateAvailable, setYtDlpUpdating,
    preferredPlayerPackage, setPreferredPlayerPackage,
    lyricOriginal, setLyricOriginal,
    lyricRomanization, setLyricRomanization,
    lyricTranslation, setLyricTranslation,
    saveLrcFile, setSaveLrcFile,
    uiLanguageMode, setUiLanguageMode,
  } = useMusicStore();

  const [updateStatus, setUpdateStatus] = useState<'idle' | 'done' | 'skipped' | 'error'>('idle');
  const [audioPlayers, setAudioPlayers] = useState<AudioPlayer[]>([]);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const appUpdateStatus = useAppUpdateStore((state) => state.status);
  const installedBuild = useAppUpdateStore((state) => state.installedBuild);
  const remoteBuild = useAppUpdateStore((state) => state.remoteBuild);
  const checkForAppUpdate = useAppUpdateStore((state) => state.checkForUpdate);
  const downloadAvailableUpdate = useAppUpdateStore((state) => state.downloadAvailableUpdate);
  const cancelAvailableUpdateDownload = useAppUpdateStore(
    (state) => state.cancelAvailableUpdateDownload,
  );
  const appUpdateProgress = useAppUpdateStore((state) => state.downloadProgress);
  const installReadyUpdate = useAppUpdateStore((state) => state.installReadyUpdate);
  const openInstallPermission = useAppUpdateStore((state) => state.openInstallPermission);
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

      <section className="mb-8">
        <h2 className="text-xs font-mono uppercase tracking-widest text-[#666660] mb-3">{t('language')}</h2>
        <div className="p-4 rounded-xl bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)]">
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
                className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                  uiLanguageMode === mode
                    ? 'bg-[#C8F04B] text-[#18181A]'
                    : 'bg-[rgba(255,255,255,0.04)] text-[#B0B0B0] hover:text-[#F5F5F0]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-xs text-[#666660] mt-3">{t('languageHelp')}</p>
        </div>
      </section>

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
              <span className="text-sm">{t('qualityHigh')}</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="mp3q" value="media" checked={mp3Quality === 'media'} onChange={() => setMp3Quality('media')} />
              <span className="text-sm">{t('qualityMedium')}</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="mp3q" value="baja" checked={mp3Quality === 'baja'} onChange={() => setMp3Quality('baja')} />
              <span className="text-sm">{t('qualityLow')}</span>
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
            <span className="text-sm">{t('wifiOnlyHelp')}</span>
          </label>
        </div>
      </section>

      {/* Letras */}
      <section className="mb-8">
        <h2 className="text-xs font-mono uppercase tracking-widest text-[#666660] mb-3">{t('lyrics')}</h2>
        <div className="p-4 rounded-xl bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] space-y-3">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={lyricOriginal}
              onChange={e => setLyricOriginal(e.target.checked)}
              className="mt-0.5"
            />
            <div>
              <p className="text-sm text-[#F5F5F0]">{t('lyricsOriginal')}</p>
              <p className="text-xs text-[#666660] mt-0.5">{t('lyricsOriginalHelp')}</p>
            </div>
          </label>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={lyricRomanization}
              onChange={e => setLyricRomanization(e.target.checked)}
              className="mt-0.5"
            />
            <div>
              <p className="text-sm text-[#F5F5F0]">{t('lyricsRomanization')}</p>
              <p className="text-xs text-[#666660] mt-0.5">{t('lyricsRomanizationHelp')}</p>
            </div>
          </label>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={lyricTranslation}
              onChange={e => setLyricTranslation(e.target.checked)}
              className="mt-0.5"
            />
            <div>
              <p className="text-sm text-[#F5F5F0]">{t('lyricsTranslation')}</p>
              <p className="text-xs text-[#666660] mt-0.5">{t('lyricsTranslationHelp')}</p>
            </div>
          </label>
          {!lyricOriginal && !lyricRomanization && !lyricTranslation && (
            <p className="text-xs text-[#666660] italic pt-1">{t('lyricsNoneSelected')}</p>
          )}
          {isPyWebView && (
            <label className="flex items-start gap-3 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={saveLrcFile}
                onChange={e => setSaveLrcFile(e.target.checked)}
                className="mt-0.5"
              />
              <div>
                <p className="text-sm text-[#F5F5F0]">{t('saveLrcFile')}</p>
                <p className="text-xs text-[#666660] mt-0.5">{t('saveLrcFileHelp')}</p>
              </div>
            </label>
          )}
        </div>
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

      {/* Reproductor predeterminado — solo Android */}
      {isAndroid && (
        <section className="mb-8">
          <h2 className="text-xs font-mono uppercase tracking-widest text-[#666660] mb-3">{t('defaultPlayer')}</h2>
          <div className="p-4 rounded-xl bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] space-y-3">
            <p className="text-xs text-[#666660]">
              {t('defaultPlayerHelp')}
            </p>

            {loadingPlayers ? (
              <p className="text-xs text-[#444]">{t('loadingPlayers')}</p>
            ) : audioPlayers.length === 0 ? (
              <p className="text-xs text-[#444]">{t('noAudioPlayers')}</p>
            ) : (
              <div className="space-y-2">
                {/* Opción "Preguntar siempre" */}
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="defaultPlayer"
                    checked={preferredPlayerPackage === null}
                    onChange={() => setPreferredPlayerPackage(null)}
                    className="accent-[#C8F04B]"
                  />
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-[rgba(255,255,255,0.06)] flex items-center justify-center flex-shrink-0">
                      <Music2 className="w-4 h-4 text-[#666660]" />
                    </div>
                    <span className="text-sm text-[#F5F5F0]">{t('askAlways')}</span>
                  </div>
                </label>

                {/* Lista de reproductores instalados */}
                {audioPlayers.map((player) => (
                  <label key={player.packageName} className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="radio"
                      name="defaultPlayer"
                      checked={preferredPlayerPackage === player.packageName}
                      onChange={() => setPreferredPlayerPackage(player.packageName)}
                      className="accent-[#C8F04B]"
                    />
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-[rgba(200,240,75,0.08)] flex items-center justify-center flex-shrink-0">
                        <Music2 className="w-4 h-4 text-[#C8F04B]" />
                      </div>
                      <span className="text-sm text-[#F5F5F0]">{player.label}</span>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
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
            } ${appUpdateStatus === 'checking' ? 'animate-spin' : ''}`} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[#F5F5F0]">
                {t('installedVersion', { version: installedBuild?.versionName ?? '1.4.1' })}
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
                <p className="text-xs text-[#8A8A8A] mt-1">{t('appUpdateCheckFailed')}</p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              {appUpdateStatus === 'available' && (
                <button
                  type="button"
                  onClick={() => void downloadAvailableUpdate()}
                  className="px-3 py-2 rounded-md text-xs font-semibold bg-[#C8F04B] text-[#18181A]"
                >
                  {t('downloadUpdate')}
                </button>
              )}
              {appUpdateStatus === 'readyToInstall' && (
                <button
                  type="button"
                  onClick={() => void installReadyUpdate()}
                  className="px-3 py-2 rounded-md text-xs font-semibold bg-[#C8F04B] text-[#18181A]"
                >
                  {t('installUpdate')}
                </button>
              )}
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
              <button
                type="button"
                onClick={() => void checkForAppUpdate(true)}
                disabled={appUpdateStatus === 'checking' || appUpdateStatus === 'downloading' || appUpdateStatus === 'validating' || appUpdateStatus === 'installing'}
                className="px-3 py-2 rounded-md text-xs font-semibold bg-[#232325] text-[#B0B0B0] hover:text-[#F5F5F0] disabled:opacity-50"
              >
                {t('checkUpdates')}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {(['stable', 'beta'] as const).map((channel) => (
              <button
                key={channel}
                type="button"
                onClick={() => void setUpdateChannel(channel)}
                disabled={appUpdateStatus === 'downloading' || appUpdateStatus === 'installing'}
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

      {isAndroid && (
        <section className="mb-8">
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
