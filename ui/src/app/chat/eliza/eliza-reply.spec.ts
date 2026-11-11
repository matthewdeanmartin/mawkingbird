import { describe, expect, it } from 'vitest';
import { ELIZA_FALLBACK } from './eliza-content';
import { elizaReply, faqMatch } from './eliza-reply';

// The engine's mechanics are tested in src/lib/eliza. These pin facts about
// Mawkingbird's own script: which help answers exist and how they are ordered.
describe("Eliza's script", () => {
  it('has a follow answer that wins over the posting answer', () => {
    expect(faqMatch('should I follow before I post')?.keywords).toContain('follow');
  });

  it('does not answer the favourite FAQ for words that merely contain "like"', () => {
    expect(faqMatch('what is the likelihood of that')?.keywords ?? []).not.toContain('like');
  });

  it('answers a feature question from the FAQ, not a deflection', () => {
    expect(elizaReply('how do boosts work?').toLowerCase()).toContain('boost');
  });

  it('reflects "i am" through her rules rather than deflecting', () => {
    const reply = elizaReply('i am anxious', 1);
    expect(reply.toLowerCase()).toContain('anxious');
    expect(ELIZA_FALLBACK).not.toContain(reply);
  });
});
