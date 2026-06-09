export type Lang = 'es' | 'en';
export type UiLanguageMode = 'system' | Lang;

export function getBrowserLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') return [];
  return navigator.languages?.length ? navigator.languages : [navigator.language].filter(Boolean);
}

export function resolveSystemLanguage(languages: readonly string[] = getBrowserLanguages()): Lang {
  const primary = languages.find(Boolean)?.toLowerCase() ?? '';
  if (primary.startsWith('es')) return 'es';
  if (primary.startsWith('en')) return 'en';
  return 'en';
}

export function resolveEffectiveLanguage(
  mode: UiLanguageMode = 'system',
  languages: readonly string[] = getBrowserLanguages(),
): Lang {
  return mode === 'system' ? resolveSystemLanguage(languages) : mode;
}

export function isUiLanguageMode(value: unknown): value is UiLanguageMode {
  return value === 'system' || value === 'es' || value === 'en';
}
