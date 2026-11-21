import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountDrafts, DraftSnapshot } from '../../publishing/drafts';
import { BlueskyApi } from './bluesky-api';
import { BlueskyDraftSync, toRemote } from './bluesky-drafts';

const snapshot = (segments: string[], target?: DraftSnapshot['target']): DraftSnapshot => ({
  segments,
  spoilerText: '',
  sensitive: false,
  visibility: 'public',
  poll: null,
  ...(target ? { target } : {}),
});

const flush = () => new Promise((resolve) => setTimeout(resolve));

describe('BlueskyDraftSync', () => {
  let request: ReturnType<typeof vi.fn>;
  let get: ReturnType<typeof vi.fn>;
  let store: AccountDrafts;

  beforeEach(() => {
    localStorage.clear();
    request = vi.fn((nsid: string) =>
      of(nsid === 'app.bsky.draft.createDraft' ? { id: 'remote-1' } : {}),
    );
    get = vi.fn(() =>
      of({
        drafts: [
          {
            id: 'remote-1',
            draft: { posts: [{ text: 'already here' }] },
            updatedAt: '2026-11-20T00:00:00Z',
          },
          {
            id: 'remote-2',
            draft: { posts: [{ text: 'from bsky.app' }, { text: 'part two' }], langs: ['de'] },
            updatedAt: '2026-11-21T00:00:00Z',
          },
        ],
      }),
    );
    TestBed.configureTestingModule({
      providers: [{ provide: BlueskyApi, useValue: { request, get } }],
    });
    store = new AccountDrafts('_test');
    store.mirror = TestBed.inject(BlueskyDraftSync).mirrorFor(store);
  });

  it('creates a Bluesky draft for a new one and remembers its id', async () => {
    const { id } = store.save(snapshot(['hello', 'world']));
    await flush();
    expect(request).toHaveBeenCalledWith('app.bsky.draft.createDraft', {
      draft: { posts: [{ text: 'hello' }, { text: 'world' }] },
    });
    expect(store.get(id)?.blueskyDraftId).toBe('remote-1');
  });

  it('updates and deletes the same Bluesky draft afterwards', async () => {
    const saved = store.save(snapshot(['one']));
    await flush();
    store.update(saved.id, snapshot(['one, edited']), store.get(saved.id)!.updatedAt);
    await flush();
    expect(request).toHaveBeenCalledWith('app.bsky.draft.updateDraft', {
      draft: { id: 'remote-1', draft: { posts: [{ text: 'one, edited' }] } },
    });
    store.remove(saved.id);
    await flush();
    expect(request).toHaveBeenCalledWith('app.bsky.draft.deleteDraft', { id: 'remote-1' });
  });

  it('leaves drafts for pastes and blogs on this device', async () => {
    store.save(snapshot(['code'], 'paste'));
    await flush();
    expect(request).not.toHaveBeenCalled();
  });

  it('pulls in drafts made elsewhere, once', async () => {
    store.save(snapshot(['already here']));
    await flush();
    const sync = TestBed.inject(BlueskyDraftSync);
    expect(await sync.pull(store)).toBe(1);
    expect(await sync.pull(store)).toBe(0);
    const imported = store.drafts().find((d) => d.blueskyDraftId === 'remote-2')!;
    expect(imported).toMatchObject({
      segments: ['from bsky.app', 'part two'],
      postLanguage: 'de',
      target: 'bsky',
      updatedAt: '2026-11-21T00:00:00Z',
    });
  });

  it('keeps within Bluesky’s draft limits and drops empty parts', () => {
    expect(
      toRemote({ segments: ['a', '  ', 'x'.repeat(10_050)] }).posts.map((p) => p.text.length),
    ).toEqual([1, 10_000]);
  });
});
