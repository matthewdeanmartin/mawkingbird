import { describe, expect, it } from 'vitest';
import { Account, Status } from './models';
import { SourceOutcome } from './providers/anonymous/anonymous-mastodon-provider';
import {
  DEAD_FOLLOW_RATIO,
  FLOOD_MIN_POSTS,
  diagnoseEnding,
  diagnoseFeed,
  diagnoseFlooding,
  diagnoseMixing,
  diagnoseSources,
  diagnoseStopped,
  diagnoseTimespans,
  sliceByProvider,
} from './feed-doctor';
import type { FeedBounds } from './feed-doctor';

function account(id: string): Account {
  return {
    id,
    username: `u${id}`,
    acct: `u${id}@example.social`,
    fields: [],
  } as unknown as Account;
}

function post(id: string, authorId: string): Status {
  return {
    id,
    account: account(authorId),
    content: '',
    created_at: new Date().toISOString(),
    favourites_count: 0,
    reblogs_count: 0,
    replies_count: 0,
    tags: [],
    media_attachments: [],
    mentions: [],
  } as unknown as Status;
}

/** `n` posts by the same author, plus filler from distinct others. */
function feed(dominant: number, others: number): Status[] {
  return [
    ...Array.from({ length: dominant }, (_, i) => post(`d${i}`, 'loud')),
    ...Array.from({ length: others }, (_, i) => post(`o${i}`, `quiet${i}`)),
  ];
}

describe('diagnoseFlooding', () => {
  it('names an author who dominates the window', () => {
    const verdict = diagnoseFlooding(feed(8, 12));
    expect(verdict.severity).not.toBe('ok');
    expect(verdict.headline).toContain('uloud@example.social');
    expect(verdict.headline).toContain('40%');
  });

  it('escalates to warn once one account owns 40% of the sample', () => {
    expect(diagnoseFlooding(feed(10, 10)).severity).toBe('warn');
    // A quarter is enough to mention, not enough to alarm.
    expect(diagnoseFlooding(feed(6, 18)).severity).toBe('notice');
  });

  it('stays quiet when the feed is well spread', () => {
    const verdict = diagnoseFlooding(feed(2, 18));
    expect(verdict.severity).toBe('ok');
    expect(verdict.actions).toEqual([]);
  });

  /**
   * The guard that separates a diagnosis from a horoscope: 3 of 5 posts is 60% and
   * means nothing at all.
   */
  it('refuses to call flooding on a sample below the minimum', () => {
    const tiny = feed(3, 2);
    expect(tiny.length).toBeLessThan(FLOOD_MIN_POSTS);
    expect(diagnoseFlooding(tiny).severity).toBe('ok');
  });

  it('offers a mute and an unfollow, and applies neither itself', () => {
    const verdict = diagnoseFlooding(feed(10, 10));
    expect(verdict.actions.map((a) => a.kind)).toEqual(['mute', 'unfollow']);
    expect(verdict.actions[0].account?.acct).toBe('uloud@example.social');
    expect(verdict.actions[0].seconds).toBe(8 * 60 * 60);
  });

  it('handles an empty sample without inventing a culprit', () => {
    expect(diagnoseFlooding([]).severity).toBe('ok');
  });
});

