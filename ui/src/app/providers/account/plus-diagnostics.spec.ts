/**
 * The Plus diagnostics panel's data.
 *
 * Two properties matter more than the numbers themselves. Reading must not
 * *change* anything — otherwise opening the panel silently resolves the very
 * difference the user opened it to inspect. And an unreadable remote copy must
 * report as unknown rather than as zero, because "the account holds nothing" is
 * a far more alarming claim than "this could not be checked", and acting on the
 * wrong one loses data.
 */

import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CollectionAdoptionRunner } from './collection-adoption-runner';
import { PlusDiagnostics } from './plus-diagnostics';
import { ProfileAccountKey } from './profile-account-key';
import { ProfileClient } from './profile-client';
import { ProfileFeeds } from './profile-feeds';
import { ProfileLists } from './profile-lists';
import { ProfileSync } from './profile-sync';
import { ProfileTrust } from './profile-trust';

function remoteDouble(count: number, error: string | null = null) {
  return { load: vi.fn().mockResolvedValue(undefined), count: () => count, error: () => error };
}

function build(
  options: {
    manifest?: unknown;
    trust?: ReturnType<typeof remoteDouble>;
    feeds?: ReturnType<typeof remoteDouble>;
    lists?: ReturnType<typeof remoteDouble>;
    localCounts?: Record<string, number>;
    dirty?: boolean;
    activeAccount?: string | null;
  } = {},
) {
  const inspect = vi.fn();
  const adoption = {
    localCount: (collection: string) => options.localCounts?.[collection] ?? 0,
    inspect,
  };
  const client = {
    manifest: vi.fn().mockResolvedValue(
      options.manifest ?? {
        kind: 'ok',
        value: {
          readOnly: false,
          settings: { etag: 'e', revision: 4, updatedAt: '2026-08-01T00:00:00Z', size: 2048 },
          quota: { used: 2048, limit: 1_000_000 },
          conflicts: 0,
        },
      },
    ),
  };

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: ProfileClient, useValue: client },
      { provide: CollectionAdoptionRunner, useValue: adoption },
      { provide: ProfileTrust, useValue: options.trust ?? remoteDouble(3) },
      { provide: ProfileFeeds, useValue: options.feeds ?? remoteDouble(2) },
      { provide: ProfileLists, useValue: options.lists ?? remoteDouble(1) },
      {
        provide: ProfileAccountKey,
        useValue: {
          current: () =>
            options.activeAccount === undefined
              ? 'mastodon:example.social/alice'
              : options.activeAccount,
        },
      },
      {
        provide: ProfileSync,
        useValue: {
          record: signal({ state: 'on', dirty: options.dirty ?? false }),
          syncing: signal(true),
        },
      },
    ],
  });
  return { diagnostics: TestBed.inject(PlusDiagnostics), inspect, client };
}

beforeEach(() => localStorage.clear());

describe('reading never writes', () => {
  it('does not adopt anything while gathering counts', async () => {
    // `inspect()` adopts whatever it can settle. Using it here would make
    // opening the panel a mutation, and one that resolves the difference the
    // user came to look at.
    const { diagnostics, inspect } = build();
    await diagnostics.load();
    expect(inspect).not.toHaveBeenCalled();
  });
});

