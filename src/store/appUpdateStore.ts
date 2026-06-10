import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Capacitor } from '@capacitor/core';
import { evaluateAppUpdate } from '@/lib/appUpdatePolicy';
import { getInstalledAppIdentity } from '@/lib/appUpdaterBridge';
import {
  addUpdateDownloadProgressListener,
  cancelAndroidUpdateDownload,
  downloadAndroidUpdate,
  inspectDownloadedApk,
  installAndroidUpdate,
  openAndroidInstallPermissionSettings,
} from '@/lib/appUpdaterBridge';
import { fetchLatestOfficialAndroidRelease } from '@/lib/githubAndroidRelease';
import type {
  AppUpdateDecision,
  AppUpdateError,
  AppUpdateStatus,
  InstalledAndroidBuild,
  RemoteAndroidBuild,
} from '@/types/appUpdate';

const AUTO_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

interface AppUpdateState {
  status: AppUpdateStatus;
  installedBuild: InstalledAndroidBuild | null;
  remoteBuild: RemoteAndroidBuild | null;
  decision: AppUpdateDecision | null;
  error: AppUpdateError | null;
  lastCheckedAt: number;
  lastTrustedTimeMs: number;
  dismissedDigest: string | null;
  downloadProgress: number;
  downloadedApkPath: string | null;
  checkForUpdate: (force?: boolean) => Promise<void>;
  downloadAvailableUpdate: () => Promise<void>;
  cancelAvailableUpdateDownload: () => Promise<void>;
  installReadyUpdate: () => Promise<void>;
  openInstallPermission: () => Promise<void>;
  dismissCurrentBuild: () => void;
}

