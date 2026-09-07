import { describe, expect, it } from 'vitest';
import { resolveEffectiveLanguage, resolveSystemLanguage, translate } from './i18n';
import { getBrowserLanguages, setNativeLocale } from './language';

describe('i18n language resolution', () => {
  it('resolves Spanish system languages to es', () => {
    expect(resolveSystemLanguage(['es-ES'])).toBe('es');
    expect(resolveEffectiveLanguage('system', ['es-MX'])).toBe('es');
  });

  it('resolves English system languages to en', () => {
    expect(resolveSystemLanguage(['en-US'])).toBe('en');
    expect(resolveEffectiveLanguage('system', ['en-GB'])).toBe('en');
  });

  it('falls back unsupported system languages to en', () => {
    expect(resolveSystemLanguage(['fr-FR'])).toBe('en');
    expect(resolveEffectiveLanguage('system', ['ja-JP'])).toBe('en');
  });

  it('manual override wins over system language', () => {
    expect(resolveEffectiveLanguage('es', ['en-US'])).toBe('es');
    expect(resolveEffectiveLanguage('en', ['es-ES'])).toBe('en');
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

  it('translates showMore correctly in English and Spanish', () => {
    expect(translate('es', 'showMore', { count: 4 })).toBe('Ver 4 más');
    expect(translate('en', 'showMore', { count: 4 })).toBe('Show 4 more');
  });

  it('translates newly added notification and popup keys in both languages', () => {
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
});
