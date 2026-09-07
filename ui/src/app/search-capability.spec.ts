import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { Api } from './api';
import { SearchCapability } from './search-capability';

/** The three fields the probe reads off a SearchResults payload. */
function results(accounts: number, statuses: number, hashtags = 0) {
  return {
    accounts: Array.from({ length: accounts }, (_, i) => ({ id: `a${i}` })),
    statuses: Array.from({ length: statuses }, (_, i) => ({ id: `s${i}` })),
    hashtags: Array.from({ length: hashtags }, (_, i) => ({ name: `t${i}` })),
  };
}

/** An HttpErrorResponse-shaped rejection — the probe only looks at `status`. */
function httpError(status: number) {
  return throwError(() => ({ status }));
}

describe('SearchCapability', () => {
  let search: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    search = vi.fn();
    TestBed.configureTestingModule({
      providers: [{ provide: Api, useValue: { search } }],
    });
  });

  function capability(): SearchCapability {
    return TestBed.inject(SearchCapability);
  }

  it('knows nothing before it is asked', () => {
    expect(capability().peek('mastodon.social')).toEqual({
      accounts: 'unknown',
      statuses: 'unknown',
    });
  });

  it('reports both halves working when both canaries return results', async () => {
    search.mockReturnValue(of(results(1, 1)));

    expect(await capability().ensure('good.example')).toEqual({
      accounts: 'works',
      statuses: 'works',
    });
  });

  it('catches the no-post-search server: accounts work, posts are empty', async () => {
    // The case this whole service exists for. Nothing errors; the posts are simply
    // not served, and the old code rendered that as "No results."
    search.mockImplementation((_q: string, type: string) =>
      of(type === 'accounts' ? results(1, 0) : results(0, 0)),
    );

    expect(await capability().ensure('no-es.example')).toEqual({
      accounts: 'works',
      statuses: 'empty',
    });
  });

  it('distinguishes a tags-only answer from an empty one', async () => {
    // The tag matched and no posts came with it: the query was understood, so the
    // blank page is the server's limit and not a gap in what people have written.
    search.mockImplementation((_q: string, type: string) =>
      of(type === 'accounts' ? results(1, 0) : results(0, 0, 1)),
    );

    expect(await capability().ensure('tags-only.example')).toEqual({
      accounts: 'works',
      statuses: 'tags-only',
    });
  });

  it('asks for posts by hashtag with no type, so tag names are visible', async () => {
    // A bare word returns nothing anonymously anywhere, and type=statuses would
    // hide the tags-only case behind an empty payload.
    search.mockReturnValue(of(results(1, 1)));

    await capability().ensure('good.example');

    const [query, type] = search.mock.calls[1];
    expect(query).toMatch(/^#/);
    expect(type).toBeUndefined();
  });

  it('reports refused when the server demands a token', async () => {
    search.mockReturnValue(httpError(401));

    expect(await capability().ensure('closed.example')).toEqual({
      accounts: 'refused',
      statuses: 'refused',
    });
  });

  it('treats 422 as refused, matching the probe (some builds use it for token-only)', async () => {
    search.mockReturnValue(httpError(422));

    expect((await capability().ensure('closed.example')).accounts).toBe('refused');
  });

  it('reports unreachable for a network failure, which is not the same as refused', async () => {
    search.mockReturnValue(httpError(0));

    expect((await capability().ensure('offline.example')).accounts).toBe('unreachable');
  });

  it('spends nothing on the post canary when account search was refused', async () => {
    search.mockReturnValue(httpError(403));

    await capability().ensure('closed.example');

    // A host that refuses search refuses both halves; a second request would buy a
    // second copy of the same answer.
    expect(search).toHaveBeenCalledTimes(1);
  });

  it('probes accounts before posts, and only twice', async () => {
    search.mockReturnValue(of(results(1, 1)));

    await capability().ensure('good.example');

    expect(search.mock.calls.map((call) => call[1])).toEqual(['accounts', undefined]);
  });

  it('caches per host, so a second zero-result search costs nothing', async () => {
    search.mockReturnValue(of(results(1, 1)));
    const service = capability();

    await service.ensure('good.example');
    await service.ensure('good.example');

    expect(search).toHaveBeenCalledTimes(2); // the first probe's two canaries, not four
  });

  it('shares one probe between concurrent callers', async () => {
    search.mockReturnValue(of(results(1, 1)));
    const service = capability();

    const [first, second] = await Promise.all([
      service.ensure('good.example'),
      service.ensure('good.example'),
    ]);

    expect(first).toEqual(second);
    expect(search).toHaveBeenCalledTimes(2);
  });

  it('keeps hosts apart — one broken server does not condemn another', async () => {
    search.mockImplementation((_q: string, type: string) =>
      of(type === 'accounts' ? results(1, 0) : results(0, 0)),
    );
    const service = capability();
    await service.ensure('no-es.example');

    search.mockReturnValue(of(results(1, 1)));
    await service.ensure('good.example');

    expect(service.peek('no-es.example').statuses).toBe('empty');
    expect(service.peek('good.example').statuses).toBe('works');
  });

  it('forgets everything on reset, so a fixed server gets re-probed', async () => {
    search.mockReturnValue(httpError(401));
    const service = capability();
    await service.ensure('was-broken.example');

    service.reset();
    search.mockReturnValue(of(results(1, 1)));

    expect((await service.ensure('was-broken.example')).accounts).toBe('works');
  });

  it('survives a probe that throws synchronously rather than erroring the observable', async () => {
    search.mockImplementation(() => {
      throw new Error('boom');
    });

    expect((await capability().ensure('broken.example')).accounts).toBe('unreachable');
  });
});
