import { describe, expect, it } from 'vitest';
import { countKey } from './count-key';

describe('countKey', () => {
  it('picks the singular key for exactly one and the plural key otherwise', () => {
    expect(countKey('singles.saved', 1)).toBe('singles.saved.one');
    expect(countKey('singles.saved', 0)).toBe('singles.saved.other');
    expect(countKey('singles.saved', 2)).toBe('singles.saved.other');
  });
});
