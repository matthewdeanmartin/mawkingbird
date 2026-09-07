import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { Api } from './api';
import { Auth } from './auth';
import { followedTagsCsv, ImportTags, normalizeTag, parseTags } from './import-tags';
import { Tag } from './models';
import { AnonymousTags } from './providers/anonymous/anonymous-tags';

describe('parseTags', () => {
  it('parses one tag per line, with or without the hash', () => {
    expect(parseTags('#photography\nbaking\n#Rust\n')).toEqual(['photography', 'baking', 'rust']);
  });

  it('splits several tags per line and dedupes case-insensitively', () => {
    const text = ['#cats, #dogs; #birds', 'cats  #Dogs', ''].join('\n');
    expect(parseTags(text)).toEqual(['cats', 'dogs', 'birds']);
  });

  it('reads tag page URLs and skips a CSV header row', () => {
    const text = [
      'Hashtag',
      'https://mastodon.social/tags/caturday',
      '/tags/foss',
      'example.org/tag/gardening/',
    ].join('\n');
    expect(parseTags(text)).toEqual(['caturday', 'foss', 'gardening']);
  });

  it('drops tokens that are not valid hashtags', () => {
    const text = ['#ok', 'not-a-tag', 'also.not', '12345', 'x'.repeat(31), '¯\\_(ツ)_/¯'].join(
      '\n',
    );
    expect(parseTags(text)).toEqual(['ok']);
  });
});

describe('normalizeTag', () => {
  it('handles the supported shapes', () => {
    expect(normalizeTag('#Foo')).toBe('foo');
    expect(normalizeTag('foo')).toBe('foo');
    expect(normalizeTag('"foo"')).toBe('foo');
    expect(normalizeTag('https://b.social/tags/Foo')).toBe('foo');
    expect(normalizeTag('https://b.social/tags/caf%C3%A9')).toBe('café');
    expect(normalizeTag('')).toBeNull();
    expect(normalizeTag('two words')).toBeNull();
  });
});

describe('followedTagsCsv', () => {
  it('round-trips through parseTags', () => {
    const csv = followedTagsCsv(['photography', 'baking']);
    expect(csv).toBe('Hashtag\nphotography\nbaking\n');
    expect(parseTags(csv)).toEqual(['photography', 'baking']);
  });
});

