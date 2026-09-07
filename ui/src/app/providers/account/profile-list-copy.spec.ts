import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientLists } from '../../lists/client-lists';
import { ProfileListCopy } from './profile-list-copy';
import { ProfileLists } from './profile-lists';
import type { CopyOutcome, ProfileList } from './profile-lists';

/**
 * The one-time copy offer.
 *
 * Three rules, each of which rules out something that looks helpful:
 * never automatic, copy rather than move, and show counts before doing it.
 * The tests are mostly about the second — a "tidy up the originals" step would
 * be the single irreversible action in an otherwise reversible feature, and it
 * is exactly the kind of thing a later refactor adds for tidiness.
 */

function list(id: string, handles: string[] = []): ProfileList {
  return {
    id,
    title: `List ${id}`,
    memberHandles: handles,
    createdAt: '2026-08-18T00:00:00.000Z',
  };
}

const ACCOUNT = 'mastodon:example.social/alice';

class FakeClientLists {
  private state: ProfileList[] = [];
  lists = () => this.state;
  count = () => this.state.length;
  set(next: ProfileList[]) {
    this.state = next;
  }
}

class FakeProfileLists {
  private state: ProfileList[] = [];
  private ready = false;
  // Annotated with the real outcome type rather than letting it infer from the
  // happy path, so a test can replace it with a refusal.
  copyIn: (incoming: ProfileList[]) => Promise<CopyOutcome> = vi.fn(
    (incoming: ProfileList[]): Promise<CopyOutcome> => {
      this.state = [...this.state, ...incoming];
      return Promise.resolve({ kind: 'ok', value: { written: incoming.length } });
    },
  );
  lists = () => this.state;
  count = () => this.state.length;
  loaded = () => this.ready;
  setLoaded(ready: boolean) {
    this.ready = ready;
  }
  setExisting(next: ProfileList[]) {
    this.state = next;
  }
}

describe('ProfileListCopy', () => {
  let copy: ProfileListCopy;
  let local: FakeClientLists;
  let profile: FakeProfileLists;

  beforeEach(() => {
    localStorage.clear();
    local = new FakeClientLists();
    profile = new FakeProfileLists();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: ClientLists, useValue: local },
        { provide: ProfileLists, useValue: profile },
      ],
    });
    copy = TestBed.inject(ProfileListCopy);
    profile.setLoaded(true);
  });

  describe('the preview', () => {
    it('counts lists and the distinct accounts across them', () => {
      local.set([list('a', ['x@h', 'y@h']), list('b', ['y@h', 'z@h'])]);
      // Distinct: `y@h` is in both lists and must not be counted twice, or the
      // number shown to the user is simply wrong.
      expect(copy.preview()).toEqual({
        lists: 2,
        accounts: 3,
        titles: ['List a', 'List b'],
      });
    });

    it('is null when there is nothing to copy', () => {
      expect(copy.preview()).toBeNull();
    });
  });

  describe('when to offer', () => {
    it('offers once for an account with local lists and an empty collection', () => {
      local.set([list('a')]);
      expect(copy.shouldOffer(ACCOUNT)).toBe(true);
    });

    it('does not offer before the collection has loaded', () => {
      // Offering into a collection still in flight could duplicate lists that
      // are about to arrive.
      local.set([list('a')]);
      profile.setLoaded(false);
      expect(copy.shouldOffer(ACCOUNT)).toBe(false);
    });

    it('does not offer when the account already has lists', () => {
      local.set([list('a')]);
      profile.setExisting([list('remote')]);
      expect(copy.shouldOffer(ACCOUNT)).toBe(false);
    });

    it('does not offer with no local lists', () => {
      expect(copy.shouldOffer(ACCOUNT)).toBe(false);
    });

    it('does not offer without an account key', () => {
      local.set([list('a')]);
      expect(copy.shouldOffer(null)).toBe(false);
    });

    it('does not offer twice for the same account', () => {
      local.set([list('a')]);
      copy.decline(ACCOUNT);
      expect(copy.shouldOffer(ACCOUNT)).toBe(false);
    });

    it('still offers for a different account on the same browser', () => {
      // A main and an alt are genuinely different questions: the alt's lists
      // are not the main's.
      local.set([list('a')]);
      copy.decline(ACCOUNT);
      expect(copy.shouldOffer('mastodon:example.social/alt')).toBe(true);
    });

    it('remembers the answer across a reload', () => {
      local.set([list('a')]);
      copy.decline(ACCOUNT);

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          { provide: ClientLists, useValue: local },
          { provide: ProfileLists, useValue: profile },
        ],
      });
      expect(TestBed.inject(ProfileListCopy).shouldOffer(ACCOUNT)).toBe(false);
    });
  });

  describe('copying', () => {
    it('leaves the local lists exactly where they were', async () => {
      const originals = [list('a'), list('b')];
      local.set(originals);
      await copy.copy(ACCOUNT);

      // Rule 2, and the reason Plus is low-risk to try: cancelling later leaves
      // the browser as it was, with nothing to restore.
      expect(local.lists()).toEqual(originals);
      expect(local.count()).toBe(2);
    });

    it('copies every local list to the account', async () => {
      local.set([list('a'), list('b')]);
      await copy.copy(ACCOUNT);
      expect(vi.mocked(profile.copyIn)).toHaveBeenCalledTimes(1);
      expect(profile.count()).toBe(2);
    });

    it('reports what happened in words a person can read', async () => {
      local.set([list('a')]);
      await copy.copy(ACCOUNT);
      expect(copy.message()).toContain('still here');
    });

    it('does not ask again after a successful copy', async () => {
      local.set([list('a')]);
      await copy.copy(ACCOUNT);
      expect(copy.shouldOffer(ACCOUNT)).toBe(false);
    });

    it('surfaces a refusal instead of claiming success', async () => {
      local.set([list('a')]);
      profile.copyIn = vi.fn(
        (): Promise<CopyOutcome> =>
          Promise.resolve({ kind: 'payment-required', message: 'Plus required' }),
      );

      const copied = await copy.copy(ACCOUNT);
      expect(copied).toBe(false);
      expect(copy.message()).toBe('Plus required');
      // Still untouched, which is the invariant that matters on a failure.
      expect(local.count()).toBe(1);
    });

    it('does nothing with no local lists', async () => {
      expect(await copy.copy(ACCOUNT)).toBe(false);
      expect(vi.mocked(profile.copyIn)).not.toHaveBeenCalled();
    });
  });
});
