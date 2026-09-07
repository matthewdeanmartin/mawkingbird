import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PasteHistory, PasteRecord } from './paste-history';

/** Edit codes are stored apart from the records — see storage-registry.ts. */
function storedEditKeys(): Record<string, string> {
  return JSON.parse(localStorage.getItem('mockingbird_paste_edit_keys') ?? '{}');
}

function created(slug: string) {
  return {
    slug,
    url: `https://pastepile.com/p/${slug}`,
    rawUrl: `https://pastepile.com/raw/${slug}`,
    editKey: `key-${slug}`,
  };
}

const INPUT = {
  title: '',
  content: 'hello',
  language: 'plaintext',
  expiry: '1w',
  visibility: 'unlisted',
} as const;

describe('PasteHistory', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('persists links and edit keys for the browser', () => {
    const history = TestBed.inject(PasteHistory);
    history.add(
      'pastepile',
      'Pastepile',
      {
        title: 'Test',
        content: 'hello',
        language: 'plaintext',
        expiry: '1w',
        visibility: 'unlisted',
      },
      {
        slug: 'abc',
        url: 'https://pastepile.com/p/abc',
        rawUrl: 'https://pastepile.com/raw/abc',
        editKey: 'secret',
      },
    );

    const stored = JSON.parse(localStorage.getItem('mockingbird_pastes') ?? '[]');
    expect(stored[0].providerId).toBe('pastepile');
    // The edit code is a capability, so it must NOT be in the record blob.
    expect(stored[0].editKey).toBeUndefined();
    expect(storedEditKeys()['abc']).toBe('secret');
  });

  it('updates and forgets a record', () => {
    const history = TestBed.inject(PasteHistory);
    history.add(
      'pastepile',
      'Pastepile',
      {
        title: '',
        content: 'old',
        language: 'plaintext',
        expiry: '1d',
        visibility: 'public',
      },
      {
        slug: 'abc',
        url: 'https://pastepile.com/p/abc',
        rawUrl: 'https://pastepile.com/raw/abc',
        editKey: 'secret',
      },
    );

    history.update('abc', { content: 'new' });
    expect(history.records()[0].content).toBe('new');
    history.remove('abc');
    expect(history.records()).toEqual([]);
  });

  it('evicts the oldest entries (keeping the newest) when localStorage is full', () => {
    const history = TestBed.inject(PasteHistory);
    // Seed three older records that persisted fine.
    history.add('rentry', 'Rentry', INPUT, created('old1'));
    history.add('rentry', 'Rentry', INPUT, created('old2'));
    history.add('rentry', 'Rentry', INPUT, created('old3'));

    // Now the disk is "full": reject the first (full-list) write, accept a
    // trimmed one. The newest paste must survive on disk.
    let calls = 0;
    const real = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      calls++;
      // Reject only while all four records are present; accept once trimmed.
      const count = (JSON.parse(value) as PasteRecord[]).length;
      if (count >= 4) throw new DOMException('quota', 'QuotaExceededError');
      real.call(this, key, value);
    });

    history.add('tinyurl', 'TinyURL link', INPUT, created('newest'));

    expect(calls).toBeGreaterThan(1); // retried after the first rejection
    expect(history.persistError()).toContain('oldest');
    // In-memory keeps everything for the session…
    expect(history.records()[0].slug).toBe('newest');
    // …and the newest survived to disk.
    const stored = JSON.parse(localStorage.getItem('mockingbird_pastes') ?? '[]') as PasteRecord[];
    expect(stored.some((r) => r.slug === 'newest')).toBe(true);
    expect(stored.some((r) => r.slug === 'old1')).toBe(false);
  });

  it('reports an unrecoverable failure when even the newest paste will not fit', () => {
    const history = TestBed.inject(PasteHistory);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });

    history.add('tinyurl', 'TinyURL link', INPUT, created('doomed'));

    expect(history.persistError()).toContain('could not be saved');
    // The signal still holds it so the current session can show/copy the link.
    expect(history.records()[0].slug).toBe('doomed');
  });
});
