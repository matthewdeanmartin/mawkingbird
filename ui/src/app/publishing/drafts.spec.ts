import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountDrafts, DraftSnapshot, Drafts, draftHasContent } from './drafts';
import { Auth } from '../platform/session/auth';

function snapshot(overrides: Partial<DraftSnapshot> = {}): DraftSnapshot {
  return {
    segments: ['hello'],
    spoilerText: '',
    sensitive: false,
    visibility: 'public',
    poll: null,
    ...overrides,
  };
}

describe('Drafts', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('saves a draft and lists it newest-first', () => {
    const drafts = TestBed.inject(Drafts);
    drafts.save(snapshot({ segments: ['older'] }));
    const { id } = drafts.save(snapshot({ segments: ['newer'] }));

    expect(drafts.drafts()).toHaveLength(2);
    expect(drafts.drafts()[0].id).toBe(id);
    expect(drafts.get(id)?.segments).toEqual(['newer']);
  });

  it('follows sign-in without reload while old composers retain their original owner', () => {
    const auth = TestBed.inject(Auth);
    const drafts = TestBed.inject(Drafts);
    auth.setToken('alice');
    const aliceComposer = drafts.forCurrentAccount();
    aliceComposer.save(snapshot({ segments: ['Alice only'] }));
    aliceComposer.handoff(snapshot());
    auth.setToken('bob');
    expect(drafts.drafts()).toEqual([]);
    expect(drafts.takeHandoff()).toBeNull();
    aliceComposer.autosave('new', snapshot({ segments: ['late Alice write'] }));
    expect(drafts.loadAutosave('new')).toBeNull();
    drafts.save(snapshot({ segments: ['Bob only'] }));
    auth.setToken('alice');
    expect(drafts.drafts().map((d) => d.segments[0])).toEqual(['Alice only']);
    expect(drafts.loadAutosave('new')?.segments).toEqual(['late Alice write']);
  });

  it('isolates saved drafts and identical reply slots by account and server', () => {
    const open = (token: string, server: string) => {
      TestBed.resetTestingModule();
      localStorage.setItem('mastodon_mock_token', token);
      localStorage.setItem('mastodon_mock_server', server);
      TestBed.configureTestingModule({});
      return TestBed.inject(Drafts);
    };
    const alice = open('alice-token', 'https://one.example');
    const { id } = alice.save(snapshot({ segments: ['Alice private draft'] }));
    alice.autosave('reply:9', snapshot());

    const bob = open('bob-token', 'https://one.example');
    expect(bob.drafts()).toEqual([]);
    expect(bob.loadAutosave('reply:9')).toBeNull();
    expect(bob.get(id)).toBeUndefined();
    bob.autosave('reply:9', snapshot({ segments: ['Bob reply'] }));
    // A late write from Alice's old composer must not enter Bob's namespace.
    alice.autosave('new', snapshot({ segments: ['Alice late save'] }));
    expect(bob.loadAutosave('new')).toBeNull();

    const otherServer = open('alice-token', 'https://two.example');
    expect(otherServer.drafts()).toEqual([]);
    expect(otherServer.loadAutosave('reply:9')).toBeNull();
    const restored = open('alice-token', 'https://one.example');
    expect(restored.get(id)?.segments).toEqual(['Alice private draft']);
    expect(restored.loadAutosave('new')?.segments).toEqual(['Alice late save']);
  });

  it('does not load unscoped drafts or autosaves into an account', () => {
    const legacy = JSON.stringify([{ ...snapshot(), id: 'old', updatedAt: '2026-09-05' }]);
    localStorage.setItem('mockingbird_drafts', legacy);
    localStorage.setItem('mockingbird_compose_autosave', JSON.stringify({ new: snapshot() }));
    const drafts = TestBed.inject(Drafts);
    expect(drafts.drafts()).toEqual([]);
    expect(drafts.loadAutosave('new')).toBeNull();
    drafts.save(snapshot());
    expect(localStorage.getItem('mockingbird_drafts')).toBe(legacy);
  });

  it('keeps anonymous writing separate from signed-out and Mastodon writing', () => {
    const signedOut = TestBed.inject(Drafts);
    signedOut.autosave('new', snapshot({ segments: ['signed out'] }));
    TestBed.resetTestingModule();
    localStorage.setItem('mastodon_mock_account_mode', 'anonymous');
    TestBed.configureTestingModule({});
    const anonymous = TestBed.inject(Drafts);
    expect(anonymous.loadAutosave('new')).toBeNull();
    anonymous.autosave('new', snapshot({ segments: ['anonymous'] }));
    TestBed.resetTestingModule();
    localStorage.setItem('mastodon_mock_account_mode', 'mastodon');
    localStorage.setItem('mastodon_mock_token', 'alice');
    TestBed.configureTestingModule({});
    expect(TestBed.inject(Drafts).loadAutosave('new')).toBeNull();
  });

  it('persists drafts across service instances (localStorage)', () => {
    const first = TestBed.inject(Drafts);
    const { id } = first.save(snapshot());

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const second = TestBed.inject(Drafts);
    expect(second.get(id)?.segments).toEqual(['hello']);
  });

  it('reports a quota failure and does not pretend the failed draft is saved', () => {
    const drafts = TestBed.inject(Drafts);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });

    const outcome = drafts.save(snapshot({ segments: ['only copy'] }));

    expect(outcome.durable).toBe(false);
    expect(drafts.drafts()).toEqual([]);
  });

  it('merges named drafts and autosave contexts written from stale tabs', () => {
    const firstTab = new AccountDrafts('_tabs');
    const secondTab = new AccountDrafts('_tabs');

    firstTab.save(snapshot({ segments: ['first tab'] }));
    secondTab.save(snapshot({ segments: ['second tab'] }));
    firstTab.autosave('new', snapshot({ segments: ['first autosave'] }));
    secondTab.autosave('reply:9', snapshot({ segments: ['second autosave'] }));

    const reopened = new AccountDrafts('_tabs');
    expect(reopened.drafts().map((draft) => draft.segments[0])).toEqual([
      'second tab',
      'first tab',
    ]);
    expect(reopened.loadAutosave('new')?.segments[0]).toBe('first autosave');
    expect(reopened.loadAutosave('reply:9')?.segments[0]).toBe('second autosave');
  });

  it('preserves both versions when stale tabs edit the same named draft', () => {
    const firstTab = new AccountDrafts('_same-draft');
    const { id } = firstTab.save(snapshot({ segments: ['original'] }));
    const secondTab = new AccountDrafts('_same-draft');
    const secondTabVersion = secondTab.get(id)!.updatedAt;

    expect(
      firstTab.update(id, snapshot({ segments: ['first edit'] }), firstTab.get(id)!.updatedAt)
        .updated,
    ).toBe(true);
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'mockingbird_drafts_same-draft',
        storageArea: localStorage,
      }),
    );
    expect(secondTab.get(id)?.segments[0]).toBe('first edit');
    const conflict = secondTab.update(
      id,
      snapshot({ segments: ['second edit'] }),
      secondTabVersion,
    );
    expect(conflict).toMatchObject({ durable: true, updated: false, conflict: true });
    expect(secondTab.save(snapshot({ segments: ['second edit'] })).durable).toBe(true);

    const reopened = new AccountDrafts('_same-draft');
    expect(reopened.drafts().map((draft) => draft.segments[0])).toEqual([
      'second edit',
      'first edit',
    ]);
  });

  it('remove() deletes a draft', () => {
    const drafts = TestBed.inject(Drafts);
    const { id } = drafts.save(snapshot());
    drafts.remove(id);
    expect(drafts.drafts()).toEqual([]);
  });

  it('autosave slots are per-context and round-trip', () => {
    const drafts = TestBed.inject(Drafts);
    drafts.autosave('new', snapshot({ segments: ['top-level'] }));
    drafts.autosave('reply:9', snapshot({ segments: ['a reply'] }));

    expect(drafts.loadAutosave('new')?.segments).toEqual(['top-level']);
    expect(drafts.loadAutosave('reply:9')?.segments).toEqual(['a reply']);
    expect(drafts.loadAutosave('reply:8')).toBeNull();
  });

  it('autosaving an empty snapshot clears the slot', () => {
    const drafts = TestBed.inject(Drafts);
    drafts.autosave('new', snapshot());
    drafts.autosave('new', snapshot({ segments: [''] }));
    expect(drafts.loadAutosave('new')).toBeNull();
  });

  it('clearAutosave() empties only the given context', () => {
    const drafts = TestBed.inject(Drafts);
    drafts.autosave('new', snapshot());
    drafts.autosave('reply:9', snapshot());
    drafts.clearAutosave('new');
    expect(drafts.loadAutosave('new')).toBeNull();
    expect(drafts.loadAutosave('reply:9')).not.toBeNull();
  });

  it('update() overwrites in place rather than appending a second copy', () => {
    const drafts = TestBed.inject(Drafts);
    const { id } = drafts.save(snapshot({ segments: ['first'] }));

    expect(
      drafts.update(id, snapshot({ segments: ['edited'] }), drafts.get(id)!.updatedAt).updated,
    ).toBe(true);
    expect(drafts.drafts()).toHaveLength(1);
    expect(drafts.get(id)?.segments).toEqual(['edited']);
  });

  it('update() keeps the draft where it is in the list', () => {
    // The row you just touched jumping out from under the cursor is worse than
    // it staying put, in a list you are working through.
    const drafts = TestBed.inject(Drafts);
    const { id: older } = drafts.save(snapshot({ segments: ['older'] }));
    const { id: newer } = drafts.save(snapshot({ segments: ['newer'] }));

    drafts.update(older, snapshot({ segments: ['older, edited'] }), drafts.get(older)!.updatedAt);
    expect(drafts.drafts().map((d) => d.id)).toEqual([newer, older]);
  });

  it('update() advances updatedAt', () => {
    const drafts = TestBed.inject(Drafts);
    const { id } = drafts.save(snapshot());
    const before = drafts.get(id)!.updatedAt;

    drafts.update(id, snapshot({ segments: ['edited'] }), drafts.get(id)!.updatedAt);
    expect(Date.parse(drafts.get(id)!.updatedAt)).toBeGreaterThanOrEqual(Date.parse(before));
  });

  it('update() persists, so the change survives a new service instance', () => {
    const first = TestBed.inject(Drafts);
    const { id } = first.save(snapshot());
    first.update(id, snapshot({ segments: ['edited'] }), first.get(id)!.updatedAt);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    expect(TestBed.inject(Drafts).get(id)?.segments).toEqual(['edited']);
  });

  it('update() reports false for an id that is gone, and adds nothing', () => {
    // Deleted in another tab or from /drafts. The caller saves a fresh copy
    // rather than silently discarding what was just written.
    const drafts = TestBed.inject(Drafts);
    expect(drafts.update('never-existed', snapshot(), '').updated).toBe(false);
    expect(drafts.drafts()).toHaveLength(0);
  });

  it('recordVersion() refreshes the newest checkpoint within the gap, adds one after it', () => {
    const store = new AccountDrafts('_versions');
    const t0 = Date.parse('2026-11-07T10:00:00Z');
    store.recordVersion('d1', snapshot({ segments: ['a'] }), false, t0);
    store.recordVersion('d1', snapshot({ segments: ['ab'] }), false, t0 + 60_000);
    expect(store.versions('d1').map((v) => v.snapshot.segments[0])).toEqual(['ab']);

    store.recordVersion('d1', snapshot({ segments: ['abc'] }), false, t0 + 10 * 60_000);
    expect(store.versions('d1').map((v) => v.snapshot.segments[0])).toEqual(['abc', 'ab']);
  });

  it('recordVersion() with force always adds, but never stores an identical snapshot twice', () => {
    const store = new AccountDrafts('_versions');
    const t0 = Date.parse('2026-11-07T10:00:00Z');
    store.recordVersion('d1', snapshot({ segments: ['a'] }), true, t0);
    store.recordVersion('d1', snapshot({ segments: ['b'] }), true, t0 + 1000);
    store.recordVersion('d1', snapshot({ segments: ['b'] }), true, t0 + 2000);
    expect(store.versions('d1').map((v) => v.snapshot.segments[0])).toEqual(['b', 'a']);
  });

  it('keeps at most 20 checkpoints per draft', () => {
    const store = new AccountDrafts('_versions');
    for (let i = 0; i < 25; i++) {
      store.recordVersion('d1', snapshot({ segments: [`v${i}`] }), true, i * 1000);
    }
    const versions = store.versions('d1');
    expect(versions).toHaveLength(20);
    expect(versions[0].snapshot.segments[0]).toBe('v24');
  });

  it('remove() also deletes the draft history', () => {
    const drafts = TestBed.inject(Drafts);
    const { id } = drafts.save(snapshot());
    drafts.recordVersion(id, snapshot(), true);
    expect(drafts.versions(id)).toHaveLength(1);
    drafts.remove(id);
    expect(drafts.versions(id)).toEqual([]);
  });

  it('a full history store never breaks recording', () => {
    const store = new AccountDrafts('_versions');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    expect(() => store.recordVersion('d1', snapshot(), true)).not.toThrow();
  });

  it('draftHasContent() is true for text, CW or poll — not blank segments', () => {
    expect(draftHasContent(snapshot())).toBe(true);
    expect(draftHasContent(snapshot({ segments: ['', ' '] }))).toBe(false);
    expect(draftHasContent(snapshot({ segments: [''], spoilerText: 'cw' }))).toBe(true);
    expect(
      draftHasContent(
        snapshot({
          segments: [''],
          poll: { options: ['a', 'b'], multiple: false, expiresIn: 300 },
        }),
      ),
    ).toBe(true);
  });
});
