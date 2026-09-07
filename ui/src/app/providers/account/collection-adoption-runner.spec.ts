import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CollectionAdoptionRunner } from './collection-adoption-runner';
import { ProfileFeeds } from './profile-feeds';
import { ProfileTrust } from './profile-trust';
import type { ProfileTrustEntry, ProfileTrustSettings } from './profile-trust';
import type { ProfileFeed } from './profile-feeds';
import { RssSubscriptions } from '../rss/rss-subscriptions';
import { TrustedAccounts } from '../../trusted-accounts';
import { ProfileLists } from './profile-lists';
import type { ProfileList } from './profile-lists';
import { ClientLists } from '../../lists/client-lists';

/**
 * Switching a collection's sync on for the first time.
 *
 * The behaviour that matters is what reaches the *account*: an upload must never
 * contain something the account already holds, or a browser the user is not
 * looking at loses an edit. The rest is bookkeeping.
 */

class FakeProfileTrust {
  entriesValue: ProfileTrustEntry[] = [];
  settingsValue: ProfileTrustSettings = {
    level: 'none',
    expandAllCw: false,
    showAllSensitive: false,
  };
  failure: string | null = null;
  writeOk = true;
  uploaded: ProfileTrustEntry[] | null = null;

  load = vi.fn(() => Promise.resolve());
  entries = () => this.entriesValue;
  settings = () => this.settingsValue;
  count = () => this.entriesValue.length;
  error = () => this.failure;
  replaceAll = vi.fn((entries: ProfileTrustEntry[]) => {
    this.uploaded = entries;
    return Promise.resolve(this.writeOk);
  });
}

class FakeProfileFeeds {
  feedsValue: ProfileFeed[] = [];
  failure: string | null = null;
  writeOk = true;
  uploaded: ProfileFeed[] | null = null;

  load = vi.fn(() => Promise.resolve());
  feeds = () => this.feedsValue;
  count = () => this.feedsValue.length;
  error = () => this.failure;
  replaceAll = vi.fn((feeds: ProfileFeed[]) => {
    this.uploaded = feeds;
    return Promise.resolve(this.writeOk);
  });
}

class FakeProfileLists {
  listsValue: ProfileList[] = [];
  failure: string | null = null;
  writeOk = true;
  written: ProfileList[] | null = null;
  copiedIn: ProfileList[] | null = null;

  load = vi.fn(() => Promise.resolve());
  lists = () => this.listsValue;
  count = () => this.listsValue.length;
  error = () => this.failure;
  writeAll = vi.fn((lists: ProfileList[]) => {
    this.written = lists;
    return Promise.resolve(this.writeOk);
  });
  copyIn = vi.fn((lists: ProfileList[]) => {
    this.copiedIn = lists;
    // Mirrors the real thing: ids are regenerated, and the store then holds the
    // account's view.
    this.listsValue = lists.map((list, index) => ({ ...list, id: `mwk-${index}` }));
    return Promise.resolve(
      this.writeOk
        ? { kind: 'ok' as const, value: { written: lists.length } }
        : { kind: 'failed' as const, message: 'nope' },
    );
  });
}

