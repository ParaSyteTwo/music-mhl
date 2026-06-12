export interface Anime {
  id: number;
  titleRomaji: string;
  titleEnglish: string | null;
  titleNative: string | null;
  cover: string;
  type: 'TV' | 'MOVIE' | 'OVA' | 'SPECIAL';
  episodes: number | null;
  year: number | null;
  synopsis: string | null;
}

export interface AnimeTheme {
  animeId: number;
  type: 'OP' | 'ED';
  sequence: number;
  title: string;
  artist: string;
  episodesFrom: number | null;
  episodesTo: number | null;
  audioUrl: string | null;
  videoUrl: string | null;
}

export interface AnimeSearchResult {
  success: true;
  results: Anime[];
}

export interface AnimeThemesResult {
  success: true;
  themes: AnimeTheme[];
}
