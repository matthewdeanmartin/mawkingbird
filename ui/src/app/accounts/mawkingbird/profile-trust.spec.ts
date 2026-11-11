import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfileCollections } from './profile-collections';
import type { CollectionResult } from './profile-collections';
import { ProfileTrust, SETTINGS_ID, entryId } from './profile-trust';
import type { ProfileTrustEntry, ProfileTrustSettings } from './profile-trust';

/**
 * Trust as a provider collection.
 *
 * The shape worth testing beyond the usual rollback rules is the split: one
 * object per trusted account plus a reserved settings object sharing the same
 * collection. A load that confused the two would either drop the level or
 * present the settings object as a person.
 */

function entry(key: string, over: Partial<ProfileTrustEntry> = {}): ProfileTrustEntry {
  return { key, acct: key, since: 1_700_000_000_000, ...over };
}

const SETTINGS: ProfileTrustSettings = {
  level: 'follows',
  expandAllCw: true,
  showAllSensitive: false,
};

class FakeCollections {
  items: { id: string; value: unknown }[] = [];
  nextResult: CollectionResult<never> | null = null;
  batchCalls = 0;

  index = vi.fn(() => {
    if (this.nextResult) {
      return Promise.resolve(this.nextResult);
    }
    return Promise.resolve({
      kind: 'ok' as const,
      value: {
        index: {
          kind: 'mawkingbird-profile-index' as const,
          collection: 'trust',
          revision: 1,
          updatedAt: '2026-08-18T00:00:00.000Z',
          items: this.items.map((item) => ({
            id: item.id,
            updatedAt: '2026-08-18T00:00:00.000Z',
            size: 100,
            inline: item.value,
          })),
        },
        etag: '"e1"',
      },
    });
  });

  put = vi.fn((_collection: string, id: string, value: unknown) => {
    if (this.nextResult) {
      return Promise.resolve(this.nextResult);
    }
    this.items = [...this.items.filter((item) => item.id !== id), { id, value }];
    return Promise.resolve({ kind: 'ok' as const, value: { revision: 1 } });
  });

  remove = vi.fn((_collection: string, id: string) => {
    if (this.nextResult) {
      return Promise.resolve(this.nextResult);
    }
    this.items = this.items.filter((item) => item.id !== id);
    return Promise.resolve({ kind: 'ok' as const, value: { revision: 1 } });
  });

  batch = vi.fn((_collection: string, operations: { id: string; value?: unknown }[]) => {
    this.batchCalls++;
    if (this.nextResult) {
      return Promise.resolve(this.nextResult);
    }
    for (const operation of operations) {
      if (operation.value !== undefined) {
        this.items = [
          ...this.items.filter((item) => item.id !== operation.id),
          { id: operation.id, value: operation.value },
        ];
      }
    }
    return Promise.resolve({
      kind: 'ok' as const,
      value: { written: operations.length, deleted: 0, revision: 1 },
    });
  });
}

describe('entryId', () => {
  it('turns an account key into a legal object id', () => {
    // Account keys carry a colon and a slash; the slash would put a path segment
    // into an R2 key, which is the bug the encoding exists to prevent.
    const id = entryId('mastodon:example.social/alice');
    expect(id).not.toBeNull();
    expect(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id ?? '')).toBe(true);
  });

  it('can never collide with the reserved settings id', () => {
    // The prefix is what guarantees it, so an account literally called
    // "settings" is still safe.
    expect(entryId('settings')).not.toBe(SETTINGS_ID);
    expect(entryId('settings')?.startsWith('acct-')).toBe(true);
  });

  it('is stable per key and distinct between keys', () => {
    expect(entryId('mastodon:a.social/x')).toBe(entryId('mastodon:a.social/x'));
    expect(entryId('mastodon:a.social/x')).not.toBe(entryId('mastodon:a.social/y'));
  });
});

describe('ProfileTrust', () => {
  let trust: ProfileTrust;
  let collections: FakeCollections;

  beforeEach(() => {
    localStorage.clear();
    collections = new FakeCollections();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: ProfileCollections, useValue: collections }],
    });
    trust = TestBed.inject(ProfileTrust);
  });

  it('is not loaded before the first fetch', () => {
    expect(trust.loaded()).toBe(false);
    expect(trust.count()).toBe(0);
  });

  it('separates trusted accounts from the settings object', async () => {
    collections.items = [
      { id: entryId('mastodon:a.social/x') ?? '', value: entry('mastodon:a.social/x') },
      { id: SETTINGS_ID, value: SETTINGS },
    ];

    await trust.load();

    // The settings object shares the collection but is not a person.
    expect(trust.count()).toBe(1);
    expect(trust.entries()[0].key).toBe('mastodon:a.social/x');
    expect(trust.settings().level).toBe('follows');
  });

  it('falls back to the default level when nothing is stored', async () => {
    await trust.load();

    expect(trust.settings()).toEqual({
      level: 'none',
      expandAllCw: false,
      showAllSensitive: false,
    });
  });

  it('trusts an account', async () => {
    const ok = await trust.trust('mastodon:a.social/x', '@x@a.social');

    expect(ok).toBe(true);
    expect(trust.trusts('mastodon:a.social/x')).toBe(true);
  });

  it('keeps the original date when re-trusting someone already trusted', async () => {
    await trust.trust('mastodon:a.social/x', '@x@a.social');
    const since = trust.entries()[0].since;

    await trust.trust('mastodon:a.social/x', '@renamed@a.social');

    // Re-trusting is a handle refresh, not a new judgement; moving the date
    // would reorder a list that sorts by it.
    expect(trust.count()).toBe(1);
    expect(trust.entries()[0].since).toBe(since);
    expect(trust.entries()[0].acct).toBe('@renamed@a.social');
  });

  it('rolls back a refused trust', async () => {
    collections.nextResult = { kind: 'payment-required', message: 'Subscription lapsed.' };

    const ok = await trust.trust('mastodon:a.social/x', '@x@a.social');

    expect(ok).toBe(false);
    expect(trust.trusts('mastodon:a.social/x')).toBe(false);
    expect(trust.canWrite()).toBe(false);
  });

  it('rolls back a refused untrust', async () => {
    await trust.trust('mastodon:a.social/x', '@x@a.social');
    collections.nextResult = { kind: 'failed', message: 'Offline.' };

    const ok = await trust.untrust('mastodon:a.social/x');

    expect(ok).toBe(false);
    // Still trusted: a failed removal must not look like a successful one.
    expect(trust.trusts('mastodon:a.social/x')).toBe(true);
  });

  it('rolls back refused settings', async () => {
    collections.nextResult = { kind: 'failed', message: 'Offline.' };

    const ok = await trust.saveSettings(SETTINGS);

    expect(ok).toBe(false);
    expect(trust.settings().level).toBe('none');
  });

  it('uploads a whole trust list and its settings in one write', async () => {
    const ok = await trust.replaceAll(
      [entry('mastodon:a.social/x'), entry('mastodon:a.social/y')],
      SETTINGS,
    );

    expect(ok).toBe(true);
    expect(collections.batchCalls).toBe(1);
    expect(trust.count()).toBe(2);
    expect(trust.settings().level).toBe('follows');
  });

  it('treats an empty collection as loaded rather than failed', async () => {
    collections.nextResult = { kind: 'absent' };

    await trust.load();

    expect(trust.loaded()).toBe(true);
    expect(trust.error()).toBeNull();
  });
});
