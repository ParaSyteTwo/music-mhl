import { X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useI18n } from '@/lib/useI18n';
import { useAppUpdateStore } from '@/store/appUpdateStore';
import { getRemainingSafetyDays } from '@/lib/appUpdatePolicy';

export function AppUpdateNotice() {
  const { t } = useI18n();
  const status = useAppUpdateStore((state) => state.status);
  const remoteBuild = useAppUpdateStore((state) => state.remoteBuild);
  const decision = useAppUpdateStore((state) => state.decision);
  const lastTrustedTimeMs = useAppUpdateStore((state) => state.lastTrustedTimeMs);
  const dismissedDigest = useAppUpdateStore((state) => state.dismissedDigest);
  const dismissCurrentBuild = useAppUpdateStore((state) => state.dismissCurrentBuild);

  const remoteKey = remoteBuild && ('digest' in remoteBuild ? remoteBuild.digest : remoteBuild.versionName);
  if (
    !remoteBuild ||
    dismissedDigest === remoteKey ||
    (status !== 'available' && status !== 'waiting')
  ) {
    return null;
  }

  const message = status === 'waiting' && decision?.status === 'waiting'
    ? t('appUpdateSafetyNotice', {
        version: remoteBuild.versionName,
        days: getRemainingSafetyDays(decision.eligibleAt, lastTrustedTimeMs || Date.now()),
      })
    : t('appUpdateAvailableNotice', { version: remoteBuild.versionName });

  return (
    <div className="relative z-40 flex items-center gap-3 border-b border-[#C8F04B]/20 bg-[#C8F04B]/10 px-4 py-2.5">
      <Link to="/settings" className="flex-1 text-xs font-medium text-[#DDF986]">
        {message}
      </Link>
      <button
        type="button"
        onClick={dismissCurrentBuild}
        aria-label={t('dismiss')}
        className="rounded p-1 text-[#9AAE5A] hover:text-[#F5F5F0]"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
