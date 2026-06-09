import { describe, expect, it } from 'vitest';
import { resolveEffectiveLanguage, resolveSystemLanguage, translate } from './i18n';

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

  it('falls back to the key for unknown translations', () => {
    expect(translate('es', 'missing.translation.key')).toBe('missing.translation.key');
  });

  it('translates store notifications without React or Zustand', () => {
    expect(translate('es', 'wifiOnlyCancelled')).toContain('solo WiFi');
    expect(translate('en', 'wifiOnlyCancelled')).toContain('WiFi-only');
    expect(translate('en', 'downloadCompletedToast', {
      title: 'Song',
      artist: 'Artist',
    })).toBe('Downloaded: Song - Artist');
  });
});