describe('CollectionAdoptionRunner', () => {
  let runner: CollectionAdoptionRunner;
  let remoteTrust: FakeProfileTrust;
  let remoteFeeds: FakeProfileFeeds;
  let localTrust: TrustedAccounts;
  let localFeeds: RssSubscriptions;
  let remoteLists: FakeProfileLists;
  let localLists: ClientLists;

  beforeEach(() => {
    localStorage.clear();
    remoteTrust = new FakeProfileTrust();
    remoteFeeds = new FakeProfileFeeds();
    remoteLists = new FakeProfileLists();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: ProfileTrust, useValue: remoteTrust },
        { provide: ProfileFeeds, useValue: remoteFeeds },
        { provide: ProfileLists, useValue: remoteLists },
      ],
    });
    runner = TestBed.inject(CollectionAdoptionRunner);
    localTrust = TestBed.inject(TrustedAccounts);
    localFeeds = TestBed.inject(RssSubscriptions);
    localLists = TestBed.inject(ClientLists);
  });

  describe('inspect', () => {
    it('asks when both sides hold something', async () => {
      localTrust.trust({ acct: 'a@x.social', url: '', id: '1' });
      remoteTrust.entriesValue = [{ key: 'b@x.social', acct: 'b@x.social', since: 1 }];

      const result = await runner.inspect('trust');

      expect(result.needsChoice).toBe(true);
      expect(result.localCount).toBe(1);
      expect(result.remoteCount).toBe(1);
      // Nothing applied yet — the question is still open.
      expect(remoteTrust.replaceAll).not.toHaveBeenCalled();
    });

    it('settles silently when the account holds nothing', async () => {
      localTrust.trust({ acct: 'a@x.social', url: '', id: '1' });

      const result = await runner.inspect('trust');

      expect(result.needsChoice).toBe(false);
      expect(remoteTrust.uploaded?.map((entry) => entry.key)).toEqual(['a@x.social']);
    });

    it('settles silently when this browser holds nothing', async () => {
      remoteTrust.entriesValue = [{ key: 'b@x.social', acct: 'b@x.social', since: 5 }];

      const result = await runner.inspect('trust');

      expect(result.needsChoice).toBe(false);
      // Adopted locally, and nothing sent back up.
      expect(Object.keys(localTrust.entries())).toEqual(['b@x.social']);
      expect(remoteTrust.replaceAll).not.toHaveBeenCalled();
    });

    it('reports a failed read without changing anything', async () => {
      localTrust.trust({ acct: 'a@x.social', url: '', id: '1' });
      remoteTrust.failure = 'Offline.';

      const result = await runner.inspect('trust');

      expect(result.error).toBe('Offline.');
      expect(result.needsChoice).toBe(false);
      expect(remoteTrust.replaceAll).not.toHaveBeenCalled();
      expect(Object.keys(localTrust.entries())).toEqual(['a@x.social']);
    });

    it('reports a failed automatic upload', async () => {
      localTrust.trust({ acct: 'a@x.social', url: '', id: '1' });
      remoteTrust.writeOk = false;

      const result = await runner.inspect('trust');

      expect(result.error).toContain('could not be saved');
      expect(result.needsChoice).toBe(false);
      // A refused write must not masquerade as a completed adoption.
      expect(Object.keys(localTrust.entries())).toEqual(['a@x.social']);
    });
  });

  describe('trust', () => {
    it('merges without uploading anything the account already holds', async () => {
      localTrust.trust({ acct: 'shared@x.social', url: '', id: '1' });
      localTrust.trust({ acct: 'mine@x.social', url: '', id: '2' });
      remoteTrust.entriesValue = [
        { key: 'shared@x.social', acct: 'shared@x.social', since: 111 },
        { key: 'theirs@x.social', acct: 'theirs@x.social', since: 222 },
      ];

      await runner.apply('trust', 'merge');

      // The rule that protects the other browser: only genuinely new items go up.
      expect(remoteTrust.uploaded?.map((entry) => entry.key)).toEqual(['mine@x.social']);
      expect(Object.keys(localTrust.entries()).sort()).toEqual([
        'mine@x.social',
        'shared@x.social',
        'theirs@x.social',
      ]);
    });

    it('keeps the stored date for an entry held on both sides', async () => {
      localTrust.trust({ acct: 'shared@x.social', url: '', id: '1' });
      remoteTrust.entriesValue = [{ key: 'shared@x.social', acct: 'shared@x.social', since: 111 }];

      await runner.apply('trust', 'merge');

      // Adopting through `trust()` would re-date it to now and destroy the
      // ordering the settings list sorts by.
      expect(localTrust.entries()['shared@x.social'].since).toBe(111);
    });

    it('replaces local with the account copy', async () => {
      localTrust.trust({ acct: 'mine@x.social', url: '', id: '1' });
      remoteTrust.entriesValue = [{ key: 'theirs@x.social', acct: 'theirs@x.social', since: 9 }];

      await runner.apply('trust', 'replace');

      expect(Object.keys(localTrust.entries())).toEqual(['theirs@x.social']);
      expect(remoteTrust.replaceAll).not.toHaveBeenCalled();
    });

    it('takes the account’s level rather than this browser’s', async () => {
      localTrust.setLevel('follows-boosts');
      remoteTrust.entriesValue = [{ key: 'b@x.social', acct: 'b@x.social', since: 1 }];
      remoteTrust.settingsValue = {
        level: 'individuals',
        expandAllCw: true,
        showAllSensitive: false,
      };

      await runner.apply('trust', 'merge');

      // Same rule as the entries: the stored copy is what every other browser
      // agreed on.
      expect(localTrust.level()).toBe('individuals');
      expect(localTrust.expandAllCwSetting()).toBe(true);
    });

    it('sends this browser’s level up when the account has nothing', async () => {
      localTrust.setLevel('follows');
      localTrust.trust({ acct: 'a@x.social', url: '', id: '1' });

      await runner.apply('trust', 'merge');

      expect(remoteTrust.replaceAll).toHaveBeenCalled();
      expect(localTrust.level()).toBe('follows');
    });

    it('leaves the local store untouched when the upload fails', async () => {
      localTrust.trust({ acct: 'mine@x.social', url: '', id: '1' });
      remoteTrust.entriesValue = [{ key: 'theirs@x.social', acct: 'theirs@x.social', since: 1 }];
      remoteTrust.writeOk = false;

      const ok = await runner.apply('trust', 'merge');

      expect(ok).toBe(false);
      // A failed upload must not half-apply a reconciliation.
      expect(Object.keys(localTrust.entries())).toEqual(['mine@x.social']);
    });
  });

  describe('lists', () => {
    it('treats the same title as the same list and unions the members', async () => {
      // The same person made both sides, so two lists called "Friends" are one
      // list — but taking the account's copy wholesale would drop anyone added
      // on this browser.
      const friends = localLists.create('Friends');
      localLists.setMember(friends.id, 'a@x.social', true);
      remoteLists.listsValue = [
        {
          id: 'mwk-1',
          title: 'Friends',
          memberHandles: ['b@x.social'],
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ];

      await runner.apply('lists', 'merge');

      expect(localLists.lists()).toHaveLength(1);
      expect([...localLists.lists()[0].memberHandles].sort()).toEqual(['a@x.social', 'b@x.social']);
    });

    it('matches titles regardless of case and surrounding space', async () => {
      localLists.create('  friends ');
      remoteLists.listsValue = [
        {
          id: 'mwk-1',
          title: 'Friends',
          memberHandles: [],
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ];

      await runner.apply('lists', 'merge');

      // One list, not two that differ by whitespace.
      expect(localLists.lists()).toHaveLength(1);
    });

    it('takes the account’s id for a list held on both sides', async () => {
      const friends = localLists.create('Friends');
      expect(friends.id).not.toBe('mwk-1');
      remoteLists.listsValue = [
        {
          id: 'mwk-1',
          title: 'Friends',
          memberHandles: [],
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ];

      await runner.apply('lists', 'merge');

      // Keeping the local id would write a second object for a list the account
      // already has.
      expect(localLists.lists()[0].id).toBe('mwk-1');
    });

    it('does not rewrite a list whose members already match', async () => {
      localLists.create('Friends');
      remoteLists.listsValue = [
        {
          id: 'mwk-1',
          title: 'Friends',
          memberHandles: [],
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ];

      await runner.apply('lists', 'merge');

      expect(remoteLists.writeAll).not.toHaveBeenCalled();
    });

    it('carries across a list the account has never seen', async () => {
      localLists.create('Mine only');
      remoteLists.listsValue = [
        {
          id: 'mwk-1',
          title: 'Theirs',
          memberHandles: [],
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ];

      await runner.apply('lists', 'merge');

      expect(remoteLists.written?.map((list) => list.title)).toEqual(['Mine only']);
      expect(
        localLists
          .lists()
          .map((list) => list.title)
          .sort(),
      ).toEqual(['Mine only', 'Theirs']);
    });

    it('uses copyIn when the account has nothing, and takes the ids it minted', async () => {
      localLists.create('Friends');

      await runner.apply('lists', 'merge');

      expect(remoteLists.copyIn).toHaveBeenCalled();
      // `copyIn` regenerates ids, so this browser has to take the account's
      // view rather than the plan, which still names the old local id.
      expect(localLists.lists()[0].id).toBe('mwk-0');
    });

    it('replaces local with the account copy', async () => {
      localLists.create('Mine');
      remoteLists.listsValue = [
        {
          id: 'mwk-1',
          title: 'Theirs',
          memberHandles: [],
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ];

      await runner.apply('lists', 'replace');

      expect(localLists.lists().map((list) => list.title)).toEqual(['Theirs']);
      expect(remoteLists.writeAll).not.toHaveBeenCalled();
    });

    it('leaves the local store untouched when the upload fails', async () => {
      localLists.create('Mine only');
      remoteLists.listsValue = [
        {
          id: 'mwk-1',
          title: 'Theirs',
          memberHandles: [],
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ];
      remoteLists.writeOk = false;

      const ok = await runner.apply('lists', 'merge');

      expect(ok).toBe(false);
      expect(localLists.lists().map((list) => list.title)).toEqual(['Mine only']);
    });
  });

  describe('feeds', () => {
    it('merges without uploading anything the account already holds', async () => {
      localFeeds.add('https://shared.example/feed', 'Shared');
      localFeeds.add('https://mine.example/feed', 'Mine');
      remoteFeeds.feedsValue = [
        { url: 'https://shared.example/feed', title: 'Shared', folders: [] },
        { url: 'https://theirs.example/feed', title: 'Theirs', folders: [] },
      ];

      await runner.apply('feeds', 'merge');

      expect(remoteFeeds.uploaded?.map((f) => f.url)).toEqual(['https://mine.example/feed']);
      expect(
        localFeeds
          .feeds()
          .map((f) => f.url)
          .sort(),
      ).toEqual([
        'https://mine.example/feed',
        'https://shared.example/feed',
        'https://theirs.example/feed',
      ]);
    });

    it('replaces local with the account copy', async () => {
      localFeeds.add('https://mine.example/feed', 'Mine');
      remoteFeeds.feedsValue = [
        { url: 'https://theirs.example/feed', title: 'Theirs', folders: [] },
      ];

      await runner.apply('feeds', 'replace');

      expect(localFeeds.feeds().map((f) => f.url)).toEqual(['https://theirs.example/feed']);
    });

    it('never turns the CORS proxy on for an adopted feed', async () => {
      // Routing a request through a third party is always a deliberate act;
      // machinery must not do it on the user's behalf.
      remoteFeeds.feedsValue = [{ url: 'https://theirs.example/feed', title: 'T', folders: [] }];

      await runner.apply('feeds', 'merge');

      expect(localFeeds.feeds()[0].useProxy).toBeFalsy();
    });

    it('keeps a local feed’s proxy opt-in through an adoption', async () => {
      localFeeds.add('https://mine.example/feed', 'Mine', true);
      remoteFeeds.feedsValue = [{ url: 'https://mine.example/feed', title: 'Mine', folders: [] }];

      await runner.apply('feeds', 'merge');

      expect(localFeeds.feeds()[0].useProxy).toBe(true);
    });
  });
});
