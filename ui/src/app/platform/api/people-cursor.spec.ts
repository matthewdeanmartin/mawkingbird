import { describe, expect, it } from 'vitest';
import { Account } from './models';
import { peopleCursorFrom } from './people-cursor';

/** Only `id` is read by the cursor logic; the rest keeps the type honest. */
function accounts(...ids: string[]): Account[] {
  return ids.map((id) => ({ id }) as Account);
}

/** A full page, so "is there more?" is a real question rather than a short tail. */
function fullPage(limit: number): Account[] {
  return accounts(...Array.from({ length: limit }, (_, i) => String(i + 1)));
}

const NEXT = '<https://x.test/api/v1/accounts/1/followers?max_id=4242>; rel="next"';

describe('peopleCursorFrom', () => {
  it('prefers the server cursor whenever the header carries one', () => {
    const page = peopleCursorFrom(NEXT, fullPage(80), 80);
    expect(page).toEqual({ nextMaxId: '4242', source: 'link-header' });
  });

  it('takes the server at its word when it sends a header with no next', () => {
    // The server answered the pagination question. A full page is not a reason
    // to argue with it — this is the case the fallback must never hijack.
    const header = '<https://x.test/api/v1/accounts/1/followers?min_id=9>; rel="prev"';
    expect(peopleCursorFrom(header, fullPage(80), 80)).toEqual({
      nextMaxId: null,
      source: 'link-header',
    });
  });

  it('walks on the last account id when the header never arrived', () => {
    // The CORS case: a full page, and no way to ask the server for the cursor.
    // Stopping here is what showed 80 followers to an account that has 3,000.
    const page = peopleCursorFrom(null, fullPage(80), 80);
    expect(page).toEqual({ nextMaxId: '80', source: 'account-id-fallback' });
  });

  it('does not guess on a short page, which already means the end', () => {
    // The fence that stops a wrong cursor from looping forever: a short page
    // ends the walk without needing any cursor at all.
    expect(peopleCursorFrom(null, accounts('1', '2', '3'), 80)).toEqual({
      nextMaxId: null,
      source: 'short-page',
    });
  });

  it('treats an empty page as the end rather than reading off it', () => {
    expect(peopleCursorFrom(null, [], 80)).toEqual({
      nextMaxId: null,
      source: 'short-page',
    });
  });

  it('measures a full page against the limit actually requested', () => {
    // A caller asking for 20 gets 20: full by that request's standard, even
    // though it would be a short page for the default limit of 80.
    expect(peopleCursorFrom(null, fullPage(20), 20)).toEqual({
      nextMaxId: '20',
      source: 'account-id-fallback',
    });
  });
});
