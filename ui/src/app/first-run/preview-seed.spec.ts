import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { beforeEach, describe, expect, it } from 'vitest';
import { Account } from '../models';
import { AnonymousFollows } from '../providers/anonymous/anonymous-follows';
import { PREVIEW_ACCOUNT_IDS, PREVIEW_SERVER, PreviewSeed } from './preview-seed';

/** A full account body, as the batch endpoint returns them. */
function account(id: string, username: string): Account {
  return {
    id,
    username,
    acct: username,
    display_name: `Fresh ${username}`,
    note: '',
    url: `https://mastodon.social/@${username}`,
    avatar: 'https://example.test/fresh.png',
    avatar_static: 'https://example.test/fresh.png',
    header: '',
    header_static: '',
    followers_count: 1,
    following_count: 1,
    statuses_count: 1,
    bot: false,
    locked: false,
    discoverable: true,
    fields: [],
    role: null,
  };
}

describe('PreviewSeed', () => {
  let seed: PreviewSeed;
  let follows: AnonymousFollows;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    seed = TestBed.inject(PreviewSeed);
    follows = TestBed.inject(AnonymousFollows);
    http = TestBed.inject(HttpTestingController);
  });

  it('is not active until a preview starts', () => {
    expect(seed.active).toBe(false);
  });

  /**
   * The snapshot exists so the timeline can render before — and without — the
   * network. If this ever needed the batch response to produce follows, a
   * blocked request would leave the modal sitting over an empty feed.
   */
  it('seeds three follows from the compiled-in snapshot, before any response', async () => {
    const seeding = seed.seed(PREVIEW_SERVER);
    expect(follows.count()).toBe(3);
    expect(seed.active).toBe(true);

    http.expectOne((req) => req.url.includes('/api/v1/accounts')).flush([]);
    await seeding;
  });

  it('asks for all three ids in one batched call', async () => {
    const seeding = seed.seed(PREVIEW_SERVER);
    const req = http.expectOne((r) => r.url.includes('/api/v1/accounts'));

    expect(req.request.params.getAll('id[]')).toEqual([...PREVIEW_ACCOUNT_IDS]);
    req.flush([]);
    await seeding;
  });

  it('refreshes the snapshot with what the server returned', async () => {
    const seeding = seed.seed(PREVIEW_SERVER);
    http
      .expectOne((r) => r.url.includes('/api/v1/accounts'))
      .flush([account(PREVIEW_ACCOUNT_IDS[0], 'Gargron')]);
    await seeding;

    const refreshed = follows.findByAccountId(PREVIEW_ACCOUNT_IDS[0]);
    expect(refreshed?.account.display_name).toBe('Fresh Gargron');
    // The other two keep the snapshot rather than vanishing.
    expect(follows.count()).toBe(3);
  });

  /** A blocked or rate-limited lookup costs a stale avatar, never the preview. */
  it('keeps the snapshot when the refresh fails', async () => {
    const seeding = seed.seed(PREVIEW_SERVER);
    http.expectOne((r) => r.url.includes('/api/v1/accounts')).error(new ProgressEvent('blocked'));
    await seeding;

    expect(follows.count()).toBe(3);
  });

  /** The hardcoded ids are mastodon.social's; elsewhere they mean nothing. */
  it('does not call the batch endpoint on a fallback server', async () => {
    await seed.seed('https://mas.to');

    http.expectNone((r) => r.url.includes('/api/v1/accounts'));
    expect(follows.count()).toBe(3);
  });

  it('removes every seeded follow on clear, and ends the preview', async () => {
    const seeding = seed.seed(PREVIEW_SERVER);
    http.expectOne((r) => r.url.includes('/api/v1/accounts')).flush([]);
    await seeding;

    seed.clear();

    expect(follows.count()).toBe(0);
    expect(seed.active).toBe(false);
  });

  /**
   * The one follow cleanup must not touch. Un-following someone behind the
   * visitor's back is worse than leaving a seeded follow behind.
   */
  it('keeps an account the visitor followed themselves during the preview', async () => {
    // Follow one of the three *before* seeding, so it is theirs, not ours.
    const mine = account(PREVIEW_ACCOUNT_IDS[1], 'Mastodon');
    follows.follow(mine, PREVIEW_SERVER);

    const seeding = seed.seed(PREVIEW_SERVER);
    http.expectOne((r) => r.url.includes('/api/v1/accounts')).flush([]);
    await seeding;

    seed.clear();

    expect(follows.count()).toBe(1);
    expect(follows.findByAccountId(PREVIEW_ACCOUNT_IDS[1])).not.toBeNull();
  });

  /**
   * ProPublica is a *remote* account (`@ProPublica@newsie.social`) that
   * mastodon.social knows by a local id. Follows are keyed on the federated
   * handle, not the id, so a snapshot whose `acct` was wrong would seed under
   * one key and refresh under another — leaving four follows, two of them half
   * populated. This pins seed and refresh to the same key.
   */
  it('seeds and refreshes a federated account as one follow', async () => {
    const seeding = seed.seed(PREVIEW_SERVER);
    const federatedId = PREVIEW_ACCOUNT_IDS[2];
    const fresh = {
      ...account(federatedId, 'ProPublica'),
      acct: 'ProPublica@newsie.social',
      url: 'https://newsie.social/@ProPublica',
      display_name: 'ProPublica Refreshed',
    };
    http.expectOne((r) => r.url.includes('/api/v1/accounts')).flush([fresh]);
    await seeding;

    expect(follows.count()).toBe(3);
    expect(follows.findByAccountId(federatedId)?.account.display_name).toBe('ProPublica Refreshed');
  });

  it('clear is a no-op when no preview is running', () => {
    const other = account('999', 'someone');
    follows.follow(other, PREVIEW_SERVER);

    seed.clear();

    expect(follows.count()).toBe(1);
  });

  /** No server reachable: no posts, but the modal must still appear and end. */
  it('markEmpty starts a preview with no follows, and clear ends it', () => {
    seed.markEmpty(PREVIEW_SERVER);

    expect(seed.active).toBe(true);
    expect(follows.count()).toBe(0);

    seed.clear();
    expect(seed.active).toBe(false);
  });

  /** Survives the reload case: the flag is storage, not component state. */
  it('stays active across a fresh service instance', async () => {
    const seeding = seed.seed(PREVIEW_SERVER);
    http.expectOne((r) => r.url.includes('/api/v1/accounts')).flush([]);
    await seeding;

    expect(TestBed.inject(PreviewSeed).active).toBe(true);
  });
});
