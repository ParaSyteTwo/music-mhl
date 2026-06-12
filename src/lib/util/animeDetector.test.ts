import { describe, it, expect } from 'vitest';
import { looksAnimeLike, looksAnimeLikeQuery } from './animeDetector';

describe('looksAnimeLike', () => {
  it.each([
    ['Naruto Opening Theme', 'Various', 'Naruto OST'],
    ['Rocks', 'Hound Dog', 'Naruto Opening Theme'],
    ['OP 1 of Bleach', 'Asian Kung-Fu Generation', 'Bleach OST'],
    ['Crossing Field', 'LiSA', 'Sword Art Online Opening'],
    ['Isekai Quartet Theme', 'Various', 'Isekai Quartet'],
  ])('detects anime title %j', (title, artist, album) => {
    expect(looksAnimeLike({ title, artist, album })).toBe(true);
  });

  it.each([
    ['Bohemian Rhapsody', 'Queen', 'A Night at the Opera'],
    ['Hotel California', 'Eagles', 'Hotel California'],
    ['Blinding Lights', 'The Weeknd', 'After Hours'],
  ])('rejects non-anime %j', (title, artist, album) => {
    expect(looksAnimeLike({ title, artist, album })).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(looksAnimeLike({ title: 'OPENING THEME', artist: 'x', album: 'y' })).toBe(true);
    expect(looksAnimeLike({ title: 'Opening Theme', artist: 'x', album: 'y' })).toBe(true);
  });
});

describe('looksAnimeLikeQuery', () => {
  it.each([
    'naruto opening',
    'anime playlist',
    'naruto ost',
    'naruto theme song',
    'naruto opening 1',
    'naruto op 1',
    'bleach ed 3',
    'one piece ending',
    'demon slayer opening',
  ])('detects anime-feel query %j', (query) => {
    expect(looksAnimeLikeQuery(query)).toBe(true);
  });

  it.each([
    'queen bohemian rhapsody',
    'the weeknd blinding lights',
    'rock classics',
    'lofi hip hop',
    'synthwave mix',
  ])('rejects plain query %j', (query) => {
    expect(looksAnimeLikeQuery(query)).toBe(false);
  });

  it('handles whitespace and empty strings safely', () => {
    expect(looksAnimeLikeQuery('')).toBe(false);
    expect(looksAnimeLikeQuery('   ')).toBe(false);
  });
});
