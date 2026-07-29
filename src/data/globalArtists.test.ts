import { describe, expect, it } from 'vitest';
import {
  GLOBAL_ARTISTS_POOL,
  artistGenre,
  buildAffinityPool,
  buildArtistVisuals,
} from './globalArtists';

function normalized(name: string): string {
  return name.toLocaleLowerCase().normalize('NFKD').replace(/\p{M}/gu, '');
}

describe('global artist discovery pool', () => {
  it('contains more than 300 unique artists across broad genres', () => {
    expect(GLOBAL_ARTISTS_POOL.length).toBeGreaterThan(300);
    expect(new Set(GLOBAL_ARTISTS_POOL.map(normalized)).size).toBe(GLOBAL_ARTISTS_POOL.length);
    expect(new Set(GLOBAL_ARTISTS_POOL.map(artistGenre)).size).toBeGreaterThanOrEqual(16);
  });

  it('returns a diverse first page without duplicates', () => {
    const artists = buildAffinityPool([], 12, { rotation: 0 });
    const genres = artists.map(artistGenre);

    expect(artists).toHaveLength(12);
    expect(new Set(artists.map(normalized)).size).toBe(12);
    expect(new Set(genres).size).toBe(12);
  });

  it('excludes downloaded artists and the previous visible page', () => {
    const first = buildAffinityPool([], 12, { rotation: 0 });
    const second = buildAffinityPool(['Ado'], 12, { rotation: 1, exclude: first });

    expect(second).toHaveLength(12);
    expect(second).not.toContain('Ado');
    expect(second.some((artist) => first.includes(artist))).toBe(false);
  });

  it('assigns a distinct palette to every artist in the visible page', () => {
    const artists = buildAffinityPool([], 12);
    const visuals = buildArtistVisuals(artists);

    expect(new Set(visuals.map((visual) => visual.primary)).size).toBe(12);
    expect(new Set(visuals.map((visual) => visual.secondary)).size).toBe(12);
    expect(buildArtistVisuals(artists)).toEqual(visuals);
  });
});
