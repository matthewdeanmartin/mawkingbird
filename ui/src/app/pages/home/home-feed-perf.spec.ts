import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { CalmVerdicts } from '../../calm-verdicts';
import { ClientPrefs } from '../../client-prefs';
import { Status } from '../../models';
import { FeedLanguageFilter } from '../../trend-language-filter';

/**
 * Cost of the per-post filters that Home's `visible()` computed runs.
 *
 * ## Why this exists as a test rather than a note
 *
 * "The feed feels slow" and "the feed is stuck in a retry loop" look identical
 * from the outside, and the fix for one does nothing for the other. These
 * measure the filter pipeline directly so a claim about it can be checked
 * instead of argued about.
 *
 * ## What `visible()` actually re-runs
 *
 * It depends on `now()`, a signal a 30-second `setInterval` writes to. Every
 * tick therefore re-filters — and, when synthetic posts are present, re-sorts —
 * the entire loaded feed. That is by design (the Eliza timeline is relative to
 * now), but it means every per-post predicate in `applyTimelineFilters` is paid
 * again twice a minute, for as long as the tab is open, whether or not anything
 * changed.
 *
 * Two of those predicates are memoized and one is not:
 *
 *  - `CalmVerdicts.hidden` caches per status id, explicitly so that liking a
 *    post cannot move it in the feed. Cheap on every pass after the first.
 *  - `FeedLanguageFilter.shouldShow` re-runs `stripHtml` and the full lexical
 *    `detectLanguage` — a per-character script loop, diacritic regexes and a
 *    stop-word pass — on every call, with no cache.
 *
 * The saving grace is that `hideForeignLangPosts` defaults to **off**, and
 * `hideReason` returns immediately when it is. So this is a cost users opt into,
 * which is why the numbers below are asserted separately for the two states.
 *
 * ## Thresholds
 *
 * Generous on purpose — CI machines vary and a flaky perf test gets deleted
 * rather than fixed. They are set to catch an order-of-magnitude regression
 * (a filter becoming quadratic, or a memo being dropped), not to police
 * milliseconds.
 */

/** A post with enough prose for the detector's stop-word tier to engage. */
function makeStatus(id: string, text: string, language: string | null = 'en'): Status {
  return {
    id,
    created_at: new Date(Date.now() - Number(id) * 1000).toISOString(),
    edited_at: null,
    content: `<p>${text}</p>`,
    spoiler_text: '',
    visibility: 'public',
    language,
    url: null,
    account: { id: 'a1', acct: 'a', username: 'a', display_name: 'A' } as Status['account'],
    reblog: null,
    quote: null,
    in_reply_to_id: null,
    replies_count: 3,
    reblogs_count: 2,
    favourites_count: 5,
    favourited: false,
    reblogged: false,
    bookmarked: false,
    muted: false,
    pinned: false,
    sensitive: false,
    poll: null,
    quote_approval_policy: null,
    media_attachments: [],
  } as Status;
}

/** A realistic loaded Home feed: `feedMax` defaults to a few hundred posts. */
function makeFeed(size: number): Status[] {
  const bodies = [
    'The quick brown fox jumps over the lazy dog and then keeps running for a while longer.',
    'Le renard brun rapide saute par-dessus le chien paresseux et continue de courir.',
    'I have been thinking about this for a long time and I am still not sure what the answer is.',
    'Ĉi tio estas mesaĝo en Esperanto kiu havas sufiĉe da vortoj por la detektilo.',
  ];
  return Array.from({ length: size }, (_, i) => makeStatus(String(i), bodies[i % bodies.length]));
}

/** Median of several runs: less noisy than a single pass on a loaded machine. */
function medianMs(runs: number, fn: () => void): number {
  const times: number[] = [];
  for (let i = 0; i < runs; i += 1) {
    const started = performance.now();
    fn();
    times.push(performance.now() - started);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(times.length / 2)];
}

/** Print the measurement, so a run reports numbers and not just pass/fail. */
const measurements: string[] = [];

function report(label: string, ms: number, posts: number): void {
  measurements.push(
    `${label}: ${ms.toFixed(1)}ms / ${posts} posts = ${((ms / posts) * 1000).toFixed(1)}us per post`,
  );
}

