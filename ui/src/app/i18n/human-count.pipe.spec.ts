import { describe, expect, it } from 'vitest';
import { humanCount } from './human-count.pipe';

describe('humanCount', () => {
  it('adds separators through the 15,000 threshold', () => {
    expect(humanCount(1234)).toBe('1,234');
    expect(humanCount(15_000)).toBe('15,000');
  });

  it('uses compact lowercase suffixes above 15,000', () => {
    expect(humanCount(15_001)).toBe('15k');
    expect(humanCount(52_450)).toBe('52.5k');
    expect(humanCount(123_345)).toBe('123k');
    expect(humanCount(1_250_000)).toBe('1.3m');
  });
});
