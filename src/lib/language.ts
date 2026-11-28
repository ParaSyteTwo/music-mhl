export type Lang = 'es' | 'en' | 'pt' | 'fr' | 'de' | 'it' | 'ja';
export type UiLanguageMode = 'system' | Lang;
export type LyricsTargetLanguage = 'system' | Lang;

export const SUPPORTED_LANGUAGES: readonly Lang[] = ['es', 'en', 'pt', 'fr', 'de', 'it', 'ja'];

let nativeLocale: string | null = null;

export function setNativeLocale(locale: string | null | undefined): void {
  const normalized = locale?.trim() || null;
  if (normalized === nativeLocale) return;
  nativeLocale = normalized;
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('mhl-locale-changed'));
}

export function getBrowserLanguages(): readonly string[] {
  if (nativeLocale) return [nativeLocale];
  if (typeof navigator === 'undefined') return [];
  return navigator.languages?.length ? navigator.languages : [navigator.language].filter(Boolean);
}

export function resolveSystemLanguage(languages: readonly string[] = getBrowserLanguages()): Lang {
  const primary = languages.find(Boolean)?.toLowerCase() ?? '';
  for (const lang of SUPPORTED_LANGUAGES) {
    if (primary.startsWith(lang)) return lang;
  }
  return 'en';
}

export function resolveEffectiveLanguage(
  mode: UiLanguageMode = 'system',
  languages: readonly string[] = getBrowserLanguages(),
): Lang {
  return mode === 'system' ? resolveSystemLanguage(languages) : mode;
}

export function isUiLanguageMode(value: unknown): value is UiLanguageMode {
  return value === 'system' || (typeof value === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(value));
}

export function isLyricsTargetLanguage(value: unknown): value is LyricsTargetLanguage {
  return isUiLanguageMode(value);
}
