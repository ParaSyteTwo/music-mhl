export type ArtistGenre =
  | 'reggaeton'
  | 'latin'
  | 'regional'
  | 'pop'
  | 'hiphop'
  | 'rnb'
  | 'kpop'
  | 'jpop'
  | 'electronic'
  | 'rock'
  | 'alternative'
  | 'metal'
  | 'classic'
  | 'jazz_soul'
  | 'afrobeats'
  | 'brazilian'
  | 'arabic'
  | 'south_asian';

export const GENRE_GROUPS: Record<ArtistGenre, string[]> = {
  reggaeton: [
    'Bad Bunny', 'Feid', 'Karol G', 'J Balvin', 'Daddy Yankee', 'Rauw Alejandro',
    'Anuel AA', 'Myke Towers', 'Jhayco', 'Maluma', 'Ozuna', 'Nicky Jam',
    'Sech', 'Arcángel', 'Don Omar', 'Farruko', 'Young Miko', 'Mora',
  ],
  latin: [
    'Shakira', 'Rosalía', 'C. Tangana', 'Quevedo', 'Bizarrap', 'Duki',
    'Trueno', 'Paulo Londra', 'Nathy Peluso', 'Mon Laferte', 'Natalia Lafourcade',
    'Juan Luis Guerra', 'Carlos Vives', 'Jorge Drexler', 'Bomba Estéreo', 'Zoé',
    'Soda Stereo', 'Caifanes',
  ],
  regional: [
    'Peso Pluma', 'Natanael Cano', 'Fuerza Regida', 'Junior H', 'Carín León',
    'Christian Nodal', 'Grupo Frontera', 'Eslabon Armado', 'Tito Double P',
    'Luis R Conriquez', 'Banda MS', 'Calibre 50', 'Los Ángeles Azules',
    'Intocable', 'Jenni Rivera', 'Vicente Fernández', 'Los Tigres del Norte',
    'La Arrolladora Banda El Limón',
  ],
  pop: [
    'Taylor Swift', 'Dua Lipa', 'Billie Eilish', 'Ariana Grande', 'Harry Styles',
    'Miley Cyrus', 'Olivia Rodrigo', 'Justin Bieber', 'Shawn Mendes',
    'Selena Gomez', 'Ed Sheeran', 'Adele', 'Sabrina Carpenter', 'Charli XCX',
    'Gracie Abrams', 'Tate McRae', 'Benson Boone', 'Chappell Roan',
  ],
  hiphop: [
    'Drake', 'Kendrick Lamar', 'Travis Scott', 'Post Malone', 'Kanye West',
    'Lil Uzi Vert', 'Playboi Carti', 'Future', 'Metro Boomin', 'Tyler The Creator',
    'J. Cole', 'Juice WRLD', 'Lil Nas X', 'Jack Harlow', 'Gunna', 'Lil Baby',
    'Doechii', 'Megan Thee Stallion',
  ],
  rnb: [
    'The Weeknd', 'SZA', 'Beyoncé', 'Rihanna', 'Usher', 'Bruno Mars',
    'H.E.R.', 'Jhené Aiko', 'Summer Walker', 'Giveon', 'Daniel Caesar',
    'Brent Faiyaz', 'Victoria Monét', 'Frank Ocean', 'Steve Lacy', 'Tinashe',
    'Coco Jones', 'Leon Bridges',
  ],
  kpop: [
    'BTS', 'BLACKPINK', 'Stray Kids', 'NewJeans', 'IVE', 'NCT 127',
    'EXO', 'TWICE', 'ITZY', 'aespa', 'Red Velvet', 'SHINee',
    'SEVENTEEN', 'ENHYPEN', 'TXT', 'ATEEZ', 'LE SSERAFIM', 'NMIXX',
    '(G)I-DLE', 'ILLIT', 'BABYMONSTER', 'RIIZE', 'Kiss of Life', 'STAYC',
  ],
  jpop: [
    'Ado', 'YOASOBI', 'LiSA', 'Kenshi Yonezu', 'Tatsuya Kitani', 'Eve',
    'Creepy Nuts', 'King Gnu', 'Official HIGE DANdism', 'Mrs. GREEN APPLE',
    'Fujii Kaze', 'Atarashii Gakko!', 'Aimyon', 'Vaundy', 'milet', 'ReoNa',
    'Hikaru Utada', 'Perfume', 'RADWIMPS', 'ONE OK ROCK', 'BABYMETAL',
    'L’Arc-en-Ciel', 'Asian Kung-Fu Generation', 'TK from Ling tosite sigure',
  ],
  electronic: [
    'Daft Punk', 'David Guetta', 'Calvin Harris', 'Tiësto', 'Martin Garrix',
    'Skrillex', 'deadmau5', 'Avicii', 'Zedd', 'Diplo', 'The Chainsmokers',
    'Kygo', 'Alan Walker', 'Illenium', 'Fred again..', 'Flume', 'ODESZA',
    'Disclosure',
  ],
  rock: [
    'Arctic Monkeys', 'Coldplay', 'Imagine Dragons', 'Twenty One Pilots',
    'Gorillaz', 'Radiohead', 'The Strokes', 'Foo Fighters', 'Muse', 'Green Day',
    'Red Hot Chili Peppers', 'Pearl Jam', 'Linkin Park', 'Paramore',
    'Bring Me The Horizon', 'Maneskin', 'Kings of Leon', 'The Killers',
  ],
  alternative: [
    'Tame Impala', 'Lana Del Rey', 'Phoebe Bridgers', 'Mitski', 'Lorde',
    'Hozier', 'Cigarettes After Sex', 'Beach House', 'Mac DeMarco',
    'The 1975', 'Vampire Weekend', 'Florence + The Machine', 'Bon Iver',
    'FKA twigs', 'St. Vincent', 'Clairo', 'Wallows', 'Japanese Breakfast',
  ],
  metal: [
    'Metallica', 'System Of A Down', 'Slipknot', 'Deftones', 'Iron Maiden',
    'Black Sabbath', 'Megadeth', 'Judas Priest', 'Rammstein', 'Korn',
    'Avenged Sevenfold', 'Tool', 'Pantera', 'Ghost', 'Sleep Token',
    'Spiritbox', 'Gojira', 'Architects',
  ],
  classic: [
    'The Beatles', 'Queen', 'Pink Floyd', 'Led Zeppelin', 'Nirvana',
    'Michael Jackson', 'Prince', 'Whitney Houston', 'Stevie Wonder',
    'The Rolling Stones', 'David Bowie', 'Fleetwood Mac', 'Eagles',
    'Elton John', 'Bob Dylan', 'Bruce Springsteen', 'U2', 'AC/DC',
  ],
  jazz_soul: [
    'Marvin Gaye', 'Aretha Franklin', 'Nina Simone', 'Etta James',
    'Amy Winehouse', 'Ray Charles', 'Sam Cooke', 'Otis Redding',
    'Ella Fitzgerald', 'Louis Armstrong', 'Miles Davis', 'John Coltrane',
    'Norah Jones', 'Diana Krall', 'Laufey', 'Michael Kiwanuka',
    'Khruangbin', 'Yussef Dayes',
  ],
  afrobeats: [
    'Burna Boy', 'Wizkid', 'Tems', 'Davido', 'Rema', 'CKay',
    'Kizz Daniel', 'Fireboy DML', 'Omah Lay', 'Asake', 'Black Sherif',
    'Tiwa Savage', 'Joeboy', 'Ayra Starr', 'Tyla', 'Amaarae',
    'Victony', 'Shallipopi',
  ],
  brazilian: [
    'Anitta', 'Pabllo Vittar', 'Luísa Sonza', 'IZA', 'Jão', 'Ludmilla',
    'Matuê', 'L7NNON', 'Djavan', 'Caetano Veloso', 'Gilberto Gil',
    'Gal Costa', 'Marisa Monte', 'Seu Jorge', 'Liniker', 'BaianaSystem',
    'Os Mutantes', 'Tim Maia',
  ],
  arabic: [
    'Amr Diab', 'Nancy Ajram', 'Elissa', 'Fairuz', 'Kadim Al Sahir',
    'Sherine', 'Tamer Hosny', 'Mohamed Ramadan', 'Marwan Pablo',
    'Wegz', 'Saint Levant', 'Elyanna', 'Balqees', 'Assala', 'Mashrou’ Leila',
    'Cairokee', 'Marcel Khalife', 'Souad Massi',
  ],
  south_asian: [
    'Arijit Singh', 'A. R. Rahman', 'Shreya Ghoshal', 'Diljit Dosanjh',
    'Badshah', 'AP Dhillon', 'Anuv Jain', 'Prateek Kuhad', 'Sid Sriram',
    'Neha Kakkar', 'Atif Aslam', 'Ali Sethi', 'Ritviz', 'DIVINE',
    'King', 'Karan Aujla', 'The Local Train', 'When Chai Met Toast',
  ],
};

