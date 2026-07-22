import { useEffect, useMemo, useState } from 'react';
import { translate } from '@/lib/i18n';
import { resolveEffectiveLanguage } from '@/lib/language';
import { useMusicStore } from '@/store/musicStore';

type Vars = Record<string, string | number>;

export function useI18n() {
  const [, setLocaleRevision] = useState(0);
  const mode = useMusicStore((state) => state.uiLanguageMode);
  const lang = resolveEffectiveLanguage(mode);

  useEffect(() => {
    const handleLocale = () => setLocaleRevision((revision) => revision + 1);
    window.addEventListener('mhl-locale-changed', handleLocale);
    return () => window.removeEventListener('mhl-locale-changed', handleLocale);
  }, []);

  return useMemo(() => ({
    lang,
    mode,
    t: (key: string, vars?: Vars) => translate(lang, key, vars),
  }), [lang, mode]);
}