describe('ImportTags', () => {
  function setUp(api: Partial<Api>) {
    TestBed.configureTestingModule({ providers: [{ provide: Api, useValue: api }] });
    const importer = TestBed.inject(ImportTags);
    importer.delayMs = 0;
    importer.maxWaitMs = 1;
    return importer;
  }

  /** A followed_tags page; `next` marks there being more after it. */
  function page(names: string[], next: string | null = null) {
    return of({ tags: names.map((name) => ({ name }) as Tag), nextMaxId: next });
  }

  it('follows each tag sequentially', async () => {
    const followTag = vi.fn().mockReturnValue(of({ name: 'x', following: true }));
    const importer = setUp({ followTag } as unknown as Api);

    importer.load(['photography', 'baking']);
    await importer.start();

    expect(followTag.mock.calls.map((c) => c[0])).toEqual(['photography', 'baking']);
    expect(importer.rows().map((r) => r.status)).toEqual(['followed', 'followed']);
    expect(importer.running()).toBe(false);
  });

  it('retries the same tag after a 429 and marks other errors failed', async () => {
    const rateLimited = new HttpErrorResponse({ status: 429, headers: new HttpHeaders() });
    const followTag = vi
      .fn()
      .mockReturnValueOnce(throwError(() => rateLimited))
      .mockReturnValueOnce(of({ name: 'photography', following: true }))
      .mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 422 })));
    const importer = setUp({ followTag } as unknown as Api);

    importer.load(['photography', 'baking']);
    await importer.start();

    expect(followTag).toHaveBeenCalledTimes(3);
    expect(importer.rows()[0].status).toBe('followed');
    expect(importer.rows()[1].status).toBe('failed');
    expect(importer.rows()[1].error).toBe('The server rejected this hashtag.');
  });

  it('stop() halts the run, leaving the rest pending', async () => {
    const followTag = vi.fn().mockImplementation(() => {
      importer.stop();
      return of({ name: 'photography', following: true });
    });
    const importer = setUp({ followTag } as unknown as Api);

    importer.load(['photography', 'baking']);
    await importer.start();

    expect(importer.rows()[0].status).toBe('followed');
    expect(importer.rows()[1].status).toBe('pending');
  });

  it('saves anonymous follows locally and surfaces the cap as the row error', async () => {
    const follow = vi.fn().mockReturnValueOnce({ ok: true }).mockReturnValueOnce({
      ok: false,
      error: 'Anonymous accounts can follow up to 10 hashtags.',
    });
    TestBed.configureTestingModule({
      providers: [
        { provide: Api, useValue: {} },
        { provide: Auth, useValue: { isAnonymous: true } },
        { provide: AnonymousTags, useValue: { follow, tags: () => [] } },
      ],
    });
    const importer = TestBed.inject(ImportTags);
    importer.delayMs = 0;
    importer.load(['photography', 'baking']);

    await importer.start();

    expect(follow.mock.calls.map((c) => c[0])).toEqual(['photography', 'baking']);
    expect(importer.rows()[0].status).toBe('followed');
    expect(importer.rows()[1].status).toBe('failed');
    expect(importer.rows()[1].error).toBe('Anonymous accounts can follow up to 10 hashtags.');
  });

  it('skips tags you already follow, and reports the net change', async () => {
    const followedTagsPage = vi.fn().mockReturnValueOnce(page(['baking']));
    const followTag = vi.fn().mockReturnValue(of({ name: 'x', following: true }));
    const importer = setUp({ followedTagsPage, followTag } as unknown as Api);

    importer.load(['photography', 'baking']);
    await importer.start();

    // The already-followed one never costs a follow call.
    expect(followTag.mock.calls.map((c) => c[0])).toEqual(['photography']);
    expect(importer.rows().map((r) => r.status)).toEqual(['followed', 'already_followed']);
    // One page that ended is the whole list, so the net change is known.
    expect(importer.knowsFollowState()).toBe(true);
  });

  it('reads at most two pages, then follows the rest blind rather than paging on', async () => {
    const followedTagsPage = vi
      .fn()
      .mockReturnValueOnce(page(['baking'], '1'))
      .mockReturnValueOnce(page(['gardening'], '2'));
    const followTag = vi.fn().mockReturnValue(of({ name: 'x', following: true }));
    const getTag = vi.fn();
    const importer = setUp({ followedTagsPage, followTag, getTag } as unknown as Api);

    // Ten tags: too many for the per-tag top-up, so the run stays at two reads.
    importer.load(Array.from({ length: 10 }, (_, i) => `tag${i}`));
    await importer.start();

    expect(followedTagsPage).toHaveBeenCalledTimes(2);
    expect(getTag).not.toHaveBeenCalled();
    expect(followTag).toHaveBeenCalledTimes(10);
    // The probe was cut short, so the "already followed" count is a floor and
    // nothing is claimed about the net change.
    expect(importer.knowsFollowState()).toBe(false);
  });

  it('tops a short probe up per-tag when the import is small', async () => {
    const followedTagsPage = vi
      .fn()
      .mockReturnValueOnce(page(['baking'], '1'))
      .mockReturnValueOnce(page(['gardening'], '2'));
    const getTag = vi
      .fn()
      .mockReturnValueOnce(of({ name: 'photography', following: true } as Tag))
      .mockReturnValueOnce(of({ name: 'caturday', following: false } as Tag));
    const followTag = vi.fn().mockReturnValue(of({ name: 'x', following: true }));
    const importer = setUp({ followedTagsPage, getTag, followTag } as unknown as Api);

    importer.load(['photography', 'caturday']);
    await importer.start();

    // 'photography' came back already-followed, so only 'caturday' is written.
    expect(followTag.mock.calls.map((c) => c[0])).toEqual(['caturday']);
    expect(importer.rows().map((r) => r.status)).toEqual(['already_followed', 'followed']);
    expect(importer.knowsFollowState()).toBe(true);
  });

  it('follows everything as before when the probe itself fails', async () => {
    const followedTagsPage = vi
      .fn()
      .mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
    const followTag = vi.fn().mockReturnValue(of({ name: 'x', following: true }));
    const importer = setUp({ followedTagsPage, followTag } as unknown as Api);

    importer.load(['photography', 'baking']);
    await importer.start();

    // Probing is an optimization; losing it must not lose the import.
    expect(followTag).toHaveBeenCalledTimes(2);
    expect(importer.rows().map((r) => r.status)).toEqual(['followed', 'followed']);
    expect(importer.knowsFollowState()).toBe(false);
  });

  it('keeps the overlap it found when the probe fails partway through', async () => {
    const followedTagsPage = vi
      .fn()
      .mockReturnValueOnce(page(['baking'], '1'))
      .mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 500 })));
    const followTag = vi.fn().mockReturnValue(of({ name: 'x', following: true }));
    const importer = setUp({ followedTagsPage, followTag } as unknown as Api);

    // Ten tags, so no per-tag top-up rescues this.
    importer.load(['baking', ...Array.from({ length: 9 }, (_, i) => `tag${i}`)]);
    await importer.start();

    // The first page still told us about 'baking'; losing page two is no reason
    // to throw that away and re-follow it.
    expect(importer.rows()[0].status).toBe('already_followed');
    expect(followTag).toHaveBeenCalledTimes(9);
    expect(importer.knowsFollowState()).toBe(false);
  });

  it('reads local state for anonymous, which is free and always complete', async () => {
    const follow = vi.fn().mockReturnValue({ ok: true });
    TestBed.configureTestingModule({
      providers: [
        { provide: Api, useValue: {} },
        { provide: Auth, useValue: { isAnonymous: true } },
        { provide: AnonymousTags, useValue: { follow, tags: () => ['baking'] } },
      ],
    });
    const importer = TestBed.inject(ImportTags);
    importer.delayMs = 0;
    importer.load(['photography', 'baking']);

    await importer.start();

    expect(follow.mock.calls.map((c) => c[0])).toEqual(['photography']);
    expect(importer.rows().map((r) => r.status)).toEqual(['followed', 'already_followed']);
    expect(importer.knowsFollowState()).toBe(true);
  });
});
