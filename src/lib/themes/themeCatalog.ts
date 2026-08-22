export type AppThemeId =
  | 'acid_cyberpunk'
  | 'oled_sapphire'
  | 'vaporwave_sunset'
  | 'amethyst_royal'
  | 'emerald_aurora'
  | 'solar_amber'
  | 'crimson_velocity'
  | 'oceanic_abyss'
  | 'matcha_zen'
  | 'cotton_candy'
  | 'matrix_terminal'
  | 'titanium_luxury'
  | 'original_minimalist';

export type AppTheme = {
  id: AppThemeId;
  nameKey: string;
  descKey: string;
  emoji: string;
  accentPrimary: string;
  accentSecondary: string;
  accentGlow: string;
  bgBase: string;
  bgSurface: string;
  bgCard: string;
  bgCardHover: string;
  borderSubtle: string;
  tagBg: string;
  tagText: string;
  swatch: [string, string, string]; // [accentPrimary, accentSecondary, bgBase]
};

export const APP_THEMES: Record<AppThemeId, AppTheme> = {
  acid_cyberpunk: {
    id: 'acid_cyberpunk',
    nameKey: 'theme_acid_cyberpunk',
    descKey: 'theme_acid_cyberpunk_desc',
    emoji: '⚡',
    accentPrimary: '#C8F04B',
    accentSecondary: '#22C55E',
    accentGlow: 'rgba(200, 240, 75, 0.35)',
    bgBase: '#080808',
    bgSurface: '#11130E',
    bgCard: 'rgba(200, 240, 75, 0.03)',
    bgCardHover: 'rgba(200, 240, 75, 0.08)',
    borderSubtle: 'rgba(200, 240, 75, 0.15)',
    tagBg: 'rgba(200, 240, 75, 0.12)',
    tagText: '#C8F04B',
    swatch: ['#C8F04B', '#22C55E', '#080808'],
  },
  oled_sapphire: {
    id: 'oled_sapphire',
    nameKey: 'theme_oled_sapphire',
    descKey: 'theme_oled_sapphire_desc',
    emoji: '🌌',
    accentPrimary: '#38BDF8',
    accentSecondary: '#3B82F6',
    accentGlow: 'rgba(56, 189, 248, 0.35)',
    bgBase: '#040711',
    bgSurface: '#090F20',
    bgCard: 'rgba(56, 189, 248, 0.03)',
    bgCardHover: 'rgba(56, 189, 248, 0.08)',
    borderSubtle: 'rgba(56, 189, 248, 0.15)',
    tagBg: 'rgba(56, 189, 248, 0.12)',
    tagText: '#38BDF8',
    swatch: ['#38BDF8', '#3B82F6', '#040711'],
  },
  vaporwave_sunset: {
    id: 'vaporwave_sunset',
    nameKey: 'theme_vaporwave_sunset',
    descKey: 'theme_vaporwave_sunset_desc',
    emoji: '🌸',
    accentPrimary: '#F43F5E',
    accentSecondary: '#FB923C',
    accentGlow: 'rgba(244, 63, 94, 0.35)',
    bgBase: '#11060D',
    bgSurface: '#1D0B16',
    bgCard: 'rgba(244, 63, 94, 0.03)',
    bgCardHover: 'rgba(244, 63, 94, 0.08)',
    borderSubtle: 'rgba(244, 63, 94, 0.15)',
    tagBg: 'rgba(244, 63, 94, 0.12)',
    tagText: '#F43F5E',
    swatch: ['#F43F5E', '#FB923C', '#11060D'],
  },
  amethyst_royal: {
    id: 'amethyst_royal',
    nameKey: 'theme_amethyst_royal',
    descKey: 'theme_amethyst_royal_desc',
    emoji: '🔮',
    accentPrimary: '#A855F7',
    accentSecondary: '#C084FC',
    accentGlow: 'rgba(168, 85, 247, 0.35)',
    bgBase: '#0C0514',
    bgSurface: '#180B26',
    bgCard: 'rgba(168, 85, 247, 0.03)',
    bgCardHover: 'rgba(168, 85, 247, 0.08)',
    borderSubtle: 'rgba(168, 85, 247, 0.15)',
    tagBg: 'rgba(168, 85, 247, 0.12)',
    tagText: '#A855F7',
    swatch: ['#A855F7', '#C084FC', '#0C0514'],
  },
  emerald_aurora: {
    id: 'emerald_aurora',
    nameKey: 'theme_emerald_aurora',
    descKey: 'theme_emerald_aurora_desc',
    emoji: '🌲',
    accentPrimary: '#10B981',
    accentSecondary: '#34D399',
    accentGlow: 'rgba(16, 185, 129, 0.35)',
    bgBase: '#030C07',
    bgSurface: '#07190F',
    bgCard: 'rgba(16, 185, 129, 0.03)',
    bgCardHover: 'rgba(16, 185, 129, 0.08)',
    borderSubtle: 'rgba(16, 185, 129, 0.15)',
    tagBg: 'rgba(16, 185, 129, 0.12)',
    tagText: '#10B981',
    swatch: ['#10B981', '#34D399', '#030C07'],
  },
  solar_amber: {
    id: 'solar_amber',
    nameKey: 'theme_solar_amber',
    descKey: 'theme_solar_amber_desc',
    emoji: '☀️',
    accentPrimary: '#F59E0B',
    accentSecondary: '#FBBF24',
    accentGlow: 'rgba(245, 158, 11, 0.35)',
    bgBase: '#0E0904',
    bgSurface: '#1C1208',
    bgCard: 'rgba(245, 158, 11, 0.03)',
    bgCardHover: 'rgba(245, 158, 11, 0.08)',
    borderSubtle: 'rgba(245, 158, 11, 0.15)',
    tagBg: 'rgba(245, 158, 11, 0.12)',
    tagText: '#F59E0B',
    swatch: ['#F59E0B', '#FBBF24', '#0E0904'],
  },
  crimson_velocity: {
    id: 'crimson_velocity',
    nameKey: 'theme_crimson_velocity',
    descKey: 'theme_crimson_velocity_desc',
    emoji: '🩸',
    accentPrimary: '#EF4444',
    accentSecondary: '#F87171',
    accentGlow: 'rgba(239, 68, 68, 0.35)',
    bgBase: '#0A0303',
    bgSurface: '#1A0808',
    bgCard: 'rgba(239, 68, 68, 0.03)',
    bgCardHover: 'rgba(239, 68, 68, 0.08)',
    borderSubtle: 'rgba(239, 68, 68, 0.15)',
    tagBg: 'rgba(239, 68, 68, 0.12)',
    tagText: '#EF4444',
    swatch: ['#EF4444', '#F87171', '#0A0303'],
  },
  oceanic_abyss: {
    id: 'oceanic_abyss',
    nameKey: 'theme_oceanic_abyss',
    descKey: 'theme_oceanic_abyss_desc',
    emoji: '🌊',
    accentPrimary: '#06B6D4',
    accentSecondary: '#2DD4BF',
    accentGlow: 'rgba(6, 182, 212, 0.35)',
    bgBase: '#030D14',
    bgSurface: '#071A26',
    bgCard: 'rgba(6, 182, 212, 0.03)',
    bgCardHover: 'rgba(6, 182, 212, 0.08)',
    borderSubtle: 'rgba(6, 182, 212, 0.15)',
    tagBg: 'rgba(6, 182, 212, 0.12)',
    tagText: '#06B6D4',
    swatch: ['#06B6D4', '#2DD4BF', '#030D14'],
  },
  matcha_zen: {
    id: 'matcha_zen',
    nameKey: 'theme_matcha_zen',
    descKey: 'theme_matcha_zen_desc',
    emoji: '🍵',
    accentPrimary: '#84CC16',
    accentSecondary: '#A3E635',
    accentGlow: 'rgba(132, 204, 22, 0.30)',
    bgBase: '#0C0D08',
    bgSurface: '#16180F',
    bgCard: 'rgba(132, 204, 22, 0.03)',
    bgCardHover: 'rgba(132, 204, 22, 0.08)',
    borderSubtle: 'rgba(132, 204, 22, 0.15)',
    tagBg: 'rgba(132, 204, 22, 0.12)',
    tagText: '#84CC16',
    swatch: ['#84CC16', '#A3E635', '#0C0D08'],
  },
  cotton_candy: {
    id: 'cotton_candy',
    nameKey: 'theme_cotton_candy',
    descKey: 'theme_cotton_candy_desc',
    emoji: '🍬',
    accentPrimary: '#EC4899',
    accentSecondary: '#818CF8',
    accentGlow: 'rgba(236, 72, 153, 0.35)',
    bgBase: '#110814',
    bgSurface: '#1C0F21',
    bgCard: 'rgba(236, 72, 153, 0.03)',
    bgCardHover: 'rgba(236, 72, 153, 0.08)',
    borderSubtle: 'rgba(236, 72, 153, 0.15)',
    tagBg: 'rgba(236, 72, 153, 0.12)',
    tagText: '#EC4899',
    swatch: ['#EC4899', '#818CF8', '#110814'],
  },
  matrix_terminal: {
    id: 'matrix_terminal',
    nameKey: 'theme_matrix_terminal',
    descKey: 'theme_matrix_terminal_desc',
    emoji: '🛸',
    accentPrimary: '#22C55E',
    accentSecondary: '#4ADE80',
    accentGlow: 'rgba(34, 197, 94, 0.35)',
    bgBase: '#020B04',
    bgSurface: '#051408',
    bgCard: 'rgba(34, 197, 94, 0.03)',
    bgCardHover: 'rgba(34, 197, 94, 0.08)',
    borderSubtle: 'rgba(34, 197, 94, 0.15)',
    tagBg: 'rgba(34, 197, 94, 0.12)',
    tagText: '#22C55E',
    swatch: ['#22C55E', '#4ADE80', '#020B04'],
  },
  titanium_luxury: {
    id: 'titanium_luxury',
    nameKey: 'theme_titanium_luxury',
    descKey: 'theme_titanium_luxury_desc',
    emoji: '🪙',
    accentPrimary: '#E2E8F0',
    accentSecondary: '#94A3B8',
    accentGlow: 'rgba(226, 232, 240, 0.25)',
    bgBase: '#0B0C0E',
    bgSurface: '#15171C',
    bgCard: 'rgba(226, 232, 240, 0.03)',
    bgCardHover: 'rgba(226, 232, 240, 0.08)',
    borderSubtle: 'rgba(226, 232, 240, 0.15)',
    tagBg: 'rgba(226, 232, 240, 0.12)',
    tagText: '#E2E8F0',
    swatch: ['#E2E8F0', '#94A3B8', '#0B0C0E'],
  },
  original_minimalist: {
    id: 'original_minimalist',
    nameKey: 'theme_original_minimalist',
    descKey: 'theme_original_minimalist_desc',
    emoji: '🎧',
    accentPrimary: '#C8F04B',
    accentSecondary: '#A6C955',
    accentGlow: 'rgba(200, 240, 75, 0.25)',
    bgBase: '#080808',
    bgSurface: '#121214',
    bgCard: 'rgba(255, 255, 255, 0.025)',
    bgCardHover: 'rgba(255, 255, 255, 0.055)',
    borderSubtle: 'rgba(255, 255, 255, 0.06)',
    tagBg: 'rgba(255, 255, 255, 0.04)',
    tagText: '#8E8E88',
    swatch: ['#C8F04B', '#A6C955', '#080808'],
  },
};

