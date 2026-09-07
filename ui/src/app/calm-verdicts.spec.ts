import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { CalmVerdicts } from './calm-verdicts';
import { Status } from './models';
import { RATIO_FACTOR, RATIO_MIN_REPLIES, isCalmHidden } from './sentiment';

function makeStatus(overrides: Partial<Status> = {}): Status {
  return {
    id: '1',
    created_at: '2026-01-01T00:00:00Z',
    edited_at: null,
    content: 'a post',
    spoiler_text: '',
    visibility: 'public',
    url: null,
    account: { id: 'a', username: 'a', acct: 'a', display_name: 'A' } as never,
    reblog: null,
    quote: null,
    in_reply_to_id: null,
    replies_count: 0,
    reblogs_count: 0,
    favourites_count: 0,
    favourited: false,
    reblogged: false,
    bookmarked: false,
    muted: false,
    pinned: false,
    sensitive: false,
    poll: null,
    quote_approval_policy: null,
    media_attachments: [],
    ...overrides,
  };
}

/** Comfortably over the ratio line, so one extra favourite cannot clear it. */
function ratioed(overrides: Partial<Status> = {}): Status {
  return makeStatus({ replies_count: RATIO_MIN_REPLIES * RATIO_FACTOR * 4, ...overrides });
}

describe('CalmVerdicts', () => {
  let calm: CalmVerdicts;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    calm = TestBed.inject(CalmVerdicts);
  });

  it('agrees with isCalmHidden the first time it is asked', () => {
    // Distinct ids: verdicts are cached per id, so reusing one here would test
    // the cache rather than the agreement.
    const heated = ratioed({ id: 'heated' });
    const quiet = makeStatus({ id: 'quiet' });
    expect(calm.hidden(heated)).toBe(isCalmHidden(heated));
    expect(calm.hidden(quiet)).toBe(isCalmHidden(quiet));
  });

  it('holds its verdict when engagement counts move under it', () => {
    // The bug: liking a post raises favourites_count, which is an input to
    // isRatioed — so a hidden post could appear (or a shown one vanish)
    // mid-scroll, shifting everything below it.
    const before = ratioed();
    expect(calm.hidden(before)).toBe(true);

    const afterLike = { ...before, favourites_count: before.replies_count * 10 };
    // The raw predicate has changed its mind; the verdict must not.
    expect(isCalmHidden(afterLike)).toBe(false);
    expect(calm.hidden(afterLike)).toBe(true);
  });

  it('keeps a shown post shown after its counts change', () => {
    const quiet = makeStatus({ id: 'q', favourites_count: 10 });
    expect(calm.hidden(quiet)).toBe(false);

    const nowRatioed = { ...quiet, replies_count: 500, favourites_count: 10 };
    expect(isCalmHidden(nowRatioed)).toBe(true);
    expect(calm.hidden(nowRatioed)).toBe(false);
  });

  it('re-decides after a reset, which is what a feed reload does', () => {
    const post = ratioed();
    expect(calm.hidden(post)).toBe(true);

    calm.reset();
    const calmedDown = { ...post, favourites_count: post.replies_count * 10 };
    expect(calm.hidden(calmedDown)).toBe(false);
  });

  it('tracks posts independently by id', () => {
    expect(calm.hidden(ratioed({ id: 'loud' }))).toBe(true);
    expect(calm.hidden(makeStatus({ id: 'quiet' }))).toBe(false);
  });
});
