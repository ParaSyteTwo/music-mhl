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
  seasonNumber?: number;
  seasonTitle?: string;
  malId?: number | null;
}

export interface AnimeSeason {
  anilistId: number;
  malId: number | null;
  seasonNumber: number;
  titleRomaji: string;
  titleEnglish: string | null;
  year: number | null;
  episodes: number | null;
  cover: string;
  themes: AnimeTheme[];
}