describe('diagnoseEnding', () => {
  function outcome(handle: string, ending: SourceOutcome['ending'], fetched = 0): SourceOutcome {
    return { handle, ending, fetched };
  }

  it('says nothing is wrong when every source delivered', () => {
    const verdict = diagnoseEnding([outcome('a', 'ok', 5), outcome('b', 'ok', 3)]);
    expect(verdict.severity).toBe('ok');
    expect(verdict.actions).toEqual([]);
  });

  /**
   * The case no other surface can report. A filter that empties the feed looks
   * exactly like dead follows, so the reader blames their follows.
   */
  it('blames the filters when they are what cut the feed short', () => {
    const verdict = diagnoseEnding([
      outcome('a', 'ok', 5),
      outcome('b', 'filtered', 1),
      outcome('c', 'filtered', 0),
    ]);
    expect(verdict.headline).toContain('filters');
    expect(verdict.detail.join(' ')).toContain('2 more were cut short');
    expect(verdict.actions.map((a) => a.kind)).toContain('review-filters');
  });

  it('distinguishes an unreachable server from a quiet account', () => {
    const verdict = diagnoseEnding([
      outcome('alive', 'ok', 4),
      outcome('quiet', 'empty'),
      outcome('dead@gone.example', 'error'),
    ]);
    const text = verdict.detail.join(' ');
    expect(text).toContain('1 returned nothing');
    expect(text).toContain('1 could not be loaded');
    expect(text).toContain('@dead@gone.example — could not be loaded');
  });

  it('escalates once enough follows are contributing nothing', () => {
    const outcomes = [
      ...Array.from({ length: 6 }, (_, i) => outcome(`ok${i}`, 'ok', 2)),
      ...Array.from({ length: 4 }, (_, i) => outcome(`dead${i}`, 'empty')),
    ];
    expect(4 / outcomes.length).toBeGreaterThanOrEqual(DEAD_FOLLOW_RATIO);
    expect(diagnoseEnding(outcomes).severity).toBe('warn');
  });

  it('mentions only a handful of failures rather than listing hundreds', () => {
    const outcomes = Array.from({ length: 30 }, (_, i) => outcome(`dead${i}`, 'error'));
    const listed = diagnoseEnding(outcomes).detail.filter((line) =>
      line.includes('could not be loaded'),
    );
    // One summary line plus at most five named accounts.
    expect(listed.length).toBeLessThanOrEqual(6);
  });

  it('says nothing when there were no follow sources at all', () => {
    expect(diagnoseEnding([]).severity).toBe('ok');
  });
});

describe('diagnoseMixing', () => {
  it('reports a healthy blend without alarm', () => {
    const verdict = diagnoseMixing({ Follows: 61, Hashtags: 22, RSS: 17 });
    expect(verdict.severity).toBe('ok');
    expect(verdict.detail).toContain('Follows 61%');
  });

  it('flags a feed that is really one source wearing a hat', () => {
    const verdict = diagnoseMixing({ Follows: 90, Hashtags: 10 });
    expect(verdict.severity).toBe('notice');
    expect(verdict.headline).toContain('90%');
  });

  it('says so when only one source contributed anything', () => {
    const verdict = diagnoseMixing({ Follows: 40, Hashtags: 0 });
    expect(verdict.headline).toContain('Everything here came from Follows');
  });

  it('handles an empty feed', () => {
    expect(diagnoseMixing({}).severity).toBe('ok');
  });
});

/**
 * The signed-in feed's own failure modes.
 *
 * Signed-in Home is `FeedAggregator` merging Mastodon, Bluesky, Twitter and RSS.
 * It cannot say which *follow* went quiet — but a whole source stalling, or two
 * sources covering different years, are failures the anonymous feed never has.
 */
describe('diagnoseSources', () => {
  const NOW = Date.parse('2026-08-05T12:00:00Z');
  const HOUR = 3_600_000;

  function slice(label: string, count: number, newestHoursAgo: number, spanHours = 24) {
    return {
      id: label.toLowerCase(),
      label,
      count,
      newest: NOW - newestHoursAgo * HOUR,
      oldest: NOW - (newestHoursAgo + spanHours) * HOUR,
    };
  }

  it('is quiet when every source is current', () => {
    const verdict = diagnoseSources([slice('Mastodon', 100, 0.2), slice('Bluesky', 40, 1)], NOW);
    expect(verdict.severity).toBe('ok');
    expect(verdict.headline).toContain('current');
  });

  /** Matthew's case: "all your bsky and twitter data is from more than 24 hours ago". */
  it('names a source that has fallen far behind the others', () => {
    const verdict = diagnoseSources(
      [slice('Mastodon', 100, 0.1), slice('Bluesky', 30, 72), slice('Twitter', 20, 96)],
      NOW,
    );
    expect(verdict.severity).toBe('warn');
    expect(verdict.headline).toContain('Bluesky');
    expect(verdict.headline).toContain('Twitter');
    expect(verdict.detail.join(' ')).toContain('stalled connector');
  });

  it('does not accuse a source when the whole feed is equally old', () => {
    // Everyone away for a week is not a stalled connector.
    const verdict = diagnoseSources([slice('Mastodon', 50, 168), slice('Bluesky', 40, 170)], NOW);
    expect(verdict.severity).toBe('ok');
  });

  it('ignores a source too small to explain anything', () => {
    // Two posts out of two hundred is not why the feed looks wrong.
    const verdict = diagnoseSources([slice('Mastodon', 200, 0.1), slice('RSS', 2, 200)], NOW);
    expect(verdict.severity).toBe('ok');
  });

  it('reports a connected source that returned nothing at all', () => {
    const verdict = diagnoseSources(
      [
        slice('Mastodon', 100, 0.1),
        { id: 'bluesky', label: 'Bluesky', count: 0, newest: 0, oldest: 0, silent: true },
      ],
      NOW,
    );
    expect(verdict.severity).toBe('warn');
    expect(verdict.headline).toContain('Bluesky');
  });
});

