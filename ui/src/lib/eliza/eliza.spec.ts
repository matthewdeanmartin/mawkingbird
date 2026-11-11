import { describe, expect, it } from 'vitest';
import { elizaReply, ElizaScript, faqMatch, reflect } from './eliza';

/** A small script with the shape every caller provides. */
const SCRIPT: ElizaScript = {
  faq: [
    { keywords: ['follow'], answer: 'Following puts their posts in your timeline.' },
    { keywords: ['like', 'post'], answer: 'Posting and liking both live in the composer.' },
  ],
  rules: [
    {
      pattern: /\bi need (.+)/i,
      responses: ['Why do you need $1?', 'Would $1 really help?', 'What if you had $1?'],
    },
    { pattern: /\bi am (.+)/i, responses: ['How long have you been $1?'] },
    { pattern: /\bi want (.+)/i, responses: ['What would you do with $1?'] },
  ],
  fallback: ['Tell me more.', 'How does that make you feel?'],
};

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
    expect(faqMatch('how do I FOLLOW someone?', SCRIPT.faq)?.keywords).toContain('follow');
  });

  it('does not match a keyword embedded in a larger word', () => {
    expect(faqMatch('what is the likelihood of that', SCRIPT.faq)).toBeNull();
  });

  it('returns null when nothing matches', () => {
    expect(faqMatch('the sky is blue today', SCRIPT.faq)).toBeNull();
  });

  it('prefers the earlier (more specific) entry when several match', () => {
    expect(faqMatch('should I follow before I post', SCRIPT.faq)?.keywords).toContain('follow');
  });
});

describe('elizaReply', () => {
  it('answers a FAQ question before trying the rules', () => {
    expect(elizaReply(SCRIPT, 'i need to know how to follow people')).toBe(SCRIPT.faq[0].answer);
  });

  it('reflects pronouns through a rule', () => {
    const reply = elizaReply(SCRIPT, 'i am anxious about my work', 0);
    expect(reply).toBe('How long have you been anxious about your work?');
  });

  it('is deterministic for a fixed seed', () => {
    expect(elizaReply(SCRIPT, 'i need a break', 3)).toBe(elizaReply(SCRIPT, 'i need a break', 3));
  });

  it('varies with the seed', () => {
    const seeds = [0, 1, 2].map((s) => elizaReply(SCRIPT, 'i need a break', s));
    expect(new Set(seeds).size).toBeGreaterThan(1);
  });

  it('falls back to deflection when nothing matches', () => {
    expect(SCRIPT.fallback).toContain(elizaReply(SCRIPT, 'xyzzy plugh frobozz', 0));
  });

  it('handles empty input without throwing', () => {
    expect(SCRIPT.fallback).toContain(elizaReply(SCRIPT, '   ', 0));
  });

  it('splices a cleaned capture group into the template', () => {
    // "i want $1?" — trailing punctuation must be tidied off the fragment.
    const reply = elizaReply(SCRIPT, 'i want a new account.', 0);
    expect(reply).toBe('What would you do with a new account?');
  });
});
