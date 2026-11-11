import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_MASTODON_HARD_LIMIT,
  DEFAULT_MASTODON_SOFT_LIMIT,
  DEFAULT_OPENROUTER_HARD_LIMIT,
  DEFAULT_OPENROUTER_SOFT_LIMIT,
  ENGINE_LABELS,
  TranslationUsage,
} from './translation-usage';

describe('TranslationUsage', () => {
  let usage: TranslationUsage;

  beforeEach(() => {
    localStorage.clear();
    usage = new TranslationUsage();
  });

  it('starts at zero on both engines', () => {
    expect(usage.today('mastodon')).toBe(0);
    expect(usage.today('openrouter')).toBe(0);
    expect(usage.remainingToday('mastodon')).toBe(DEFAULT_MASTODON_HARD_LIMIT);
    expect(usage.remainingToday('openrouter')).toBe(DEFAULT_OPENROUTER_HARD_LIMIT);
  });

  it('counts translations against both today and the running total', () => {
    usage.record('mastodon');
    usage.record('mastodon', 3);
    expect(usage.today('mastodon')).toBe(4);
    expect(usage.total('mastodon')).toBe(4);
  });

  it('persists across instances', () => {
    usage.record('openrouter', 5);
    expect(new TranslationUsage().today('openrouter')).toBe(5);
  });

  it('gives OpenRouter a tighter default than the instance endpoint', () => {
    // Not an arbitrary pair of numbers: one path spends someone else's free service,
    // the other spends the user's money. If these ever converge, the cheaper default
    // has been applied to the paid path.
    expect(DEFAULT_OPENROUTER_SOFT_LIMIT).toBeLessThan(DEFAULT_MASTODON_SOFT_LIMIT);
    expect(DEFAULT_OPENROUTER_HARD_LIMIT).toBeLessThan(DEFAULT_MASTODON_HARD_LIMIT);
  });

  it('names the instance engine for what is actually behind it', () => {
    // A learner deciding where to spend a daily allowance needs to know which service
    // they are about to hit, not just "your server".
    expect(ENGINE_LABELS.mastodon).toBe('Mastodon (DeepL/LibreTranslate)');
  });

  describe('the two budgets stay apart', () => {
    // The whole reason this store is not a single blended meter: OpenRouter could go
    // out of business and an instance can disable its translation endpoint. Either one
    // vanishing must leave the other's budget intact and still meaningful.

    it('does not let one engine consume the other allowance', () => {
      usage.record('mastodon', DEFAULT_MASTODON_HARD_LIMIT);
      expect(usage.atHardLimit('mastodon')).toBe(true);
      expect(usage.canSpend('mastodon')).toBe(false);

      // OpenRouter is untouched and fully spendable.
      expect(usage.today('openrouter')).toBe(0);
      expect(usage.canSpend('openrouter')).toBe(true);
      expect(usage.remainingToday('openrouter')).toBe(DEFAULT_OPENROUTER_HARD_LIMIT);
    });

    it('keeps limits independent', () => {
      usage.setLimits('openrouter', 2, 4);
      expect(usage.hardLimit('openrouter')).toBe(4);
      expect(usage.hardLimit('mastodon')).toBe(DEFAULT_MASTODON_HARD_LIMIT);
    });

    it('resets one engine without disturbing the other', () => {
      usage.record('mastodon', 7);
      usage.record('openrouter', 3);
      usage.reset('openrouter');
      expect(usage.today('openrouter')).toBe(0);
      expect(usage.today('mastodon')).toBe(7);
    });

    it('survives a corrupt half without discarding the honest half', () => {
      usage.record('mastodon', 6);
      const raw = JSON.parse(localStorage.getItem('mockingbird_translation_usage')!);
      raw.openrouter = 'nonsense';
      localStorage.setItem('mockingbird_translation_usage', JSON.stringify(raw));

      const reloaded = new TranslationUsage();
      expect(reloaded.today('mastodon')).toBe(6);
      expect(reloaded.today('openrouter')).toBe(0);
    });
  });

  describe('refusing spend', () => {
    it('refuses the whole batch rather than letting part through', () => {
      usage.setLimits('mastodon', 5, 10);
      usage.record('mastodon', 8);
      // Two would fit; five would not. A bulk pass that stops halfway leaves a page of
      // half-translated posts with the calls already spent.
      expect(usage.check('mastodon', 2)).toBeNull();
      expect(usage.check('mastodon', 5)).toBe('hard-limit');
    });

    it('warns at the soft limit without blocking', () => {
      usage.setLimits('mastodon', 3, 10);
      usage.record('mastodon', 3);
      expect(usage.overSoftLimit('mastodon')).toBe(true);
      expect(usage.canSpend('mastodon')).toBe(true);
    });

    it('refuses to accept a hard limit below the soft one', () => {
      usage.setLimits('mastodon', 90, 10);
      expect(usage.hardLimit('mastodon')).toBe(10);
      expect(usage.softLimit('mastodon')).toBe(10);
    });
  });

  describe('the daily boundary', () => {
    afterEach(() => vi.useRealTimers());

    it('rolls over at local midnight, keeping the lifetime total', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 6, 31, 23, 59));
      const store = new TranslationUsage();
      store.record('mastodon', 10);
      expect(store.today('mastodon')).toBe(10);

      vi.setSystemTime(new Date(2026, 7, 1, 0, 1));
      // The regression this guards: a browser left open overnight kept enforcing
      // yesterday's exhausted limit into the new day, so translation stayed refused
      // until some unrelated write happened to occur.
      store.syncDay();
      expect(store.today('mastodon')).toBe(0);
      expect(store.total('mastodon')).toBe(10);
      expect(store.canSpend('mastodon')).toBe(true);
    });

    it('re-checks the day when asked to spend, without waiting for the timer', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 6, 31, 23, 59));
      const store = new TranslationUsage();
      store.setLimits('mastodon', 1, 2);
      store.record('mastodon', 2);
      expect(store.canSpend('mastodon')).toBe(false);

      // No timer tick — a suspended laptop or a throttled background tab. `check`
      // syncs the day itself, so the new day's allowance is available immediately.
      vi.setSystemTime(new Date(2026, 7, 1, 8, 0));
      expect(store.canSpend('mastodon')).toBe(true);
    });
  });
});