function normalizeArtistKey(name: string): string {
  return name.trim().toLocaleLowerCase().normalize('NFKD').replace(/\p{M}/gu, '');
}

export const GLOBAL_ARTISTS_POOL: string[] = [
  ...new Map(
    Object.values(GENRE_GROUPS)
      .flat()
      .map((artist) => [normalizeArtistKey(artist), artist] as const),
  ).values(),
];

const ARTIST_GENRES = new Map<string, ArtistGenre>();
for (const [genre, artists] of Object.entries(GENRE_GROUPS) as [ArtistGenre, string[]][]) {
  for (const artist of artists) ARTIST_GENRES.set(normalizeArtistKey(artist), genre);
}

function artistHash(name: string): number {
  let hash = 2166136261;
  for (let index = 0; index < name.length; index++) {
    hash ^= name.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function artistGenre(name: string): ArtistGenre | null {
  return ARTIST_GENRES.get(normalizeArtistKey(name)) ?? null;
}

const LAUNCH_SEED = Math.floor(Math.random() * 0x7fffffff);

function seededShuffle<T>(values: T[], salt: number): T[] {
  return values
    .map((value, index) => ({
      value,
      order: artistHash(`${LAUNCH_SEED}:${salt}:${index}:${String(value)}`),
    }))
    .sort((left, right) => left.order - right.order)
    .map(({ value }) => value);
}

function roundRobinGenres(
  genres: ArtistGenre[],
  excluded: Set<string>,
  salt: number,
): string[] {
  const orderedGenres = seededShuffle(genres, salt);
  const buckets = orderedGenres.map((genre, index) => (
    seededShuffle(GENRE_GROUPS[genre], salt + index + 1)
      .filter((artist) => !excluded.has(normalizeArtistKey(artist)))
  ));
  const result: string[] = [];
  let row = 0;
  while (buckets.some((bucket) => row < bucket.length)) {
    for (const bucket of buckets) {
      const artist = bucket[row];
      if (artist) result.push(artist);
    }
    row++;
  }
  return result;
}

type AffinityPoolOptions = {
  rotation?: number;
  exclude?: string[];
};

export function buildAffinityPool(
  mostDownloaded: string[],
  count = 15,
  options: AffinityPoolOptions = {},
): string[] {
  const safeCount = Math.max(0, Math.min(count, GLOBAL_ARTISTS_POOL.length));
  const excluded = new Set(
    [...mostDownloaded, ...(options.exclude ?? [])].map(normalizeArtistKey),
  );
  const genreCount = new Map<ArtistGenre, number>();
  for (const artist of mostDownloaded) {
    const genre = artistGenre(artist);
    if (genre) genreCount.set(genre, (genreCount.get(genre) ?? 0) + 1);
  }
  const favorites = [...genreCount.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([genre]) => genre);
  const allGenres = Object.keys(GENRE_GROUPS) as ArtistGenre[];
  const explorationGenres = allGenres.filter((genre) => !favorites.includes(genre));
  const rotation = options.rotation ?? 0;
  const affinityTarget = favorites.length > 0 ? Math.ceil(safeCount * 0.5) : 0;
  const selected = roundRobinGenres(favorites, excluded, rotation * 17 + 3)
    .slice(0, affinityTarget);
  const seen = new Set([...excluded, ...selected.map(normalizeArtistKey)]);
  const exploration = roundRobinGenres(
    explorationGenres.length > 0 ? explorationGenres : allGenres,
    seen,
    rotation * 31 + 11,
  );
  for (const artist of exploration) {
    if (selected.length >= safeCount) break;
    const key = normalizeArtistKey(artist);
    if (seen.has(key)) continue;
    selected.push(artist);
    seen.add(key);
  }
  if (selected.length < safeCount) {
    for (const artist of seededShuffle(GLOBAL_ARTISTS_POOL, rotation * 47 + 19)) {
      const key = normalizeArtistKey(artist);
      if (seen.has(key)) continue;
      selected.push(artist);
      seen.add(key);
      if (selected.length >= safeCount) break;
    }
  }
  return selected;
}

const ARTIST_PALETTES = [
  ['#C8F04B', '#4BE0A8'], ['#63E6FF', '#5B8CFF'], ['#B69CFF', '#F47DFF'],
  ['#FF7DB2', '#FF9E64'], ['#FFD166', '#FF7A59'], ['#72F1B8', '#3CC8FF'],
  ['#FF8A65', '#FFD54F'], ['#8BE9FD', '#BD93F9'], ['#A7F3D0', '#60A5FA'],
  ['#F9A8D4', '#C4B5FD'], ['#FDE68A', '#F97316'], ['#67E8F9', '#34D399'],
  ['#FB7185', '#A78BFA'], ['#D8B4FE', '#38BDF8'], ['#86EFAC', '#FDE047'],
  ['#FCA5A5', '#FDBA74'], ['#93C5FD', '#A5B4FC'], ['#5EEAD4', '#A3E635'],
  ['#F0ABFC', '#FB7185'], ['#FCD34D', '#BEF264'], ['#7DD3FC', '#818CF8'],
  ['#6EE7B7', '#22D3EE'], ['#FDA4AF', '#F0ABFC'], ['#FDBA74', '#FDE68A'],
] as const;

export type ArtistVisual = {
  name: string;
  primary: string;
  secondary: string;
  glow: string;
};

export function buildArtistVisuals(names: string[]): ArtistVisual[] {
  const usedSlots = new Set<number>();
  return names.map((name) => {
    let slot = artistHash(normalizeArtistKey(name)) % ARTIST_PALETTES.length;
    if (usedSlots.size < ARTIST_PALETTES.length) {
      while (usedSlots.has(slot)) slot = (slot + 7) % ARTIST_PALETTES.length;
      usedSlots.add(slot);
    }
    const [primary, secondary] = ARTIST_PALETTES[slot];
    return {
      name,
      primary,
      secondary,
      glow: `${primary}35`,
    };
  });
}