describe('Home feed filter cost', () => {
  let prefs: ClientPrefs;
  let calm: CalmVerdicts;
  let lang: FeedLanguageFilter;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    prefs = TestBed.inject(ClientPrefs);
    calm = TestBed.inject(CalmVerdicts);
    lang = TestBed.inject(FeedLanguageFilter);
  });

  it('costs almost nothing per pass with the default filters', () => {
    const feed = makeFeed(400);
    // Defaults: Calm off, foreign-language hiding off.
    expect(prefs.algoCalm()).toBe(false);
    expect(prefs.hideForeignLangPosts()).toBe(false);

    const ms = medianMs(5, () => {
      for (const status of feed) {
        lang.shouldShow(status);
      }
    });

    report('default filters', ms, feed.length);
    // The early return in `hideReason` means this is a signal read per post.
    expect(ms).toBeLessThan(50);
  });

  /**
   * The memo that already exists, pinned so it cannot be quietly removed.
   *
   * `CalmVerdicts` caching per status id is what keeps a 30-second tick from
   * re-scoring the whole feed. Without it this ratio collapses toward 1.
   */
  it('re-reads Calm verdicts from cache rather than re-scoring', () => {
    const feed = makeFeed(400);
    prefs.algoCalm.set(true);

    const first = medianMs(1, () => {
      for (const status of feed) {
        calm.hidden(status);
      }
    });
    const cached = medianMs(5, () => {
      for (const status of feed) {
        calm.hidden(status);
      }
    });

    report('calm first pass', first, feed.length);
    report('calm cached pass', cached, feed.length);
    // Cached passes are a Map lookup per post; the first one did real work.
    expect(cached).toBeLessThanOrEqual(Math.max(first, 1));
    expect(cached).toBeLessThan(20);
  });

  /**
   * The memo this file was written to justify, now pinned.
   *
   * With foreign-language hiding on, `hideReason` runs `stripHtml` plus the full
   * lexical detector — a per-character script loop, diacritic regexes and a
   * stop-word tokenizer. `Home.visible()` re-runs twice a minute off the 30-second
   * clock, so before the cache that cost was paid again for every loaded post for
   * as long as the tab stayed open (~75ms per pass over 400 posts, measured).
   *
   * Only the *detection* is cached, so this asserts the split: repeat passes are
   * cheap, and the policy half still reacts to a pref change immediately (the
   * test below).
   */
  it('detects each post once, then answers repeat passes from cache', () => {
    const feed = makeFeed(400);
    prefs.hideForeignLangPosts.set(true);

    const first = medianMs(1, () => {
      for (const status of feed) {
        lang.shouldShow(status);
      }
    });
    const repeat = medianMs(5, () => {
      for (const status of feed) {
        lang.shouldShow(status);
      }
    });

    report('language first pass', first, feed.length);
    report('language cached pass', repeat, feed.length);
    // The whole point: a repeat pass is a Map lookup per post, not a re-detection.
    // Loose factor rather than a tight one — this must catch the cache being
    // removed, not police scheduler jitter on a busy CI box.
    expect(repeat).toBeLessThan(Math.max(first / 4, 5));
    // Ceiling for 400 posts. Deliberately generous; catches a regression, not noise.
    expect(repeat).toBeLessThan(100);
  });

  /**
   * The half that must *not* be cached.
   *
   * `hideReason` mixes pure detection with live policy — the toggle, `isLearning`,
   * and the allowed-language set. Caching the verdict would have been the easy
   * win and the wrong one: changing your languages would leave the feed showing
   * the old answer until a reload. This pins the split.
   */
  it('still reacts to a pref change after the detection is cached', () => {
    // Declared `fr`, so the verdict turns purely on the allowed set.
    const french = makeStatus('1', 'Bonjour tout le monde, ceci est un message.', 'fr');
    prefs.hideForeignLangPosts.set(true);

    // Warm the cache while French is allowed.
    prefs.feedLanguages.set(['fr']);
    expect(lang.shouldShow(french)).toBe(true);

    // Narrow to English only. The cached *detection* is still valid; the verdict
    // must change anyway.
    prefs.feedLanguages.set(['en']);
    expect(lang.shouldShow(french)).toBe(false);

    // And the toggle still switches the whole filter off.
    prefs.hideForeignLangPosts.set(false);
    expect(lang.shouldShow(french)).toBe(true);
  });

  /** An edited post is new text under an old id, so a reload must re-detect. */
  it('re-detects after reset', () => {
    const feed = makeFeed(200);
    prefs.hideForeignLangPosts.set(true);

    const first = medianMs(1, () => {
      for (const status of feed) {
        lang.shouldShow(status);
      }
    });
    lang.reset();
    const afterReset = medianMs(1, () => {
      for (const status of feed) {
        lang.shouldShow(status);
      }
    });

    report('language after reset', afterReset, feed.length);
    // Real work again, not a cache hit: within an order of magnitude of the first.
    expect(afterReset).toBeGreaterThan(first / 10);
  });

  /**
   * Not an assertion about the code — a way to read the numbers off a CI run.
   *
   * The runner swallows `console.info` from specs, so the measurements the tests
   * above collected are attached to an expectation message here. Run this file
   * and read the failure text to see the actual per-post costs; it passes when
   * measurements were collected, so it is silent in a normal run.
   */
  it('reports what it measured', () => {
    expect(measurements.length, `measured:\n  ${measurements.join('\n  ')}`).toBeGreaterThan(0);
  });
});