export const useAppUpdateStore = create<AppUpdateState>()(
  persist(
    (set, get) => ({
      status: 'idle',
      installedBuild: null,
      remoteBuild: null,
      decision: null,
      error: null,
      lastCheckedAt: 0,
      lastTrustedTimeMs: 0,
      dismissedDigest: null,
      downloadProgress: 0,
      downloadedApkPath: null,

      checkForUpdate: async (force = false) => {
        if (Capacitor.getPlatform() !== 'android') return;
        const now = Date.now();
        if (!force && now - get().lastCheckedAt < AUTO_CHECK_INTERVAL_MS) return;

        set({ status: 'checking', error: null, lastCheckedAt: now });
        try {
          const [installedResult, releaseResult] = await Promise.all([
            getInstalledAppIdentity(),
            fetchLatestOfficialAndroidRelease(),
          ]);
          if (!installedResult.success) {
            set({ status: 'error', error: installedResult.error });
            return;
          }
          if (!releaseResult.success) {
            set({
              status: 'error',
              error: releaseResult.error,
              installedBuild: installedResult.data,
            });
            return;
          }

          const trustedTimeMs = Math.max(
            get().lastTrustedTimeMs,
            releaseResult.data.trustedTimeMs,
          );
          const decision = evaluateAppUpdate(
            installedResult.data,
            releaseResult.data.build,
            now,
            trustedTimeMs,
          );

          if (decision.status === 'rejected') {
            set({
              status: 'error',
              installedBuild: installedResult.data,
              remoteBuild: releaseResult.data.build,
              decision,
              error: decision.error,
              lastTrustedTimeMs: trustedTimeMs,
            });
            return;
          }

          set({
            status: decision.status,
            installedBuild: installedResult.data,
            remoteBuild: releaseResult.data.build,
            decision,
            error: null,
            lastTrustedTimeMs: trustedTimeMs,
          });
        } catch (error) {
          set({
            status: 'error',
            error: {
              code: 'NETWORK',
              detail: error instanceof Error ? error.message : 'Unexpected update check failure.',
            },
          });
        }
      },

      downloadAvailableUpdate: async () => {
        const state = get();
        if (
          state.status !== 'available' ||
          !state.remoteBuild ||
          !state.installedBuild ||
          state.decision?.status !== 'available'
        ) {
          return;
        }

        set({ status: 'downloading', downloadProgress: 0, error: null });
        let progressListener: Awaited<ReturnType<typeof addUpdateDownloadProgressListener>> = null;
        try {
          const refreshedRelease = await fetchLatestOfficialAndroidRelease();
          if (!refreshedRelease.success) {
            set({ status: 'error', error: refreshedRelease.error });
            return;
          }

          const refreshedBuild = refreshedRelease.data.build;
          const trustedTimeMs = Math.max(
            state.lastTrustedTimeMs,
            refreshedRelease.data.trustedTimeMs,
          );
          set({ lastTrustedTimeMs: trustedTimeMs });
          if (
            refreshedBuild.assetId !== state.remoteBuild.assetId ||
            refreshedBuild.digest !== state.remoteBuild.digest ||
            refreshedBuild.assetSize !== state.remoteBuild.assetSize ||
            refreshedBuild.assetUpdatedAt !== state.remoteBuild.assetUpdatedAt
          ) {
            const changedDecision = evaluateAppUpdate(
              state.installedBuild,
              refreshedBuild,
              Date.now(),
              trustedTimeMs,
            );
            set({
              status: changedDecision.status === 'rejected' ? 'error' : changedDecision.status,
              remoteBuild: refreshedBuild,
              decision: changedDecision,
              error: changedDecision.status === 'rejected'
                ? changedDecision.error
                : null,
            });
            return;
          }

          const refreshedDecision = evaluateAppUpdate(
            state.installedBuild,
            refreshedBuild,
            Date.now(),
            trustedTimeMs,
          );
          if (refreshedDecision.status !== 'available') {
            set({
              status: refreshedDecision.status === 'safetyPeriod' ? 'safetyPeriod' : 'error',
              decision: refreshedDecision,
              error: refreshedDecision.status === 'rejected' ? refreshedDecision.error : null,
            });
            return;
          }

          progressListener = await addUpdateDownloadProgressListener((event) => {
            set({ downloadProgress: Math.max(0, Math.min(100, event.progress)) });
          });
          const downloadResult = await downloadAndroidUpdate({
            url: refreshedBuild.assetUrl,
            assetName: refreshedBuild.assetName,
            expectedDigest: refreshedBuild.digest,
            expectedSize: refreshedBuild.assetSize,
            eligibleAtMs: Date.parse(refreshedDecision.eligibleAt),
            trustedTimeMs,
          });
          if (!downloadResult.success) {
            set(downloadResult.error.code === 'DOWNLOAD_CANCELLED'
              ? { status: 'available', downloadProgress: 0, error: null }
              : { status: 'error', error: downloadResult.error });
            return;
          }

          set({ status: 'validating', downloadProgress: 100 });
          const inspectionResult = await inspectDownloadedApk(downloadResult.data.path);
          if (!inspectionResult.success) {
            set({ status: 'error', error: inspectionResult.error });
            return;
          }
          if (
            inspectionResult.data.digest !== refreshedBuild.digest ||
            inspectionResult.data.versionCode !== refreshedBuild.versionCode ||
            inspectionResult.data.versionName !== refreshedBuild.versionName
          ) {
            set({
              status: 'error',
              error: {
                code: 'CHECKSUM_MISMATCH',
                detail: 'Downloaded APK identity does not match the release metadata.',
              },
            });
            return;
          }

          set({
            status: 'readyToInstall',
            downloadedApkPath: downloadResult.data.path,
            decision: refreshedDecision,
            remoteBuild: refreshedBuild,
            error: null,
          });
        } catch (error) {
          set({
            status: 'error',
            error: {
              code: 'DOWNLOAD_FAILED',
              detail: error instanceof Error ? error.message : 'Unexpected APK download failure.',
            },
          });
        } finally {
          await progressListener?.remove();
        }
      },

      cancelAvailableUpdateDownload: async () => {
        if (get().status !== 'downloading') return;
        const result = await cancelAndroidUpdateDownload();
        if (!result.success) {
          set({ status: 'error', error: result.error });
        }
      },

      installReadyUpdate: async () => {
        const state = get();
        if (
          state.status !== 'readyToInstall' &&
          state.status !== 'permissionRequired'
        ) {
          return;
        }
        if (
          !state.downloadedApkPath ||
          !state.remoteBuild ||
          !state.installedBuild ||
          state.decision?.status !== 'available'
        ) {
          return;
        }

        try {
          const refreshedRelease = await fetchLatestOfficialAndroidRelease();
          if (!refreshedRelease.success) {
            set({ status: 'error', error: refreshedRelease.error });
            return;
          }
          const refreshedBuild = refreshedRelease.data.build;
          const trustedTimeMs = Math.max(
            state.lastTrustedTimeMs,
            refreshedRelease.data.trustedTimeMs,
          );
          set({ lastTrustedTimeMs: trustedTimeMs });
          if (
            refreshedBuild.assetId !== state.remoteBuild.assetId ||
            refreshedBuild.digest !== state.remoteBuild.digest ||
            refreshedBuild.assetSize !== state.remoteBuild.assetSize ||
            refreshedBuild.assetUpdatedAt !== state.remoteBuild.assetUpdatedAt
          ) {
            const changedDecision = evaluateAppUpdate(
              state.installedBuild,
              refreshedBuild,
              Date.now(),
              trustedTimeMs,
            );
            set({
              status: changedDecision.status === 'rejected' ? 'error' : changedDecision.status,
              remoteBuild: refreshedBuild,
              decision: changedDecision,
              downloadedApkPath: null,
              error: changedDecision.status === 'rejected' ? changedDecision.error : null,
            });
            return;
          }

          const refreshedDecision = evaluateAppUpdate(
            state.installedBuild,
            refreshedBuild,
            Date.now(),
            trustedTimeMs,
          );
          if (refreshedDecision.status !== 'available') {
            set({
              status: refreshedDecision.status === 'rejected' ? 'error' : refreshedDecision.status,
              decision: refreshedDecision,
              error: refreshedDecision.status === 'rejected' ? refreshedDecision.error : null,
            });
            return;
          }

          const inspection = await inspectDownloadedApk(state.downloadedApkPath);
          if (!inspection.success) {
            set({ status: 'error', error: inspection.error });
            return;
          }

          const installResult = await installAndroidUpdate({
            path: state.downloadedApkPath,
            expectedDigest: refreshedBuild.digest,
            expectedVersionName: refreshedBuild.versionName,
            expectedVersionCode: refreshedBuild.versionCode,
            eligibleAtMs: Date.parse(refreshedDecision.eligibleAt),
            trustedTimeMs,
          });
          if (!installResult.success) {
            set({
              status: installResult.error.code === 'INSTALL_PERMISSION_REQUIRED'
                ? 'permissionRequired'
                : 'error',
              error: installResult.error,
            });
            return;
          }
          set({ status: 'installing', decision: refreshedDecision, error: null });
        } catch (error) {
          set({
            status: 'error',
            error: {
              code: 'INSTALL_FAILED',
              detail: error instanceof Error ? error.message : 'Unexpected APK install failure.',
            },
          });
        }
      },

      openInstallPermission: async () => {
        const result = await openAndroidInstallPermissionSettings();
        if (!result.success) {
          set({ status: 'error', error: result.error });
        }
      },

      dismissCurrentBuild: () => {
        set({ dismissedDigest: get().remoteBuild?.digest ?? null });
      },
    }),
    {
      name: 'mhl-app-update',
      partialize: (state) => ({
        lastCheckedAt: state.lastCheckedAt,
        lastTrustedTimeMs: state.lastTrustedTimeMs,
        dismissedDigest: state.dismissedDigest,
      }),
    },
  ),
);

export const __testing = {
  AUTO_CHECK_INTERVAL_MS,
};
