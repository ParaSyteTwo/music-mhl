import { translate } from '@/lib/i18n';
import { resolveEffectiveLanguage, type UiLanguageMode } from '@/lib/language';

export function storeText(mode: UiLanguageMode, key: string, vars?: Record<string, string | number>): string {
  return translate(resolveEffectiveLanguage(mode), key, vars);
}
