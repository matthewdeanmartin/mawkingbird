import { describe, expect, it } from 'vitest';
import {
  TIMELINE_ENVELOPE,
  TIMELINE_FIXTURE,
  USER_FIXTURE,
} from '../fixtures/twitterapi-io.fixtures';
import { TwitterApiError } from '../twitter-errors';
import {
  isWireTweet,
  isWireUser,
  parsePostsResponse,
  parseTimelineResponse,
  parseUserResponse,
} from './guards';

/** A response envelope shaped like the real one. */
const envelope = (data: unknown, extra: Record<string, unknown> = {}) => ({
  status: 'success',
  msg: 'success',
  data,
  ...extra,
});

describe('parseUserResponse', () => {
  it('accepts the captured live response', () => {
    expect(parseUserResponse(envelope(USER_FIXTURE)).userName).toBe('jack');
  });

  it('raises PROVIDER_CHANGED, not a TypeError, when data is gone', () => {
    // §10.2: a schema change must produce a controlled error the UI can explain,
    // never an exception from deep inside a normalizer.
    try {
      parseUserResponse({ status: 'success' });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(TwitterApiError);
      expect((error as TwitterApiError).code).toBe('PROVIDER_CHANGED');
      expect((error as TwitterApiError).message).toContain('data');
    }
  });

  it('names the missing field so a bug report is actionable', () => {
    try {
      parseUserResponse(envelope({ notAUser: true }));
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as TwitterApiError).message).toMatch(/user id or userName/);
    }
  });

  it('does not put the response body into the error', () => {
    // §10.2 forbids raw payloads in diagnostics.
    try {
      parseUserResponse(envelope({ secret: 'should-not-appear' }));
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(JSON.stringify(error)).not.toContain('should-not-appear');
    }
  });

  it('rejects a non-object body', () => {
    expect(() => parseUserResponse('<html>maintenance</html>')).toThrow(TwitterApiError);
  });
});

describe('parseTimelineResponse', () => {
  const body = envelope({ tweets: TIMELINE_FIXTURE, pin_tweet: null }, TIMELINE_ENVELOPE);

  it('reads pagination from the top level, not from data', () => {
    // The single most consequential shape detail: reading these from `data`
    // yields undefined forever, i.e. a timeline that silently never pages.
    const page = parseTimelineResponse(body);
    expect(page.hasMore).toBe(true);
    expect(page.cursor).toBeTruthy();
  });

  it('returns every valid post', () => {
    expect(parseTimelineResponse(body).tweets).toHaveLength(TIMELINE_FIXTURE.length);
  });

  it('drops one malformed post instead of failing the page', () => {
    // One unrenderable post should cost the reader that post, not the page.
    const page = parseTimelineResponse(
      envelope({ tweets: [TIMELINE_FIXTURE[0], { id: '1' }, { noId: true }] }),
    );
    expect(page.tweets).toHaveLength(1);
    expect(page.skipped).toBe(2);
  });

  it('treats an empty cursor as no more pages', () => {
    // Rule 2 of §8.6: an empty cursor is not a usable cursor. Passing one back
    // would re-request page one forever.
    const page = parseTimelineResponse(
      envelope({ tweets: [] }, { next_cursor: '', has_next_page: true }),
    );
    expect(page.cursor).toBeNull();
  });

  it('raises PROVIDER_CHANGED when tweets is not an array', () => {
    try {
      parseTimelineResponse(envelope({ tweets: 'nope' }));
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as TwitterApiError).code).toBe('PROVIDER_CHANGED');
      expect((error as TwitterApiError).message).toContain('data.tweets');
    }
  });

  it('accepts tweets at the top level, as tweet/replies sends them', () => {
    // Measured 2026-08-01: this API uses at least four envelope shapes. The
    // timeline endpoints nest under `data`; `tweet/replies` puts `tweets` at
    // the top level with pagination beside it. Assuming the nested shape threw
    // PROVIDER_CHANGED on a perfectly good replies response.
    const page = parseTimelineResponse({
      tweets: TIMELINE_FIXTURE,
      has_next_page: false,
      next_cursor: '',
      status: 'success',
      msg: 'success',
    });
    expect(page.tweets).toHaveLength(TIMELINE_FIXTURE.length);
    expect(page.hasMore).toBe(false);
  });

  it('handles an empty replies list', () => {
    // The real shape when a post has no replies — observed on a live post.
    const page = parseTimelineResponse({
      tweets: [],
      has_next_page: false,
      next_cursor: '',
      status: 'success',
    });
    expect(page.tweets).toEqual([]);
  });

  it('handles an empty timeline as an empty page, not an error', () => {
    const page = parseTimelineResponse(envelope({ tweets: [] }, { has_next_page: false }));
    expect(page.tweets).toEqual([]);
    expect(page.hasMore).toBe(false);
  });
});

describe('identity guards are permissive about everything but identity', () => {
  it('accepts a profile with only a handle', () => {
    // Nonessential fields may vanish without breaking rendering (§10.2).
    expect(isWireUser({ userName: 'x' })).toBe(true);
    expect(isWireUser({ id: '12' })).toBe(true);
  });

  it('rejects a profile with neither id nor handle', () => {
    // Nothing to link to or tell apart from any other account.
    expect(isWireUser({ name: 'no identity' })).toBe(false);
    expect(isWireUser(null)).toBe(false);
  });

  it('requires a post to have an id and an author', () => {
    expect(isWireTweet({ id: '1', author: { userName: 'a' } })).toBe(true);
    expect(isWireTweet({ id: '1' })).toBe(false);
    expect(isWireTweet({ author: { userName: 'a' } })).toBe(false);
  });

  it('rejects a numeric id, which would mean it had been through a JS number', () => {
    // A snowflake id does not survive a round-trip through a double: parsing
    // "2083317461269598348" as a number yields 2083317461269598200. Any id
    // arriving as a number has therefore already been corrupted, so the guard
    // rejects it rather than rendering a post that links to the wrong place.
    //
    // Built with Number() rather than written as a literal so the source itself
    // does not contain a value the language cannot represent.
    const corrupted = Number('2083317461269598348');
    expect(String(corrupted)).not.toBe('2083317461269598348');
    expect(isWireTweet({ id: corrupted, author: { userName: 'a' } })).toBe(false);
  });
});

describe('parsePostsResponse', () => {
  it('reads the batch endpoint shape, which nests differently again', () => {
    // /twitter/tweets returns `tweets` at the top level with NO data wrapper
    // and no pagination — a third shape from the same API.
    expect(parsePostsResponse({ tweets: TIMELINE_FIXTURE, status: 'success' })).toHaveLength(
      TIMELINE_FIXTURE.length,
    );
  });

  it('returns an empty list for a post that no longer exists', () => {
    // A deleted or withheld post comes back as an empty array, not an error.
    expect(parsePostsResponse({ tweets: [], status: 'success' })).toEqual([]);
  });

  it('raises PROVIDER_CHANGED when tweets is missing', () => {
    expect(() => parsePostsResponse({ status: 'success' })).toThrow(TwitterApiError);
  });
});
