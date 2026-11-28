import { describe, expect, it } from 'vitest';
import { resolveEffectiveLanguage, resolveSystemLanguage, translate, translations } from './i18n';
import { getBrowserLanguages, setNativeLocale, SUPPORTED_LANGUAGES } from './language';

describe('i18n language resolution', () => {
  it('resolves all 7 supported system languages and falls back others to en', () => {
    expect(SUPPORTED_LANGUAGES).toEqual(['es', 'en', 'pt', 'fr', 'de', 'it', 'ja']);
    expect(resolveSystemLanguage(['es-ES'])).toBe('es');
    expect(resolveEffectiveLanguage('system', ['es-MX'])).toBe('es');
    expect(resolveSystemLanguage(['en-US'])).toBe('en');
    expect(resolveEffectiveLanguage('system', ['en-GB'])).toBe('en');
    expect(resolveSystemLanguage(['pt-BR'])).toBe('pt');
    expect(resolveSystemLanguage(['fr-FR'])).toBe('fr');
    expect(resolveSystemLanguage(['de-DE'])).toBe('de');
    expect(resolveSystemLanguage(['it-IT'])).toBe('it');
    expect(resolveSystemLanguage(['ja-JP'])).toBe('ja');
    expect(resolveSystemLanguage(['ko-KR'])).toBe('en');
  });

  it('manual override wins over system language for any supported locale', () => {
    expect(resolveEffectiveLanguage('es', ['en-US'])).toBe('es');
    expect(resolveEffectiveLanguage('en', ['es-ES'])).toBe('en');
    expect(resolveEffectiveLanguage('fr', ['es-ES'])).toBe('fr');
    expect(resolveEffectiveLanguage('ja', ['en-US'])).toBe('ja');
  });

  it('prefers the native bridge locale over WebView navigator language', () => {
    setNativeLocale('es-ES');
    expect(getBrowserLanguages()).toEqual(['es-ES']);
    expect(resolveEffectiveLanguage('system')).toBe('es');
    setNativeLocale(null);
  });

  it('falls back to the key for unknown translations', () => {
    expect(translate('es', 'missing.translation.key')).toBe('missing.translation.key');
  });

  it('translates store notifications without React or Zustand', () => {
    expect(translate('en', 'downloadCompletedToast', {
      title: 'Song',
      artist: 'Artist',
    })).toBe('Downloaded: Song - Artist');
  });

  it('translates core keys across all 7 languages', () => {
    for (const lang of SUPPORTED_LANGUAGES) {
      expect(translate(lang, 'search')).not.toBe('search');
      expect(translate(lang, 'downloads')).not.toBe('downloads');
      expect(translate(lang, 'settings')).not.toBe('settings');
      expect(translate(lang, 'playLocal')).not.toBe('playLocal');
      expect(translate(lang, 'checkMissingDownloads')).not.toBe('checkMissingDownloads');
    }
    expect(translate('es', 'showMore', { count: 4 })).toBe('Ver 4 más');
    expect(translate('en', 'showMore', { count: 4 })).toBe('Show 4 more');
    expect(translate('ja', 'settings')).toBe('設定');
  });

  it('translates newly added notification and popup keys in es and en', () => {
    const keys = [
      'searchFallbackCatalog',
      'searchUnstableFallback',
      'errorGettingCandidates',
      'errorDownloadingAudio',
      'pasteFromClipboard',
      'pasteLink',
      'advancedOptionsSubtitle',
      'thermalCpu',
      'formatActive',
      'corruptBackup',
      'rateLimitCooldown',
      'foregroundDownloading',
      'downloadFailed',
      'themeFetchError',
    ];

    for (const key of keys) {
      const esVal = translate('es', key, { seconds: 5 });
      const enVal = translate('en', key, { seconds: 5 });
      expect(esVal).not.toBe(key);
      expect(enVal).not.toBe(key);
      expect(esVal).not.toBe(enVal);
    }
  });

  it('has 100% key parity, non-empty strings, and identical placeholders across all 7 languages', () => {
    const enKeys = Object.keys(translations.en).sort();
    expect(Object.keys(translations.es).sort()).toEqual(enKeys);

    const extractPlaceholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

    for (const lang of SUPPORTED_LANGUAGES) {
      const dict = translations[lang];
      expect(Object.keys(dict).sort()).toEqual(enKeys);
      for (const key of enKeys) {
        expect(dict[key].trim().length, `${lang}.${key} should be non-empty`).toBeGreaterThan(0);
        expect(extractPlaceholders(dict[key]), `${lang}.${key} placeholders`).toEqual(
          extractPlaceholders(translations.en[key]),
        );
      }
    }
  });

  it('does not leave key UI sections untranslated in pt, fr, de, it, or ja', () => {
    const uiKeys = [
      'candidateResultsTitle',
      'backupDesc',
      'videoSettingsTitle',
      'collectionDownloadAll',
      'appUpdateAvailableNotice',
      'longAudioBlocked',
      'animeDownloadSeason',
    ];
    for (const lang of ['pt', 'fr', 'de', 'it', 'ja'] as const) {
      for (const key of uiKeys) {
        expect(translations[lang][key], `${lang}.${key} should be translated`).not.toBe(translations.en[key]);
      }
    }
  });
});
