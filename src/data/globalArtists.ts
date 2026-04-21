// ─── Pool global de artistas (~150) agrupados por género ───────────────────────
export type ArtistGenre = 'reggaeton' | 'pop' | 'hiphop' | 'kpop' | 'electronic' | 'classic' | 'rnb' | 'rock' | 'latin' | 'afrobeats';

export const GENRE_GROUPS: Record<ArtistGenre, string[]> = {
  reggaeton: [
    'Bad Bunny', 'Peso Pluma', 'Feid', 'Karol G', 'J Balvin', 'Daddy Yankee',
    'Rauw Alejandro', 'Anuel AA', 'Myke Towers', 'Jhay Cortez', 'Duki',
    'Camilo', 'Maluma', 'Ozuna', 'Nicky Jam', 'Sech', 'Arcángel',
    'Don Omar', 'Farruko', 'Lunay',
  ],
  pop: [
    'Taylor Swift', 'Dua Lipa', 'Billie Eilish', 'Ariana Grande', 'Harry Styles',
    'Miley Cyrus', 'Olivia Rodrigo', 'Justin Bieber', 'Shawn Mendes', 'Selena Gomez',
    'Ed Sheeran', 'Adele', 'Sam Smith', 'Lizzo', 'Doja Cat', 'Sabrina Carpenter',
    'Charli XCX', 'Gracie Abrams', 'Tate McRae', 'Benson Boone',
  ],
  hiphop: [
    'Drake', 'Kendrick Lamar', 'Travis Scott', 'Post Malone', 'Kanye West',
    'Lil Uzi Vert', 'Lil Nas X', 'Playboi Carti', 'Future', 'Metro Boomin',
    'Tyler The Creator', 'Frank Ocean', 'J. Cole', 'Juice WRLD', 'XXXTentacion',
    'Jack Harlow', 'Rod Wave', 'Gunna', 'Lil Baby',
  ],
  kpop: [
    'BTS', 'BLACKPINK', 'Stray Kids', 'NewJeans', 'IVE',
    'NCT', 'EXO', 'TWICE', 'ITZY', 'aespa',
    'Red Velvet', 'SHINee', 'GOT7', 'Monsta X', 'Seventeen',
    'ENHYPEN', 'TXT', 'Ateez', 'Le Sserafim', 'Girls Generation',
  ],
  electronic: [
    'Daft Punk', 'David Guetta', 'Calvin Harris', 'Marshmello', 'Tiësto',
    'Martin Garrix', 'Skrillex', 'Deadmau5', 'Avicii', 'Zedd',
    'Diplo', 'The Chainsmokers', 'Kygo', 'Alan Walker', 'Illenium',
  ],
  classic: [
    'The Beatles', 'Queen', 'Pink Floyd', 'Led Zeppelin', 'Nirvana',
    'Michael Jackson', 'Prince', 'Whitney Houston', 'Marvin Gaye', 'Stevie Wonder',
    'Rolling Stones', 'David Bowie', 'Fleetwood Mac', 'Eagles', 'Elton John',
    'Bob Dylan', 'Bruce Springsteen', 'U2', 'Metallica', 'AC/DC',
  ],
  rnb: [
    'The Weeknd', 'SZA', 'Beyoncé', 'Rihanna', 'Usher',
    'Bruno Mars', 'H.E.R.', 'Jhené Aiko', 'Summer Walker', 'Chloe Bailey',
    'Giveon', 'Daniel Caesar', 'Brent Faiyaz', 'Lucky Daye', 'Victoria Monét',
  ],
  rock: [
    'Arctic Monkeys', 'Coldplay', 'Imagine Dragons', 'Twenty One Pilots', 'Gorillaz',
    'Radiohead', 'Tame Impala', 'The Strokes', 'Foo Fighters', 'Muse',
    'Green Day', 'Red Hot Chili Peppers', 'Pearl Jam', 'Linkin Park', 'System Of A Down',
  ],
  latin: [
    'Shakira', 'Rosalía', 'Jorge Drexler', 'C. Tangana', 'Quevedo',
    'Bizarrap', 'Trueno', 'Paulo Londra', 'Nathy Peluso', 'Paloma Mami',
    'Mon Laferte', 'Natalia Lafourcade', 'Juan Luis Guerra', 'Carlos Vives',
  ],
  afrobeats: [
    'Burna Boy', 'Wizkid', 'Tems', 'Davido', 'Rema',
    'Ckay', 'Kizz Daniel', 'Fireboy DML', 'Omah Lay', 'Asake',
    'Black Sherif', 'Afro B', 'Tiwa Savage', 'WizKid', 'Joeboy',
  ],
};

