// Deterministic color system: each artist gets a unique color from the full spectrum.
// Color is based on artist name + genre, always consistent for the same input.

export interface ArtistColor {
  hue: number;       // 0-360
  hex: string;       // CSS hex
  border: string;    // rgba border color
  glow: string;      // rgba glow/shadow
}

// Map genre keywords → preferred hue ranges (in HSL degrees)
const GENRE_HUE_RANGES: [string, number, number][] = [
  // [keyword, hueCenter, hueSpread] — genre maps to a hue range
  ['reggaeton', 15, 20],      // warm orange-red
  ['urbano', 20, 25],         // vibrant orange
  ['latin', 25, 30],          // golden orange
  ['pop', 200, 30],           // bright sky blue
  ['rock', 355, 20],          // deep crimson red
  ['electronic', 185, 25],    // electric cyan
  ['edm', 190, 25],           // neon blue-cyan
  ['hip hop', 45, 25],        // bold gold-orange
  ['rap', 40, 25],            // confident amber
  ['r&b', 280, 25],          // smooth purple-magenta
  ['jazz', 260, 20],          // sophisticated violet
  ['classical', 140, 20],     // elegant teal-green
  ['instrumental', 170, 25],  // calm blue-green
  ['k-pop', 330, 25],        // vibrant hot pink
  ['j-pop', 340, 25],         // sakura pink
  ['anime', 200, 30],         // electric anime blue
  ['indie', 155, 25],         // indie teal
  ['alternative', 165, 25],   // alt blue-green
  ['country', 35, 20],        // warm country gold
  ['sertanejo', 40, 25],      // brazilian gold
  ['trap', 10, 25],           // dark trap red
  ['metal', 0, 20],           // heavy metal black-red
  ['punk', 355, 25],          // punk red
  ['soul', 285, 20],          // deep soul purple
  ['blues', 245, 25],        // mellow blue
  ['funk', 50, 25],          // brazilian funk orange
  ['salsa', 18, 20],         // salsa orange-red
  ['bachata', 22, 18],        // tropical orange
  ['cumbia', 30, 20],         // golden cumbia
  ['merengue', 50, 18],       // festive yellow
  ['corridos', 15, 22],       // mexican orange
  ['romance', 340, 20],       // romantic pink
];

// Deterministic hash: string → 0..1 float
function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    hash = hash >>> 0; // keep as uint32
  }
  return hash / 0xffffffff;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  const s100 = s / 100;
  const l100 = l / 100;
  const a = s100 * Math.min(l100, 1 - l100);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l100 - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function genreToHue(genre: string | undefined): number | null {
  if (!genre) return null;
  const g = genre.toLowerCase();
  for (const [keyword, center, spread] of GENRE_HUE_RANGES) {
    if (g.includes(keyword)) {
      // Spread across the range with deterministic variation
      const t = hashString(genre + keyword) * 2 - 1; // -1 to +1
      return clamp(center + t * spread, 0, 360);
    }
  }
  return null;
}

export function getArtistColor(artist: string, genre?: string): ArtistColor {
  // Priority: genre hue → artist name hash
  let hue: number;

  const genreHue = genreToHue(genre);
  if (genreHue !== null) {
    // Use genre hue, vary by artist name for uniqueness
    const artistVariation = (hashString(artist) - 0.5) * 40;
    hue = (genreHue + artistVariation + 360) % 360;
  } else {
    // Full spectrum spread: artist name determines position on color wheel
    // Use multiple hash rounds for better distribution
    const h1 = hashString(artist) * 360;
    const h2 = hashString(artist + '_v2') * 30 - 15; // slight offset
    hue = (h1 + h2 + 360) % 360;
  }

  // Slight lightness variation per artist for depth
  const lightness = 52 + (hashString(artist + '_l') - 0.5) * 12; // 46-58%
  const saturation = 62 + (hashString(artist + '_s') - 0.5) * 16; // 54-70%

  const hex = hslToHex(hue, saturation, lightness);
  const border = `hsla(${Math.round(hue)}, ${Math.round(saturation)}%, ${Math.round(lightness)}%, 0.35)`;
  const glow = `hsla(${Math.round(hue)}, ${Math.round(saturation)}%, ${Math.round(lightness + 10)}%, 0.25)`;

  return {
    hue: Math.round(hue),
    hex,
    border,
    glow,
  };
}

// Get CSS class for badge styling based on hue
export function getColorClass(hue: number): { bg: string; text: string; ring: string } {
  // Dynamic classes — bg and text adapt to luminance
  const lightness = 52;
  const bg = `hsl(${hue}, 65%, ${lightness}%)`;
  const text = lightness > 55 ? 'hsl(0, 0%, 10%)' : 'hsl(0, 0%, 98%)';
  const ring = `hsl(${hue}, 80%, ${lightness - 8}%)`;
  return { bg, text, ring };
}