describe('diagnoseTimespans', () => {
  const NOW = Date.parse('2026-08-05T12:00:00Z');
  const HOUR = 3_600_000;

  function span(label: string, count: number, newestHoursAgo: number, oldestHoursAgo: number) {
    return {
      id: label.toLowerCase(),
      label,
      count,
      newest: NOW - newestHoursAgo * HOUR,
      oldest: NOW - oldestHoursAgo * HOUR,
    };
  }

  /** Matthew's case: "a big layer of mastodon, followed by RSS from 2 years ago". */
  it('catches sources that stack in layers instead of interleaving', () => {
    const verdict = diagnoseTimespans(
      [span('Mastodon', 100, 0, 48), span('RSS', 40, 17_520, 26_280)],
      NOW,
    );
    expect(verdict.severity).toBe('notice');
    expect(verdict.headline).toContain('RSS');
    expect(verdict.headline).toContain("doesn't overlap");
    expect(verdict.detail.join(' ')).toContain('stack in layers');
  });

  it('is happy when the ranges overlap', () => {
    const verdict = diagnoseTimespans(
      [span('Mastodon', 100, 0, 48), span('Bluesky', 40, 2, 50)],
      NOW,
    );
    expect(verdict.severity).toBe('ok');
    expect(verdict.headline).toContain('interleave');
  });

  it('says nothing useful about a single source', () => {
    expect(diagnoseTimespans([span('Mastodon', 100, 0, 48)], NOW).severity).toBe('ok');
  });
});

describe('sliceByProvider', () => {
  it('groups a merged feed and keeps each provider’s date range', () => {
    const older = { ...post('1', 'a'), provider: 'rss', created_at: '2024-01-01T00:00:00Z' };
    const newer = { ...post('2', 'b'), created_at: '2026-08-05T00:00:00Z' };
    const slices = sliceByProvider([newer, older] as Status[], {
      rss: 'RSS',
      mastodon: 'Mastodon',
    });

    const rss = slices.find((s) => s.id === 'rss');
    expect(rss?.label).toBe('RSS');
    expect(rss?.count).toBe(1);
    expect(slices.find((s) => s.id === 'mastodon')?.count).toBe(1);
  });

  it('marks a linked provider that contributed nothing as silent', () => {
    const slices = sliceByProvider([post('1', 'a')], { bluesky: 'Bluesky' }, ['bluesky']);
    expect(slices.find((s) => s.id === 'bluesky')?.silent).toBe(true);
  });
});

describe('diagnoseFeed', () => {
  it('answers all three questions and states the sample size', () => {
    const diagnosis = diagnoseFeed({
      posts: feed(10, 10),
      outcomes: [{ handle: 'a', ending: 'ok', fetched: 20 }],
      bySource: { Follows: 20 },
    });

    expect(diagnosis.sampleSize).toBe(20);
    expect(diagnosis.verdicts.map((v) => v.id)).toEqual(['flooding', 'ended', 'mixing']);
  });
});

/**
 * Nothing bounding the feed, as a starting point. Each test names only the one
 * mechanism it is about, so the assertions read as the situation they describe.
 */
