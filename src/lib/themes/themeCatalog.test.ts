import { describe, it, expect } from 'vitest';
import { APP_THEMES, getTheme, applyThemeToDOM, type AppThemeId } from './themeCatalog';

describe('themeCatalog', () => {
  it('contains exactly 13 unique theme definitions', () => {
    const keys = Object.keys(APP_THEMES);
    expect(keys).toHaveLength(13);
    expect(new Set(keys).size).toBe(13);
  });

  it('provides all mandatory design tokens and distinct mood/radius for every theme', () => {
    for (const [id, theme] of Object.entries(APP_THEMES)) {
      expect(theme.id).toBe(id);
      expect(theme.accentPrimary).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(theme.accentSecondary).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(theme.bgBase).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(theme.bgSurface).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(theme.swatch).toHaveLength(3);
      expect(theme.emoji.length).toBeGreaterThan(0);
      expect(theme.mood.length).toBeGreaterThan(0);
      expect(theme.radius).toMatch(/^\d+px$/);
      expect(theme.nameKey).toBe(`theme_${id}`);
      expect(theme.artworkUrl).toBe(`/themes/${id}.svg`);
      expect(theme.ambientAura.length).toBeGreaterThan(0);
    }
  });

  it('falls back safely to original_minimalist for invalid theme IDs', () => {
    const fallback = getTheme('invalid_theme_xyz' as AppThemeId);
    expect(fallback.id).toBe('original_minimalist');
  });

  it('applies theme variables and radius to the document element without throwing', () => {
    expect(() => applyThemeToDOM('oled_sapphire')).not.toThrow();
    expect(document.documentElement.getAttribute('data-theme')).toBe('oled_sapphire');
    expect(document.documentElement.style.getPropertyValue('--accent-primary')).toBe('#38BDF8');
    expect(document.documentElement.style.getPropertyValue('--theme-radius')).toBe('16px');
  });
});
