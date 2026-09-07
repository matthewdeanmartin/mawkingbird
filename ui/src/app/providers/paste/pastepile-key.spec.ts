import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PastepileKey } from './pastepile-key';
import { PastepileProvider } from './pastepile-provider';

const KEY = 'mockingbird_pastepile_key';
const MINT = 'https://www.pastepile.com/api/keys';
const REVOKE = 'https://www.pastepile.com/api/keys/revoke';
const TOKEN_KEY = 'mastodon_mock_token';

describe('PastepileKey', () => {
  let store: PastepileKey;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    store = TestBed.inject(PastepileKey);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('starts disconnected — the key is optional', () => {
    expect(store.connected()).toBe(false);
    expect(store.key()).toBeNull();
  });

  it('mints a free key with one POST and no account', () => {
    const done = store.mint();
    const request = http.expectOne(MINT);
    expect(request.request.method).toBe('POST');
    request.flush({
      key: 'pk_live_abc123',
      revocation_secret: 'rvk_xyz',
      prefix: 'pk_live_abc1',
      plan: 'free',
    });

    return done.then(() => {
      expect(store.key()).toBe('pk_live_abc123');
      expect(store.prefix()).toBe('pk_live_abc1');
      expect(store.plan()).toBe('free');
    });
  });

  it("repeats Pastepile's own message when the daily key cap is hit", async () => {
    // 5 keys/day/IP. "Try again tomorrow" is actionable; a generic failure is
    // not, so the service's wording must survive.
    const done = store.mint();
    http.expectOne(MINT).flush(
      {
        error: {
          code: 'rate_limited',
          message: 'Too many key generations from this IP. Try again tomorrow.',
        },
      },
      { status: 429, statusText: 'Too Many Requests' },
    );

    await expect(done).rejects.toThrow(/Try again tomorrow/);
  });

  it('falls back to a useful message when the body carries none', async () => {
    const done = store.mint();
    http.expectOne(MINT).flush(null, { status: 429, statusText: 'Too Many Requests' });

    await expect(done).rejects.toThrow(/5 per day/);
  });

  it('rejects a mint that returns no key', async () => {
    const done = store.mint();
    http.expectOne(MINT).flush({ notice: 'nope' });

    await expect(done).rejects.toThrow(/did not return a key/);
    expect(store.connected()).toBe(false);
  });

  it('revokes the key on disconnect, using the stored secret', async () => {
    const minted = store.mint();
    http.expectOne(MINT).flush({
      key: 'pk_live_abc',
      revocation_secret: 'rvk_xyz',
      prefix: 'pk_live_abc',
      plan: 'free',
    });
    await minted;

    const removed = store.disconnect();
    const request = http.expectOne(REVOKE);
    // The server stores only hashes, so this secret is the sole way to revoke.
    expect(request.request.body).toEqual({ revocation_secret: 'rvk_xyz' });
    request.flush({ ok: true });
    await removed;

    expect(store.key()).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('still forgets the key locally when revocation fails', async () => {
    const minted = store.mint();
    http.expectOne(MINT).flush({
      key: 'pk_live_abc',
      revocation_secret: 'rvk_xyz',
      prefix: 'p',
      plan: 'free',
    });
    await minted;

    const removed = store.disconnect();
    http.expectOne(REVOKE).error(new ProgressEvent('offline'));
    await removed;

    // A network failure must not strand the user holding a key they can't drop.
    expect(store.key()).toBeNull();
  });

  it('adopts a hand-pasted key without contacting the service', () => {
    store.connect('  pk_live_typed  ', 'pro');

    http.expectNone(() => true);
    expect(store.key()).toBe('pk_live_typed');
    expect(store.plan()).toBe('pro');
  });

  it('rejects a blank pasted key', () => {
    expect(() => store.connect('   ')).toThrow();
  });

  it('is shared by every account in this browser', () => {
    // A pastebin key authorises the browser, not a persona — an alt should not
    // have to mint its own.
    localStorage.setItem(TOKEN_KEY, 'token-alice');
    store.connect('pk_live_abc');

    localStorage.setItem(TOKEN_KEY, 'token-bob');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    expect(TestBed.inject(PastepileKey).key()).toBe('pk_live_abc');
  });

  describe('the never-expiry trap', () => {
    /**
     * Keyless anonymous requests may create no-expiry pastes, but a *free* key
     * rejects `expiry: "never"` with `expiry_not_allowed`. Both verified against
     * the live API. Adding a key must not silently break an option that worked.
     */
    it('offers Never while no key is attached', () => {
      const provider = TestBed.inject(PastepileProvider);
      expect(provider.expiries.map((e) => e.value)).toContain('never');
    });

    it('hides Never once a free key is in use', () => {
      store.connect('pk_live_abc', 'free');
      const provider = TestBed.inject(PastepileProvider);

      expect(provider.expiries.map((e) => e.value)).not.toContain('never');
      // The timed options are untouched.
      expect(provider.expiries.map((e) => e.value)).toContain('1w');
    });

    it('keeps Never on a pro key, which is allowed to use it', () => {
      store.connect('pk_live_abc', 'pro');
      const provider = TestBed.inject(PastepileProvider);

      expect(provider.expiries.map((e) => e.value)).toContain('never');
    });
  });

  it('sends the key on create so the paste is listable under scope=mine', () => {
    store.connect('pk_live_abc');
    const provider = TestBed.inject(PastepileProvider);
    provider
      .create({
        title: 't',
        content: 'c',
        language: 'plaintext',
        expiry: '1h',
        visibility: 'unlisted',
      })
      .subscribe({ error: () => undefined });

    const request = http.expectOne((r) => r.method === 'POST');
    expect(request.request.headers.get('X-API-Key')).toBe('pk_live_abc');
    request.flush({ slug: 'a', url: 'u', raw_url: 'r', edit_key: 'k' });
  });

  it('creates anonymously when there is no key', () => {
    const provider = TestBed.inject(PastepileProvider);
    provider
      .create({
        title: 't',
        content: 'c',
        language: 'plaintext',
        expiry: '1h',
        visibility: 'public',
      })
      .subscribe({ error: () => undefined });

    const request = http.expectOne((r) => r.method === 'POST');
    expect(request.request.headers.has('X-API-Key')).toBe(false);
    request.flush({ slug: 'a', url: 'u', raw_url: 'r', edit_key: 'k' });
  });
});