export const DEFAULT_THEME_ID: AppThemeId = 'original_minimalist';

export function getTheme(themeId?: AppThemeId | string): AppTheme {
  if (themeId && themeId in APP_THEMES) {
    return APP_THEMES[themeId as AppThemeId];
  }
  return APP_THEMES[DEFAULT_THEME_ID];
}

export function applyThemeToDOM(themeId?: AppThemeId | string) {
  if (typeof document === 'undefined') return;
  const theme = getTheme(themeId);
  const root = document.documentElement;

  root.style.setProperty('--accent-primary', theme.accentPrimary);
  root.style.setProperty('--accent-secondary', theme.accentSecondary);
  root.style.setProperty('--accent-glow', theme.accentGlow);
  root.style.setProperty('--bg-base', theme.bgBase);
  root.style.setProperty('--bg-surface', theme.bgSurface);
  root.style.setProperty('--bg-card', theme.bgCard);
  root.style.setProperty('--bg-card-hover', theme.bgCardHover);
  root.style.setProperty('--border-subtle', theme.borderSubtle);
  root.style.setProperty('--tag-bg', theme.tagBg);
  root.style.setProperty('--tag-text', theme.tagText);

  root.setAttribute('data-theme', theme.id);
  document.body.style.backgroundColor = theme.bgBase;
}