function bounds(overrides: Partial<FeedBounds> = {}): FeedBounds {
  return {
    hiddenByCalm: 0,
    hiddenByLanguage: 0,
    hiddenByChips: 0,
    droppedByWindow: 0,
    windowLabel: null,
    cooldownActive: false,
    cooldownMinutes: 0,
    exhausted: true,
    shown: 40,
    ...overrides,
  };
}

describe('diagnoseStopped', () => {
  it('names Calm when Calm is what emptied the feed', () => {
    // The boss's own case: "maybe too much got filtered out by calm (that
    // happened to me today)". Before this verdict existed, the Doctor's answer
    // was that nobody was flooding the feed.
    const verdict = diagnoseStopped(bounds({ hiddenByCalm: 31, exhausted: false }));

    expect(verdict.id).toBe('stopped');
    expect(verdict.severity).toBe('notice');
    expect(verdict.detail.join(' ')).toContain('Calm mode is holding back 31');
    expect(verdict.actions.map((a) => a.kind)).toContain('show-calm');
  });

  it('names the window, and offers to widen it', () => {
    const verdict = diagnoseStopped(
      bounds({ droppedByWindow: 812, windowLabel: 'the last day', exhausted: false }),
    );

    expect(verdict.severity).toBe('warn');
    expect(verdict.headline).toContain('the last day');
    expect(verdict.detail.join(' ')).toContain('812 older posts were not loaded');
    expect(verdict.actions.map((a) => a.kind)).toContain('widen-window');
  });

  it('leads with the cooldown when several things bound the feed at once', () => {
    // A reader stopped by the cooldown cannot page at all, so hearing about
    // their language filter first would be answering a question they have not
    // reached yet. Everything still gets reported — only the headline is ranked.
    const verdict = diagnoseStopped(
      bounds({
        cooldownActive: true,
        cooldownMinutes: 42,
        droppedByWindow: 12,
        windowLabel: 'the last week',
        hiddenByCalm: 3,
        exhausted: false,
      }),
    );

    expect(verdict.headline).toContain('reading break');
    expect(verdict.detail).toHaveLength(3);
    expect(verdict.detail[0]).toContain('42 minutes');
  });

  it('distinguishes a genuinely exhausted feed from an unfiltered one', () => {
    // Two different green answers. Only one of them means more will arrive.
    expect(diagnoseStopped(bounds({ exhausted: true })).headline).toContain('every source ran out');
    expect(diagnoseStopped(bounds({ exhausted: false })).headline).toContain(
      'Nothing is limiting your feed',
    );
  });

  it('counts one post once, however many filters could have caught it', () => {
    // The counts arrive pre-apportioned by the caller; this asserts the verdict
    // reports each one as given rather than summing them into a total larger
    // than the feed.
    const verdict = diagnoseStopped(
      bounds({ hiddenByCalm: 2, hiddenByLanguage: 3, hiddenByChips: 4, exhausted: false }),
    );

    expect(verdict.detail).toHaveLength(3);
    expect(verdict.detail.join(' ')).toContain('2');
    expect(verdict.detail.join(' ')).toContain('3');
    expect(verdict.detail.join(' ')).toContain('4');
  });
});

describe('diagnoseFeed with bounds', () => {
  it('gives a signed-in feed a reason it stopped, where it previously had none', () => {
    // The regression this sprint exists to prevent: the signed-in path supplies
    // no `outcomes`, so before `bounds` there was no verdict at all about why
    // the feed ended — only flooding and mixing.
    const diagnosis = diagnoseFeed({
      posts: [],
      outcomes: [],
      bySource: {},
      bounds: bounds({ hiddenByCalm: 9, exhausted: false }),
    });

    expect(diagnosis.verdicts.map((v) => v.id)).toContain('stopped');
  });

  it('omits the verdict entirely when no bounds were measured', () => {
    // Same principle the rest of this module follows: a verdict with nothing
    // behind it is worse than silence.
    const diagnosis = diagnoseFeed({ posts: [], outcomes: [], bySource: {} });

    expect(diagnosis.verdicts.map((v) => v.id)).not.toContain('stopped');
  });
});