describe('what it reports', () => {
  it('puts both sides of each collection side by side', async () => {
    const { diagnostics } = build({
      localCounts: { trust: 5, feeds: 2, lists: 0 },
      trust: remoteDouble(3),
      feeds: remoteDouble(2),
      lists: remoteDouble(1),
    });
    await diagnostics.load();

    const rows = diagnostics.collectionRows();
    expect(rows).toHaveLength(3);
    expect(rows.find((row) => row.collection === 'trust')).toMatchObject({ local: 5, remote: 3 });
    expect(rows.find((row) => row.collection === 'feeds')).toMatchObject({ local: 2, remote: 2 });
  });

  it('asks for the account-wide inventory only in user-triggered diagnostics', async () => {
    const { diagnostics, client } = build();
    await diagnostics.load();
    expect(client.manifest).toHaveBeenCalledWith({ includeAccounts: true });
  });

  it('shows every stored Mastodon persona beneath one Plus identity', async () => {
    const { diagnostics } = build({
      activeAccount: 'mastodon:example.social/alt',
      manifest: {
        kind: 'ok',
        value: {
          readOnly: false,
          quota: { used: 2048, limit: 1_000_000 },
          conflicts: 0,
          accounts: [
            {
              accountKey: 'mastodon:example.social/alice',
              collections: {
                trust: { revision: 2, count: 1 },
                feeds: { revision: 3, count: 2 },
                lists: { revision: 1, count: 1 },
              },
            },
          ],
        },
      },
    });
    await diagnostics.load();

    expect(diagnostics.accountRows()).toEqual([
      {
        accountKey: 'mastodon:example.social/alt',
        label: '@alt@example.social',
        active: true,
        stored: false,
        trust: 0,
        feeds: 0,
        lists: 0,
      },
      {
        accountKey: 'mastodon:example.social/alice',
        label: '@alice@example.social',
        active: false,
        stored: true,
        trust: 1,
        feeds: 2,
        lists: 1,
      },
    ]);
    expect(diagnostics.storedAccountCount()).toBe(1);
  });

  it('marks an already-stored active persona without adding a duplicate row', async () => {
    const { diagnostics } = build({
      activeAccount: 'mastodon:example.social/alice',
      manifest: {
        kind: 'ok',
        value: {
          readOnly: false,
          quota: { used: 2048, limit: 1_000_000 },
          conflicts: 0,
          accounts: [
            {
              accountKey: 'mastodon:example.social/alice',
              collections: {
                trust: { revision: 2, count: 1 },
                feeds: { revision: 3, count: 2 },
                lists: { revision: 1, count: 1 },
              },
            },
          ],
        },
      },
    });

    await diagnostics.load();

    expect(diagnostics.accountRows()).toEqual([
      expect.objectContaining({
        accountKey: 'mastodon:example.social/alice',
        active: true,
        stored: true,
        trust: 1,
        feeds: 2,
        lists: 1,
      }),
    ]);
  });

  it('does not invent an active persona when no provider account is selected', async () => {
    const { diagnostics } = build({
      activeAccount: null,
      manifest: {
        kind: 'ok',
        value: {
          readOnly: false,
          quota: { used: 2048, limit: 1_000_000 },
          conflicts: 0,
          accounts: [
            {
              accountKey: 'mastodon:example.social/alice',
              collections: { trust: { revision: 2, count: 1 } },
            },
          ],
        },
      },
    });

    await diagnostics.load();

    expect(diagnostics.accountRows()).toEqual([
      expect.objectContaining({
        accountKey: 'mastodon:example.social/alice',
        active: false,
        stored: true,
      }),
    ]);
  });

  it('reports an unreadable collection as unknown, not as zero', async () => {
    // Zero would assert the account holds nothing, which is a different and
    // much more alarming claim than "this could not be checked".
    const { diagnostics } = build({ trust: remoteDouble(0, 'offline') });
    await diagnostics.load();
    expect(
      diagnostics.collectionRows().find((row) => row.collection === 'trust')?.remote,
    ).toBeNull();
  });

  it('carries the stored revision and size', async () => {
    const { diagnostics } = build();
    await diagnostics.load();
    expect(diagnostics.settings().remoteRevision).toBe(4);
    expect(diagnostics.settings().remoteBytes).toBe(2048);
  });

  it('treats nothing-stored as an answer rather than a failure', async () => {
    const { diagnostics } = build({ manifest: { kind: 'absent' } });
    await diagnostics.load();
    expect(diagnostics.state()).toBe('ready');
    expect(diagnostics.settings().remoteBytes).toBeNull();
  });

  it('surfaces a failed manifest read', async () => {
    const { diagnostics } = build({
      manifest: { kind: 'failed', message: 'The account could not be reached.' },
    });
    await diagnostics.load();
    expect(diagnostics.state()).toBe('failed');
    expect(diagnostics.error()).toContain('could not be reached');
  });
});

describe('an account the server refuses to write to', () => {
  const readOnlyManifest = {
    kind: 'ok',
    value: {
      readOnly: true,
      quota: { used: 0, limit: 100_000_000 },
      conflicts: 0,
    },
  };

  it('says so, rather than reporting an empty account', () => {
    // The reported bug. A `tier: 'plus'` token against a service answering
    // `readOnly: true` rendered as "nothing stored" with a Sync button that
    // 402'd in silence. The refusal is the headline, not the emptiness.
    const { diagnostics } = build({ manifest: readOnlyManifest });
    return diagnostics.load().then(() => {
      expect(diagnostics.readOnly()).toBe(true);
      expect(diagnostics.blocked()).toContain('refusing writes');
    });
  });

  it('reports nothing blocked for an account that accepts writes', async () => {
    const { diagnostics } = build();
    await diagnostics.load();
    expect(diagnostics.blocked()).toBeNull();
  });

  it('says nothing before anything has been read', () => {
    // `idle` must not claim a refusal it has not observed.
    const { diagnostics } = build({ manifest: readOnlyManifest });
    expect(diagnostics.blocked()).toBeNull();
  });
});

describe('carrying read failures to the row', () => {
  it('keeps the reason next to the collection that failed', async () => {
    // A cell reading "0" for a collection whose read actually failed is a quiet
    // lie, and it is the lie that sends someone to fix the wrong problem.
    const { diagnostics } = build({ trust: remoteDouble(0, 'offline') });
    await diagnostics.load();
    const row = diagnostics.collectionRows().find((entry) => entry.collection === 'trust');
    expect(row?.remote).toBeNull();
    expect(row?.error).toBe('offline');
  });
});

describe('deciding whether anything drifted', () => {
  it('reports drift when this browser has unpushed changes', async () => {
    const { diagnostics } = build({ dirty: true });
    await diagnostics.load();
    expect(diagnostics.drifted()).toBe(true);
  });

  it('reports drift when a collection count differs', async () => {
    const { diagnostics } = build({ localCounts: { trust: 9 }, trust: remoteDouble(3) });
    await diagnostics.load();
    expect(diagnostics.drifted()).toBe(true);
  });

  it('does not call an unreadable collection drift', async () => {
    // A failed read is a fact about the network, not about the data. Offering
    // to "fix" it would push over a copy nobody has seen.
    const { diagnostics } = build({
      localCounts: { trust: 5, feeds: 2, lists: 1 },
      trust: remoteDouble(0, 'offline'),
      feeds: remoteDouble(2),
      lists: remoteDouble(1),
    });
    await diagnostics.load();
    expect(diagnostics.drifted()).toBe(false);
  });

  it('is quiet when both sides agree', async () => {
    const { diagnostics } = build({
      localCounts: { trust: 3, feeds: 2, lists: 1 },
      trust: remoteDouble(3),
      feeds: remoteDouble(2),
      lists: remoteDouble(1),
    });
    await diagnostics.load();
    expect(diagnostics.drifted()).toBe(false);
  });
});