// Pool plano sin duplicados
export const GLOBAL_ARTISTS_POOL: string[] = [
  ...new Set(Object.values(GENRE_GROUPS).flat()),
];

// ─── Color único e irrepetible por artista ────────────────────────────────────
// Usa hash del nombre para generar un ángulo HSL que cubre todo el espectro.
// El mismo artista siempre recibe el mismo color en cualquier dispositivo.
export function artistColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = Math.imul(31, hash) + name.charCodeAt(i) | 0;
  }
  const hue = ((Math.abs(hash) % 360) + 360) % 360;
  // Saturación alta y luminosidad media-alta para que se vea sobre fondo oscuro
  return `hsl(${hue}, 80%, 68%)`;
}

// ─── Género de un artista ──────────────────────────────────────────────────────
export function artistGenre(name: string): ArtistGenre | null {
  for (const [genre, artists] of Object.entries(GENRE_GROUPS) as [ArtistGenre, string[]][]) {
    if (artists.includes(name)) return genre;
  }
  return null;
}

// ─── Seed único por lanzamiento de la app (cambia en cada apertura) ───────────
const LAUNCH_SEED = Math.floor(Math.random() * 1_000_000);

// Shuffle estable en la sesión pero diferente en cada lanzamiento
function seededShuffle<T>(arr: T[]): T[] {
  return [...arr.map((v, i) => ({
    v,
    key: Math.abs(Math.sin(LAUNCH_SEED * 9301 + i * 49297 + 233280)) % 1,
  }))]
    .sort((a, b) => a.key - b.key)
    .map(({ v }) => v);
}

// ─── Pool personalizado con afinidad ──────────────────────────────────────────
// Recibe los artistas más descargados por el usuario y devuelve un pool
// mezclado que favorece (pero no limita a) sus géneros preferidos.
export function buildAffinityPool(mostDownloaded: string[], count = 15): string[] {
  // Detectar géneros favoritos del usuario
  const genreCount: Partial<Record<ArtistGenre, number>> = {};
  for (const artist of mostDownloaded) {
    const g = artistGenre(artist);
    if (g) genreCount[g] = (genreCount[g] ?? 0) + 1;
  }

  const favoriteGenres = (Object.entries(genreCount) as [ArtistGenre, number][])
    .sort((a, b) => b[1] - a[1])
    .map(([g]) => g)
    .slice(0, 2);

  // Separar artistas en favoritos y el resto
  const affineArtists = favoriteGenres.flatMap((g) => GENRE_GROUPS[g]);
  const otherArtists = GLOBAL_ARTISTS_POOL.filter((a) => !affineArtists.includes(a));

  // Mezclar: 60% afines + 40% variados (rotación aleatoria por lanzamiento)
  const affineSlice = seededShuffle(affineArtists).slice(0, Math.ceil(count * 0.6));
  const otherSlice = seededShuffle(otherArtists).slice(0, Math.floor(count * 0.4));

  // Combinar y quitar los ya descargados del resultado visible
  const combined = [...affineSlice, ...otherSlice]
    .filter((a) => !mostDownloaded.includes(a))
    .slice(0, count);

  // Deduplicate before returning
  const seen = new Set<string>();
  const unique = combined.filter((a) => {
    if (seen.has(a)) return false;
    seen.add(a);
    return true;
  });

  if (unique.length >= count) return unique.slice(0, count);

  // Need more — add from pool excluding already-seen
  const extras = seededShuffle(GLOBAL_ARTISTS_POOL).filter((a) => !seen.has(a));
  return [...unique, ...extras].slice(0, count);
}
