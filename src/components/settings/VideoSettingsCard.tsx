import { useMusicStore } from '@/store/musicStore';
import { useI18n } from '@/lib/useI18n';
import type { VideoCodecPreference, VideoQuality } from '@/types/video';

export function VideoSettingsCard() {
  const { t } = useI18n();
  const videoQuality = useMusicStore((s) => s.videoQuality);
  const videoCodec = useMusicStore((s) => s.videoCodec);
  const setVideoQuality = useMusicStore((s) => s.setVideoQuality);
  const setVideoCodec = useMusicStore((s) => s.setVideoCodec);

  const activeQuality = videoQuality || '1080p';
  const activeCodec = videoCodec || 'av1';

  return (
    <section className="p-4 rounded-2xl bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] space-y-4">
      <div>
        <p className="text-sm font-semibold text-[#F5F5F0]">{t('videoSettingsTitle')}</p>
        <p className="text-xs text-[#9E9E98] mt-0.5">{t('videoSettingsHelp')}</p>
      </div>

      <div className="space-y-2 pt-2 border-t border-white/[0.06]">
        <p className="text-xs font-medium text-[#9E9E98]">{t('videoQualityLabel')}</p>
        <div className="grid grid-cols-3 gap-2">
          {(['720p', '1080p', 'best'] as VideoQuality[]).map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => setVideoQuality(q)}
              className={`px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                activeQuality === q
                  ? 'bg-[var(--accent-primary)] text-[#18181A]'
                  : 'bg-[rgba(255,255,255,0.04)] text-[#B0B0B0] hover:text-[#F5F5F0]'
              }`}
            >
              {q === 'best' ? t('videoQualityBest') : q}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2 pt-2 border-t border-white/[0.06]">
        <p className="text-xs font-medium text-[#9E9E98]">{t('videoCodecLabel')}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {(
            [
              {
                id: 'av1',
                title: t('videoCodecAv1'),
                desc: t('videoCodecAv1Desc'),
              },
              {
                id: 'h264',
                title: t('videoCodecH264'),
                desc: t('videoCodecH264Desc'),
              },
            ] as Array<{ id: VideoCodecPreference; title: string; desc: string }>
          ).map((item) => {
            const isActive = activeCodec === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setVideoCodec(item.id)}
                className={`p-3 rounded-xl border text-left transition-all ${
                  isActive
                    ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/10 shadow-sm ring-1 ring-[var(--accent-primary)]/30'
                    : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05]'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className={`text-xs font-bold ${isActive ? 'text-[var(--accent-primary)]' : 'text-[#F5F5F0]'}`}>
                    {item.title}
                  </span>
                  {isActive && (
                    <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-[var(--accent-primary)] text-[#18181A]">
                      {t('formatActive')}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-[#8E8E88] leading-tight">
                  {item.desc}
                </p>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
