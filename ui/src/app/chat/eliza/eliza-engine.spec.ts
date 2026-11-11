import { describe, expect, it } from 'vitest';
import { elizaReply, faqMatch, reflect } from './eliza-engine';
import { ELIZA_FALLBACK } from './eliza-content';

describe('reflect', () => {
  it('swaps first person to second person', () => {
    expect(reflect('i am sad')).toBe('you are sad');
    expect(reflect('my dog')).toBe('your dog');
    expect(reflect('me')).toBe('you');
  });

  it('swaps second person to first person', () => {
    expect(reflect('you are a bot')).toBe('I am a bot');
    expect(reflect('your idea')).toBe('my idea');
  });

  it('leaves unrelated words alone', () => {
    expect(reflect('the weather is nice')).toBe('the weather is nice');
  });
});

describe('faqMatch', () => {
  it('matches on a whole keyword, case-insensitively', () => {
    expect(faqMatch('how do I FOLLOW someone?')?.keywords).toContain('follow');
  });

  it('does not match a keyword embedded in a larger word', () => {
    // "likelihood" contains "like" but should not trigger the favourite FAQ.
    const match = faqMatch('what is the likelihood of that');
    expect(match?.keywords ?? []).not.toContain('like');
  });

  it('returns null when nothing matches', () => {
    expect(faqMatch('the sky is blue today')).toBeNull();
  });

  it('prefers the earlier (more specific) entry when several match', () => {
    // "follow" (entry 0) wins over "post" (later) when both appear.
    expect(faqMatch('should I follow before I post')?.keywords).toContain('follow');
  });
});

describe('elizaReply', () => {
  it('answers a feature question from the FAQ, not a deflection', () => {
    const reply = elizaReply('how do boosts work?');
    expect(reply.toLowerCase()).toContain('boost');
  });

  it('reflects pronouns through a rule', () => {
    // "i am anxious" → rule reflects to "you ... anxious"
    const reply = elizaReply('i am anxious', 1);
    expect(reply.toLowerCase()).toContain('anxious');
    expect(reply.toLowerCase()).not.toContain(' i am anxious');
  });

  it('is deterministic for a fixed seed', () => {
    expect(elizaReply('i need a break', 3)).toBe(elizaReply('i need a break', 3));
  });

  it('varies with the seed', () => {
    const seeds = [0, 1, 2].map((s) => elizaReply('i need a break', s));
    expect(new Set(seeds).size).toBeGreaterThan(1);
  });

  it('falls back to deflection when nothing matches', () => {
    const reply = elizaReply('xyzzy plugh frobozz', 0);
    expect(ELIZA_FALLBACK).toContain(reply);
  });

  it('handles empty input without throwing', () => {
    expect(ELIZA_FALLBACK).toContain(elizaReply('   ', 0));
  });

  it('splices a cleaned capture group into the template', () => {
    // "i want $1?" — trailing punctuation must be tidied off the fragment.
    const reply = elizaReply('i want a new account.', 0);
    expect(reply).not.toContain('account.?');
    expect(reply.toLowerCase()).toContain('account');
  });
});
