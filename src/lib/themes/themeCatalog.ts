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
  badge: string;
  mood: string;
  radius: string;
  gradient: string;
  font: string;
  signatureFx: string;
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
  artworkUrl: string;
  ambientAura: string;
  swatch: [string, string, string]; // [accentPrimary, accentSecondary, bgBase]
};

export const APP_THEMES: Record<AppThemeId, AppTheme> = {
  acid_cyberpunk: {
    id: 'acid_cyberpunk',
    nameKey: 'theme_acid_cyberpunk',
    descKey: 'theme_acid_cyberpunk_desc',
    emoji: '⚡',
    badge: 'CYBER LIME',
    mood: 'Neo-Tokyo',
    radius: '10px',
    gradient: 'linear-gradient(135deg, #C8F04B 0%, #22D3EE 100%)',
    font: 'Syne Bold Cyber',
    signatureFx: '⚡ Resplandor 200W & Franjas Hazard',
    accentPrimary: '#C8F04B',
    accentSecondary: '#22D3EE',
    accentGlow: 'rgba(200, 240, 75, 0.38)',
    bgBase: '#070907',
    bgSurface: '#10140E',
    bgCard: 'rgba(200, 240, 75, 0.035)',
    bgCardHover: 'rgba(200, 240, 75, 0.085)',
    borderSubtle: 'rgba(200, 240, 75, 0.18)',
    tagBg: 'rgba(200, 240, 75, 0.12)',
    tagText: '#C8F04B',
    artworkUrl: '/themes/acid_cyberpunk.svg',
    ambientAura: 'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(200, 240, 75, 0.16), transparent 70%)',
    swatch: ['#C8F04B', '#22D3EE', '#070907'],
  },
  oled_sapphire: {
    id: 'oled_sapphire',
    nameKey: 'theme_oled_sapphire',
    descKey: 'theme_oled_sapphire_desc',
    emoji: '🌌',
    badge: 'COSMIC OLED',
    mood: 'Deep Space',
    radius: '16px',
    gradient: 'linear-gradient(135deg, #38BDF8 0%, #6366F1 100%)',
    font: 'Space Grotesk',
    signatureFx: '💎 Campo Estelar & Cristal Cósmico',
    accentPrimary: '#38BDF8',
    accentSecondary: '#6366F1',
    accentGlow: 'rgba(56, 189, 248, 0.38)',
    bgBase: '#02050E',
    bgSurface: '#070D1D',
    bgCard: 'rgba(56, 189, 248, 0.035)',
    bgCardHover: 'rgba(56, 189, 248, 0.09)',
    borderSubtle: 'rgba(56, 189, 248, 0.18)',
    tagBg: 'rgba(56, 189, 248, 0.12)',
    tagText: '#38BDF8',
    artworkUrl: '/themes/oled_sapphire.svg',
    ambientAura: 'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(56, 189, 248, 0.18), transparent 70%)',
    swatch: ['#38BDF8', '#6366F1', '#02050E'],
  },
  vaporwave_sunset: {
    id: 'vaporwave_sunset',
    nameKey: 'theme_vaporwave_sunset',
    descKey: 'theme_vaporwave_sunset_desc',
    emoji: '🌸',
    badge: 'SYNTHWAVE 80s',
    mood: 'Outrun 80s',
    radius: '24px',
    gradient: 'linear-gradient(135deg, #F43F5E 0%, #FB923C 100%)',
    font: 'Syne Italic Retro',
    signatureFx: '🌅 Sol Outrun & Rejilla Perspectiva',
    accentPrimary: '#F43F5E',
    accentSecondary: '#FB923C',
    accentGlow: 'rgba(244, 63, 94, 0.38)',
    bgBase: '#11060D',
    bgSurface: '#1D0B16',
    bgCard: 'rgba(244, 63, 94, 0.04)',
    bgCardHover: 'rgba(244, 63, 94, 0.09)',
    borderSubtle: 'rgba(244, 63, 94, 0.2)',
    tagBg: 'rgba(244, 63, 94, 0.14)',
    tagText: '#FB923C',
    artworkUrl: '/themes/vaporwave_sunset.svg',
    ambientAura: 'radial-gradient(ellipse 80% 55% at 50% 110%, rgba(244, 63, 94, 0.2), transparent 70%)',
    swatch: ['#F43F5E', '#FB923C', '#11060D'],
  },
  amethyst_royal: {
    id: 'amethyst_royal',
    nameKey: 'theme_amethyst_royal',
    descKey: 'theme_amethyst_royal_desc',
    emoji: '🔮',
    badge: 'ULTRAVIOLET GEM',
    mood: 'Imperial Velvet',
    radius: '20px',
    gradient: 'linear-gradient(135deg, #A855F7 0%, #EAB308 100%)',
    font: 'Cinzel Display',
    signatureFx: '✨ Facetas Cristalinas & Halo Áureo',
    accentPrimary: '#A855F7',
    accentSecondary: '#FBBF24',
    accentGlow: 'rgba(168, 85, 247, 0.38)',
    bgBase: '#0C0514',
    bgSurface: '#170A24',
    bgCard: 'rgba(168, 85, 247, 0.04)',
    bgCardHover: 'rgba(168, 85, 247, 0.09)',
    borderSubtle: 'rgba(192, 132, 252, 0.2)',
    tagBg: 'rgba(168, 85, 247, 0.14)',
    tagText: '#C084FC',
    artworkUrl: '/themes/amethyst_royal.svg',
    ambientAura: 'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(168, 85, 247, 0.18), transparent 70%)',
    swatch: ['#A855F7', '#FBBF24', '#0C0514'],
  },
  emerald_aurora: {
    id: 'emerald_aurora',
    nameKey: 'theme_emerald_aurora',
    descKey: 'theme_emerald_aurora_desc',
    emoji: '🌲',
    badge: 'NORDIC AURORA',
    mood: 'Nordic Sky',
    radius: '20px',
    gradient: 'linear-gradient(135deg, #10B981 0%, #2DD4BF 100%)',
    font: 'Outfit Humanist',
    signatureFx: '🌌 Cortinas Polares en Deriva',
    accentPrimary: '#10B981',
    accentSecondary: '#2DD4BF',
    accentGlow: 'rgba(16, 185, 129, 0.36)',
    bgBase: '#020A06',
    bgSurface: '#071810',
    bgCard: 'rgba(16, 185, 129, 0.035)',
    bgCardHover: 'rgba(16, 185, 129, 0.085)',
    borderSubtle: 'rgba(16, 185, 129, 0.18)',
    tagBg: 'rgba(16, 185, 129, 0.12)',
    tagText: '#34D399',
    artworkUrl: '/themes/emerald_aurora.svg',
    ambientAura: 'radial-gradient(ellipse 80% 50% at 35% -15%, rgba(16, 185, 129, 0.18), transparent 70%)',
    swatch: ['#10B981', '#2DD4BF', '#020A06'],
  },
  solar_amber: {
    id: 'solar_amber',
    nameKey: 'theme_solar_amber',
    descKey: 'theme_solar_amber_desc',
    emoji: '☀️',
    badge: 'ANALOG VINYL',
    mood: 'Analog Vinyl',
    radius: '18px',
    gradient: 'linear-gradient(135deg, #F59E0B 0%, #FDE68A 100%)',
    font: 'Playfair Display',
    signatureFx: '📻 Surcos de Vinilo & Válvula Cálida',
    accentPrimary: '#F59E0B',
    accentSecondary: '#FBBF24',
    accentGlow: 'rgba(245, 158, 11, 0.36)',
    bgBase: '#0E0803',
    bgSurface: '#1B1107',
    bgCard: 'rgba(245, 158, 11, 0.035)',
    bgCardHover: 'rgba(245, 158, 11, 0.085)',
    borderSubtle: 'rgba(245, 158, 11, 0.18)',
    tagBg: 'rgba(245, 158, 11, 0.12)',
    tagText: '#FBBF24',
    artworkUrl: '/themes/solar_amber.svg',
    ambientAura: 'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(245, 158, 11, 0.16), transparent 70%)',
    swatch: ['#F59E0B', '#FBBF24', '#0E0803'],
  },
  crimson_velocity: {
    id: 'crimson_velocity',
    nameKey: 'theme_crimson_velocity',
    descKey: 'theme_crimson_velocity_desc',
    emoji: '🩸',
    badge: 'SUPERCAR CARBON',
    mood: 'Hypercar',
    radius: '6px',
    gradient: 'linear-gradient(135deg, #EF4444 0%, #F97316 100%)',
    font: 'Orbitron Racing',
    signatureFx: '🏎️ Fibra Carbono & Telemetría Escarlata',
    accentPrimary: '#EF4444',
    accentSecondary: '#F87171',
    accentGlow: 'rgba(239, 68, 68, 0.40)',
    bgBase: '#090202',
    bgSurface: '#170606',
    bgCard: 'rgba(239, 68, 68, 0.035)',
    bgCardHover: 'rgba(239, 68, 68, 0.09)',
    borderSubtle: 'rgba(239, 68, 68, 0.22)',
    tagBg: 'rgba(239, 68, 68, 0.14)',
    tagText: '#F87171',
    artworkUrl: '/themes/crimson_velocity.svg',
    ambientAura: 'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(239, 68, 68, 0.18), transparent 70%)',
    swatch: ['#EF4444', '#F87171', '#090202'],
  },
  oceanic_abyss: {
    id: 'oceanic_abyss',
    nameKey: 'theme_oceanic_abyss',
    descKey: 'theme_oceanic_abyss_desc',
    emoji: '🌊',
    badge: 'DEEP OCEAN',
    mood: 'Bioluminescent',
    radius: '20px',
    gradient: 'linear-gradient(135deg, #06B6D4 0%, #2DD4BF 100%)',
    font: 'Space Grotesk',
    signatureFx: '🐠 Cáusticas Abisales & Aura Aqua',
    accentPrimary: '#06B6D4',
    accentSecondary: '#2DD4BF',
    accentGlow: 'rgba(6, 182, 212, 0.36)',
    bgBase: '#020B12',
    bgSurface: '#061722',
    bgCard: 'rgba(6, 182, 212, 0.035)',
    bgCardHover: 'rgba(6, 182, 212, 0.085)',
    borderSubtle: 'rgba(6, 182, 212, 0.18)',
    tagBg: 'rgba(6, 182, 212, 0.12)',
    tagText: '#2DD4BF',
    artworkUrl: '/themes/oceanic_abyss.svg',
    ambientAura: 'radial-gradient(ellipse 80% 50% at 50% 110%, rgba(6, 182, 212, 0.18), transparent 70%)',
    swatch: ['#06B6D4', '#2DD4BF', '#020B12'],
  },
  matcha_zen: {
    id: 'matcha_zen',
    nameKey: 'theme_matcha_zen',
    descKey: 'theme_matcha_zen_desc',
    emoji: '🍵',
    badge: 'ZEN GARDEN',
    mood: 'Kyoto Zen',
    radius: '24px',
    gradient: 'linear-gradient(135deg, #84CC16 0%, #BEF264 100%)',
    font: 'Quicksand Wabi-Sabi',
    signatureFx: '🎍 Ondas Seigaiha & Piedra de Té',
    accentPrimary: '#84CC16',
    accentSecondary: '#A3E635',
    accentGlow: 'rgba(132, 204, 22, 0.30)',
    bgBase: '#0A0C06',
    bgSurface: '#14170D',
    bgCard: 'rgba(132, 204, 22, 0.035)',
    bgCardHover: 'rgba(132, 204, 22, 0.08)',
    borderSubtle: 'rgba(132, 204, 22, 0.17)',
    tagBg: 'rgba(132, 204, 22, 0.12)',
    tagText: '#A3E635',
    artworkUrl: '/themes/matcha_zen.svg',
    ambientAura: 'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(132, 204, 22, 0.13), transparent 70%)',
    swatch: ['#84CC16', '#A3E635', '#0A0C06'],
  },
  cotton_candy: {
    id: 'cotton_candy',
    nameKey: 'theme_cotton_candy',
    descKey: 'theme_cotton_candy_desc',
    emoji: '🍬',
    badge: 'DREAM POP',
    mood: 'Y2K Dream',
    radius: '28px',
    gradient: 'linear-gradient(135deg, #EC4899 0%, #818CF8 100%)',
    font: 'Fredoka Soft',
    signatureFx: '☁️ Nubes Iridiscentes & Glass 28px',
    accentPrimary: '#EC4899',
    accentSecondary: '#818CF8',
    accentGlow: 'rgba(236, 72, 153, 0.38)',
    bgBase: '#110715',
    bgSurface: '#1D0E23',
    bgCard: 'rgba(236, 72, 153, 0.04)',
    bgCardHover: 'rgba(236, 72, 153, 0.09)',
    borderSubtle: 'rgba(236, 72, 153, 0.2)',
    tagBg: 'rgba(236, 72, 153, 0.14)',
    tagText: '#F472B6',
    artworkUrl: '/themes/cotton_candy.svg',
    ambientAura: 'radial-gradient(ellipse 80% 55% at 75% -15%, rgba(236, 72, 153, 0.18), transparent 70%)',
    swatch: ['#EC4899', '#818CF8', '#110715'],
  },
  matrix_terminal: {
    id: 'matrix_terminal',
    nameKey: 'theme_matrix_terminal',
    descKey: 'theme_matrix_terminal_desc',
    emoji: '🛸',
    badge: 'CRT MATRIX',
    mood: 'CRT Mainframe',
    radius: '4px',
    gradient: 'linear-gradient(135deg, #22C55E 0%, #4ADE80 100%)',
    font: 'JetBrains Mono',
    signatureFx: '📟 Scanlines CRT & Retícula Terminal',
    accentPrimary: '#22C55E',
    accentSecondary: '#4ADE80',
    accentGlow: 'rgba(34, 197, 94, 0.38)',
    bgBase: '#020B04',
    bgSurface: '#051408',
    bgCard: 'rgba(34, 197, 94, 0.035)',
    bgCardHover: 'rgba(34, 197, 94, 0.085)',
    borderSubtle: 'rgba(34, 197, 94, 0.24)',
    tagBg: 'rgba(34, 197, 94, 0.12)',
    tagText: '#4ADE80',
    artworkUrl: '/themes/matrix_terminal.svg',
    ambientAura: 'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(34, 197, 94, 0.16), transparent 70%)',
    swatch: ['#22C55E', '#4ADE80', '#020B04'],
  },
  titanium_luxury: {
    id: 'titanium_luxury',
    nameKey: 'theme_titanium_luxury',
    descKey: 'theme_titanium_luxury_desc',
    emoji: '🪙',
    badge: 'TITANIUM STUDIO',
    mood: 'Brushed Metal',
    radius: '10px',
    gradient: 'linear-gradient(135deg, #E2E8F0 0%, #94A3B8 100%)',
    font: 'Outfit Studio',
    signatureFx: '⌚ Metal Cepillado & Platino Studio',
    accentPrimary: '#E2E8F0',
    accentSecondary: '#94A3B8',
    accentGlow: 'rgba(226, 232, 240, 0.26)',
    bgBase: '#0A0B0E',
    bgSurface: '#14161B',
    bgCard: 'rgba(226, 232, 240, 0.03)',
    bgCardHover: 'rgba(226, 232, 240, 0.075)',
    borderSubtle: 'rgba(226, 232, 240, 0.16)',
    tagBg: 'rgba(226, 232, 240, 0.12)',
    tagText: '#E2E8F0',
    artworkUrl: '/themes/titanium_luxury.svg',
    ambientAura: 'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(226, 232, 240, 0.12), transparent 70%)',
    swatch: ['#E2E8F0', '#94A3B8', '#0A0B0E'],
  },
  original_minimalist: {
    id: 'original_minimalist',
    nameKey: 'theme_original_minimalist',
    descKey: 'theme_original_minimalist_desc',
    emoji: '🎧',
    badge: 'STUDIO MINIMAL',
    mood: 'Studio Pure',
    radius: '16px',
    gradient: 'linear-gradient(135deg, #C8F04B 0%, #72F1B8 100%)',
    font: 'DM Sans Clean',
    signatureFx: '🖤 Negro Acústico Mate de Referencia',
    accentPrimary: '#C8F04B',
    accentSecondary: '#A6C955',
    accentGlow: 'rgba(200, 240, 75, 0.26)',
    bgBase: '#080808',
    bgSurface: '#121214',
    bgCard: 'rgba(255, 255, 255, 0.025)',
    bgCardHover: 'rgba(255, 255, 255, 0.055)',
    borderSubtle: 'rgba(255, 255, 255, 0.07)',
    tagBg: 'rgba(255, 255, 255, 0.04)',
    tagText: '#8E8E88',
    artworkUrl: '/themes/original_minimalist.svg',
    ambientAura: 'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(200, 240, 75, 0.09), transparent 70%)',
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
  root.style.setProperty('--theme-radius', theme.radius);

  root.setAttribute('data-theme', theme.id);
  document.body.style.backgroundColor = theme.bgBase;
}
