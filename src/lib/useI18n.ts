import { useMemo } from 'react';
import { translate } from '@/lib/i18n';
import { resolveEffectiveLanguage } from '@/lib/language';
import { useMusicStore } from '@/store/musicStore';

type Vars = Record<string, string | number>;

export function useI18n() {
  const mode = useMusicStore((state) => state.uiLanguageMode);
  const lang = resolveEffectiveLanguage(mode);

  return useMemo(() => ({
    lang,
    mode,
    t: (key: string, vars?: Vars) => translate(lang, key, vars),
  }), [lang, mode]);
}
