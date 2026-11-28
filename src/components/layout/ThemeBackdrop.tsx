import type { AppThemeId } from '@/lib/themes/themeCatalog';

/**
 * Escena ambiental única por tema: textura, horizonte o geometría atmosférica sutil
 * que transforma por completo la atmósfera sin restar legibilidad al contenido.
 */
export function ThemeBackdrop({ themeId }: { themeId: AppThemeId }) {
  switch (themeId) {
    case 'acid_cyberpunk':
      return (
        <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden" aria-hidden="true">
          <div
            className="absolute -top-24 -left-16 w-[28rem] h-[28rem] rounded-full blur-[110px] opacity-20 theme-breathe"
            style={{ background: 'radial-gradient(circle, #C8F04B, transparent 70%)' }}
          />
          <div
            className="absolute bottom-[-8rem] right-[-6rem] w-[26rem] h-[26rem] rounded-full blur-[110px] opacity-15"
            style={{ background: 'radial-gradient(circle, #22D3EE, transparent 70%)' }}
          />
          {/* Franjas hazard diagonales ultra-sutiles arriba */}
          <div
            className="absolute inset-x-0 top-0 h-28 opacity-[0.06]"
            style={{
              backgroundImage:
                'repeating-linear-gradient(-45deg, #C8F04B, #C8F04B 8px, transparent 8px, transparent 22px)',
              maskImage: 'linear-gradient(to bottom, black, transparent)',
              WebkitMaskImage: 'linear-gradient(to bottom, black, transparent)',
            }}
          />
        </div>
      );

    case 'oled_sapphire':
      return (
        <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden" aria-hidden="true">
          <svg className="w-full h-full opacity-45" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice">
            <defs>
              <radialGradient id="sapphireNebula" cx="50%" cy="15%" r="60%">
                <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.22" />
                <stop offset="55%" stopColor="#6366F1" stopOpacity="0.08" />
                <stop offset="100%" stopColor="#02050E" stopOpacity="0" />
              </radialGradient>
            </defs>
            <rect width="800" height="600" fill="url(#sapphireNebula)" />
            <circle cx="95" cy="80" r="1.2" fill="#E0F2FE" opacity="0.7" />
            <circle cx="240" cy="45" r="0.9" fill="#38BDF8" opacity="0.6" />
            <circle cx="410" cy="115" r="1.4" fill="#FFFFFF" opacity="0.75" />
            <circle cx="620" cy="60" r="1.1" fill="#A5B4FC" opacity="0.6" />
            <circle cx="725" cy="150" r="1.3" fill="#38BDF8" opacity="0.7" />
            <circle cx="160" cy="230" r="0.8" fill="#FFFFFF" opacity="0.45" />
            <circle cx="540" cy="240" r="1.0" fill="#E0F2FE" opacity="0.5" />
            <circle cx="690" cy="360" r="0.9" fill="#818CF8" opacity="0.45" />
            <circle cx="70" cy="420" r="1.1" fill="#38BDF8" opacity="0.4" />
          </svg>
        </div>
      );

    case 'vaporwave_sunset':
      return (
        <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden" aria-hidden="true">
          {/* Sol synthwave partido en el horizonte inferior */}
          <div
            className="absolute left-1/2 -translate-x-1/2 bottom-16 w-64 h-64 sm:w-80 sm:h-80 rounded-full opacity-25 blur-[1px]"
            style={{
              background: 'linear-gradient(180deg, #FB923C 0%, #F43F5E 65%, #9333EA 100%)',
              maskImage:
                'repeating-linear-gradient(to bottom, black 0px, black 12px, transparent 12px, transparent 18px)',
              WebkitMaskImage:
                'repeating-linear-gradient(to bottom, black 0px, black 12px, transparent 12px, transparent 18px)',
            }}
          />
          {/* Rejilla perspectiva 80s */}
          <div
            className="absolute inset-x-[-20%] bottom-0 h-56 opacity-25"
            style={{
              backgroundImage:
                'linear-gradient(rgba(244, 63, 94, 0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(251, 146, 60, 0.28) 1px, transparent 1px)',
              backgroundSize: '36px 26px',
              transform: 'perspective(360px) rotateX(58deg)',
              transformOrigin: 'bottom center',
              maskImage: 'linear-gradient(to top, black, transparent)',
              WebkitMaskImage: 'linear-gradient(to top, black, transparent)',
            }}
          />
        </div>
      );

    case 'amethyst_royal':
      return (
        <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden" aria-hidden="true">
          <div
            className="absolute -top-24 left-1/2 -translate-x-1/2 w-[34rem] h-[22rem] rounded-full blur-[115px] opacity-25"
            style={{ background: 'radial-gradient(circle, #A855F7 0%, #FBBF24 45%, transparent 75%)' }}
          />
          <svg className="w-full h-full opacity-[0.07]" viewBox="0 0 600 600" preserveAspectRatio="xMidYMid slice">
            <pattern id="royalFacet" width="80" height="80" patternUnits="userSpaceOnUse">
              <path d="M40 0 L80 40 L40 80 L0 40 Z" fill="none" stroke="#E9D5FF" strokeWidth="0.8" />
            </pattern>
            <rect width="600" height="600" fill="url(#royalFacet)" />
          </svg>
        </div>
      );

    case 'emerald_aurora':
      return (
        <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden" aria-hidden="true">
          <div
            className="absolute -top-32 left-[-10%] w-[120%] h-[28rem] opacity-30 blur-[80px] theme-drift"
            style={{
              background:
                'linear-gradient(120deg, transparent 10%, rgba(16, 185, 129, 0.45) 35%, rgba(45, 212, 191, 0.35) 55%, rgba(99, 102, 241, 0.25) 75%, transparent 92%)',
              transform: 'rotate(-8deg)',
            }}
          />
        </div>
      );

    case 'solar_amber':
      return (
        <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden" aria-hidden="true">
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[42rem] h-[42rem] rounded-full opacity-[0.08]"
            style={{
              backgroundImage:
                'repeating-radial-gradient(circle at center, transparent 0px, transparent 10px, #F59E0B 11px, transparent 12px)',
              maskImage: 'radial-gradient(circle, black 35%, transparent 72%)',
              WebkitMaskImage: 'radial-gradient(circle, black 35%, transparent 72%)',
            }}
          />
          <div
            className="absolute -top-20 left-1/2 -translate-x-1/2 w-[30rem] h-[20rem] rounded-full blur-[110px] opacity-20"
            style={{ background: 'radial-gradient(circle, #F59E0B, transparent 70%)' }}
          />
        </div>
      );

    case 'crimson_velocity':
      return (
        <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden" aria-hidden="true">
          {/* Malla de fibra de carbono */}
          <div
            className="absolute inset-0 opacity-25"
            style={{
              backgroundImage:
                'repeating-linear-gradient(45deg, rgba(255,255,255,0.025) 0 2px, transparent 2px 6px), repeating-linear-gradient(-45deg, rgba(255,255,255,0.02) 0 2px, transparent 2px 6px)',
            }}
          />
          {/* Trazos láser de velocidad */}
          <div
            className="absolute top-20 inset-x-0 h-[1px] opacity-30"
            style={{ background: 'linear-gradient(90deg, transparent, #EF4444, transparent)' }}
          />
          <div
            className="absolute bottom-24 inset-x-0 h-[1px] opacity-20"
            style={{ background: 'linear-gradient(90deg, transparent, #F87171, transparent)' }}
          />
        </div>
      );

    case 'oceanic_abyss':
      return (
        <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden" aria-hidden="true">
          <div
            className="absolute bottom-[-6rem] left-1/2 -translate-x-1/2 w-[40rem] h-[24rem] rounded-full blur-[115px] opacity-25 theme-breathe"
            style={{ background: 'radial-gradient(circle, #06B6D4 0%, #2DD4BF 45%, transparent 75%)' }}
          />
          <svg className="w-full h-full opacity-[0.06]" viewBox="0 0 800 400" preserveAspectRatio="none">
            <path d="M0 300 Q200 250 400 300 T800 300" fill="none" stroke="#2DD4BF" strokeWidth="1.5" />
            <path d="M0 335 Q200 285 400 335 T800 335" fill="none" stroke="#06B6D4" strokeWidth="1.2" />
            <path d="M0 370 Q200 320 400 370 T800 370" fill="none" stroke="#2DD4BF" strokeWidth="1" />
          </svg>
        </div>
      );

    case 'matcha_zen':
      return (
        <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden" aria-hidden="true">
          <svg className="w-full h-full opacity-[0.065]" viewBox="0 0 400 400" preserveAspectRatio="xMidYMid slice">
            <pattern id="seigaiha" width="60" height="30" patternUnits="userSpaceOnUse">
              <circle cx="30" cy="30" r="28" fill="none" stroke="#A3E635" strokeWidth="0.8" />
              <circle cx="30" cy="30" r="18" fill="none" stroke="#84CC16" strokeWidth="0.7" />
              <circle cx="0" cy="15" r="28" fill="none" stroke="#A3E635" strokeWidth="0.8" />
              <circle cx="60" cy="15" r="28" fill="none" stroke="#A3E635" strokeWidth="0.8" />
            </pattern>
            <rect width="400" height="400" fill="url(#seigaiha)" />
          </svg>
        </div>
      );

    case 'cotton_candy':
      return (
        <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden" aria-hidden="true">
          <div
            className="absolute -top-20 -right-12 w-[26rem] h-[26rem] rounded-full blur-[100px] opacity-25 theme-breathe"
            style={{ background: 'radial-gradient(circle, #EC4899, transparent 70%)' }}
          />
          <div
            className="absolute bottom-[-6rem] -left-16 w-[28rem] h-[28rem] rounded-full blur-[110px] opacity-22"
            style={{ background: 'radial-gradient(circle, #818CF8, transparent 70%)' }}
          />
        </div>
      );

    case 'matrix_terminal':
      return (
        <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden" aria-hidden="true">
          {/* Scanlines CRT + rejilla fosforescente */}
          <div
            className="absolute inset-0 opacity-35"
            style={{
              backgroundImage:
                'repeating-linear-gradient(0deg, rgba(0,0,0,0.45) 0px, rgba(0,0,0,0.45) 1px, transparent 1px, transparent 3px)',
            }}
          />
          <div
            className="absolute inset-0 opacity-[0.06]"
            style={{
              backgroundImage:
                'linear-gradient(#22C55E 1px, transparent 1px), linear-gradient(90deg, #22C55E 1px, transparent 1px)',
              backgroundSize: '32px 32px',
            }}
          />
        </div>
      );

    case 'titanium_luxury':
      return (
        <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden" aria-hidden="true">
          {/* Textura cepillada + haz diagonal de estudio */}
          <div
            className="absolute inset-0 opacity-[0.05]"
            style={{
              backgroundImage:
                'repeating-linear-gradient(90deg, rgba(226,232,240,0.5) 0px, rgba(226,232,240,0.5) 1px, transparent 1px, transparent 4px)',
            }}
          />
          <div
            className="absolute -top-32 left-1/4 w-[32rem] h-[32rem] rotate-12 opacity-10 blur-[90px]"
            style={{ background: 'linear-gradient(135deg, #FFFFFF, transparent 70%)' }}
          />
        </div>
      );

    case 'original_minimalist':
    default:
      return null;
  }
}
