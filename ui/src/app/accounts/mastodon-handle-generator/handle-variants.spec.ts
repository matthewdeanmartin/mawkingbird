import { describe, expect, it } from 'vitest';
import {
  handleVariants,
  isValidHandle,
  MAX_HANDLE_LENGTH,
  MAX_SUGGESTIONS,
  nameWords,
} from './handle-variants';

describe('handle variants', () => {
  it('folds accents and splits on anything that is not a letter or digit', () => {
    expect(nameWords('  José  María-Núñez ')).toEqual(['jose', 'maria', 'nunez']);
    expect(nameWords("O'Brien, Kate!")).toEqual(['o', 'brien', 'kate']);
    expect(nameWords('🦣🦣')).toEqual([]);
  });

  it('leads with the plain forms, then shortened, reversed, prefixed and numbered', () => {
    expect(handleVariants('Matthew Martin')).toEqual([
      'matthewmartin',
      'matthew_martin',
      'mmartin',
      'm_martin',
      'matthewm',
      'matthew_m',
      'martinmatthew',
      'martin_matthew',
      'itsmatthewmartin',
      'realmatthewmartin',
      'thematthewmartin',
      'matthewmartin_',
    ]);
  });

  it('handles a single nickname', () => {
    expect(handleVariants('Sparrow')).toEqual([
      'sparrow',
      'itssparrow',
      'realsparrow',
      'thesparrow',
      'sparrow_',
      'sparrow1',
    ]);
  });

  it('only ever suggests valid Mastodon usernames, at most a dozen', () => {
    const long = handleVariants('Bartholomew Maximilian Featherstonehaugh-Cholmondeley');
    expect(long.length).toBeLessThanOrEqual(MAX_SUGGESTIONS);
    for (const handle of long) {
      expect(isValidHandle(handle), handle).toBe(true);
      expect(handle.length).toBeLessThanOrEqual(MAX_HANDLE_LENGTH);
    }
    expect(new Set(long).size).toBe(long.length);
  });

  it('suggests nothing for a name with no usable letters', () => {
    expect(handleVariants('')).toEqual([]);
    expect(handleVariants('!!!')).toEqual([]);
  });

  it('knows the username rules', () => {
    expect(isValidHandle('matthew_martin1')).toBe(true);
    expect(isValidHandle('matthew.martin')).toBe(false);
    expect(isValidHandle('matthew-martin')).toBe(false);
    expect(isValidHandle('a'.repeat(31))).toBe(false);
  });
});
