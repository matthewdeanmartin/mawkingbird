import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlusSession } from './plus-session';
import { MawkingbirdSession } from './mawkingbird-session';

const TOKEN_URL = 'https://cors.mawkingbird.com/plus/token';
const CHECKOUT_URL = 'https://cors.mawkingbird.com/plus/checkout';

/** Seconds, as the Worker mints them. */
const nowSeconds = () => Math.floor(Date.now() / 1000);

class FakeMawkingbirdSession {
  token = vi.fn().mockResolvedValue('mawkingbird-token');
  /**
   * Called when a mint reports `tier: 'plus'`, to re-mint an auth token that
   * still carries a stale free-tier claim. Resolves false here: these tests are
   * about the proxy token, and a double that omitted it would reject inside
   * `mint()` and fail every case for the wrong reason.
   */
  upgradeIfStale = vi.fn().mockResolvedValue(false);
}

describe('PlusSession', () => {
  let plus: PlusSession;
  let httpMock: HttpTestingController;
  let session: FakeMawkingbirdSession;

  beforeEach(() => {
    session = new FakeMawkingbirdSession();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MawkingbirdSession, useValue: session },
      ],
    });
    plus = TestBed.inject(PlusSession);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  /**
   * Let the pending promise chain reach the point of issuing its request.
   *
   * `token()` and `startCheckout()` both await `accessToken()` first, so the
   * HTTP call is made a couple of microtasks after the method is invoked.
   * Asserting on it immediately finds nothing.
   */
  const settle = async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  };

  /** Answer the pending mint with a canned response. */
  const respond = (body: Partial<Record<string, unknown>> = {}) => {
    const request = httpMock.expectOne(TOKEN_URL);
    request.flush({
      token: 'supporter-token',
      expiresAt: nowSeconds() + 900,
      tier: 'plus',
      subscription: { renewsAt: 2_000_000_000, cancelAtPeriodEnd: false },
      ...body,
    });
    return request;
  };

  /**
   * The races. Each of these reproduces a way a stale mint could publish an
   * answer to a question that had already been asked again.
   */
  describe('concurrent mints', () => {
    it('does not let a pre-checkout mint overwrite the tier after refresh()', async () => {
      // The "I subscribed and it does not know it" bug. A mint starts before
      // checkout, the user pays, `refresh()` runs — and the old mint settles
      // afterwards carrying `tier: 'free'`.
      const stale = plus.token();
      await settle();
      const staleRequest = httpMock.expectOne(TOKEN_URL);

      // Checkout happened. refresh() must start its own mint, not join the
      // one already in flight.
      const refreshed = plus.refresh();
      await settle();
      const freshRequest = httpMock.expectOne(TOKEN_URL);

      // The fresh mint answers first, correctly: this account is a supporter.
      freshRequest.flush({
        token: 'supporter-token',
        expiresAt: nowSeconds() + 900,
        tier: 'plus',
        subscription: { renewsAt: 2_000_000_000, cancelAtPeriodEnd: false },
      });
      await refreshed;
      expect(plus.tier()).toBe('plus');

      // Now the pre-checkout mint lands with its obsolete answer.
      staleRequest.flush({
        token: 'free-token',
        expiresAt: nowSeconds() + 900,
        tier: 'free',
        subscription: null,
      });
      await stale;

      // It must have been dropped, not published.
      expect(plus.tier()).toBe('plus');
      expect(plus.isSupporter()).toBe(true);
      expect(plus.subscription()).not.toBeNull();
    });

    it('refresh() issues a new request instead of joining the in-flight mint', async () => {
      const pending = plus.token();
      await settle();

      const refreshed = plus.refresh();
      await settle();

      // Two requests in flight, not one shared. Joining the existing mint —
      // which is what `refresh()` used to do — would leave exactly one, and the
      // post-checkout answer would be whatever the older mint happened to say.
      const requests = httpMock.match(TOKEN_URL);
      expect(requests.length).toBe(2);

      for (const request of requests) {
        request.flush({
          token: 'supporter-token',
          expiresAt: nowSeconds() + 900,
          tier: 'plus',
          subscription: null,
        });
      }
      await Promise.all([pending, refreshed]);
      expect(plus.tier()).toBe('plus');
    });

    it('does not re-entitle an account that signed out mid-mint', async () => {
      const pending = plus.token();
      await settle();
      const request = httpMock.expectOne(TOKEN_URL);

      plus.clear();

      // The mint that was already in flight comes back saying "supporter".
      request.flush({
        token: 'supporter-token',
        expiresAt: nowSeconds() + 900,
        tier: 'plus',
        subscription: { renewsAt: 2_000_000_000, cancelAtPeriodEnd: false },
      });
      await pending;

      // Signed out is signed out. Publishing here would restore a session the
      // user just ended.
      expect(plus.tier()).toBe('free');
      expect(plus.isSupporter()).toBe(false);
      expect(plus.subscription()).toBeNull();
    });

    it('announces entitlement only after the auth token can back it up', async () => {
      // Ordering, not just atomicity: while `upgradeIfStale` is in flight the
      // app must not yet claim to be a supporter, because the credential a
      // profile write would use still carries the stale free-tier claim and the
      // service would correctly answer 402.
      let releaseUpgrade!: () => void;
      const upgraded = new Promise<boolean>((resolve) => {
        releaseUpgrade = () => resolve(true);
      });
      session.upgradeIfStale.mockReturnValue(upgraded);

      const pending = plus.token();
      await settle();
      respond();
      await settle();

      expect(session.upgradeIfStale).toHaveBeenCalled();
      expect(plus.isSupporter()).toBe(false);

      releaseUpgrade();
      await pending;

      expect(plus.isSupporter()).toBe(true);
    });
  });

  it('mints a token and records the tier', async () => {
    const pending = plus.token();
    await settle();
    respond();

    await expect(pending).resolves.toBe('supporter-token');
    expect(plus.tier()).toBe('plus');
    expect(plus.isSupporter()).toBe(true);
  });

  it('sends the WorkOS access token as a bearer credential', async () => {
    const pending = plus.token();
    await settle();
    const request = respond();
    await pending;

    expect(request.request.headers.get('Authorization')).toBe('Bearer mawkingbird-token');
  });

  it('converts the expiry to milliseconds', async () => {
    const pending = plus.token();
    await settle();
    respond({ expiresAt: 1_800_000_000 });
    await pending;

    // The wire is seconds and the app is milliseconds; mixing them would make
    // a fresh token look 50 years stale and re-mint on every request.
    const subscription = plus.subscription();
    expect(subscription?.renewsAt).toBe(2_000_000_000 * 1000);
  });

  it('reuses a held token rather than minting again', async () => {
    const first = plus.token();
    await settle();
    respond();
    await first;

    await expect(plus.token()).resolves.toBe('supporter-token');
    await settle();
    httpMock.expectNone(TOKEN_URL);
  });

  it('re-mints when the held token is near expiry', async () => {
    const first = plus.token();
    // Inside the two-minute refresh margin.
    await settle();
    respond({ expiresAt: nowSeconds() + 60 });
    await first;

    const second = plus.token();
    await settle();
    respond({ token: 'fresher-token' });
    await expect(second).resolves.toBe('fresher-token');
  });

  it('makes one request when several callers ask at once', async () => {
    const a = plus.token();
    const b = plus.token();
    const c = plus.token();
    await settle();
    respond();

    await Promise.all([a, b, c]);
    // Every proxied request calls this; minting one token each would spend the
    // endpoint's rate limit on itself.
    await settle();
    httpMock.expectNone(TOKEN_URL);
  });

  it('returns null without asking when nobody is signed in', async () => {
    session.token.mockResolvedValue(null);

    await expect(plus.token()).resolves.toBeNull();
    await settle();
    httpMock.expectNone(TOKEN_URL);
  });

  it('returns null, not an error, when minting fails', async () => {
    const pending = plus.token();
    await settle();
    httpMock.expectOne(TOKEN_URL).flush('nope', { status: 500, statusText: 'Server Error' });

    // No token means free-tier limits. A supporter must not see a broken feed
    // because the mint endpoint hiccuped.
    await expect(pending).resolves.toBeNull();
    expect(plus.error()).toBeNull();
  });

  it('records a cancellation so the page can say when support ends', async () => {
    const pending = plus.token();
    await settle();
    respond({ subscription: { renewsAt: 2_000_000_000, cancelAtPeriodEnd: true } });
    await pending;

    expect(plus.subscription()?.cancelAtPeriodEnd).toBe(true);
    // Still a supporter: they bought the year.
    expect(plus.isSupporter()).toBe(true);
  });

  it('reports a free tier with no subscription', async () => {
    const pending = plus.token();
    await settle();
    respond({ tier: 'free', subscription: null });
    await pending;

    expect(plus.isSupporter()).toBe(false);
    expect(plus.subscription()).toBeNull();
  });

  it('uses a confirmed Plus entitlement to refresh a stale free auth claim', async () => {
    const pending = plus.token();
    await settle();
    respond({ tier: 'plus' });
    await pending;

    // The proxy entitlement is minted from the same billing row as the auth
    // claim. This handoff is what prevents a fresh 24-hour free JWT from
    // continuing to receive 402s after checkout succeeds.
    expect(session.upgradeIfStale).toHaveBeenCalledOnce();
    expect(session.upgradeIfStale).toHaveBeenCalledWith(true);
  });

  it('does not discard the auth token when billing still reports free', async () => {
    const pending = plus.token();
    await settle();
    respond({ tier: 'free', subscription: null });
    await pending;

    expect(session.upgradeIfStale).not.toHaveBeenCalled();
  });

  it('discards the held token on refresh', async () => {
    const first = plus.token();
    await settle();
    respond();
    await first;

    const refreshed = plus.refresh();
    await settle();
    respond({ token: 'post-checkout-token' });
    await refreshed;

    await expect(plus.token()).resolves.toBe('post-checkout-token');
  });

  it('forgets everything on clear', async () => {
    const pending = plus.token();
    await settle();
    respond();
    await pending;

    plus.clear();

    expect(plus.tier()).toBe('free');
    expect(plus.subscription()).toBeNull();
  });

  describe('checkout', () => {
    it('asks for a session and navigates to it', async () => {
      const assign = vi.fn();
      // jsdom refuses `vi.spyOn(location, 'assign')`. Stubbing the whole object
      // is the house pattern; `test-setup.ts` restores it before every test.
      vi.stubGlobal('location', { ...location, assign });

      const pending = plus.startCheckout();
      await settle();
      const request = httpMock.expectOne(CHECKOUT_URL);
      request.flush({ url: 'https://checkout.stripe.com/c/pay/cs_test_1' });
      await pending;

      expect(assign).toHaveBeenCalledWith('https://checkout.stripe.com/c/pay/cs_test_1');
    });

    it('sends a returnTo for this deployment', async () => {
      vi.stubGlobal('location', { ...location, assign: vi.fn() });

      const pending = plus.startCheckout();
      await settle();
      const request = httpMock.expectOne(CHECKOUT_URL);
      const body = request.request.body as { returnTo: string };
      request.flush({ url: 'https://checkout.stripe.com/c/pay/cs_test_1' });
      await pending;

      // Built from `document.baseURI`, so a canary tester comes back to canary
      // rather than being ejected into production the moment they pay.
      expect(body.returnTo).toBe(new URL('settings/mawkingbird-plus', document.baseURI).toString());
    });

    it('relays the reason the Worker gave, not a generic apology', async () => {
      const assign = vi.fn();
      vi.stubGlobal('location', { ...location, assign });

      const pending = plus.startCheckout();
      await settle();
      httpMock
        .expectOne(CHECKOUT_URL)
        .flush(
          { error: 'Subscriptions are not configured on this deployment.' },
          { status: 503, statusText: 'Service Unavailable' },
        );
      await pending;

      // The bug this covers: the reason was only visible in the network tab,
      // so a misconfigured deployment looked like a transient glitch.
      expect(plus.error()).toContain('not configured on this deployment');
      // And it must not invite someone to keep pressing a button that cannot
      // work — 503 is an operator fault.
      expect(plus.error()).not.toContain('try again');
      expect(assign).not.toHaveBeenCalled();
    });

    it('reassures that nothing was charged when the service is misconfigured', async () => {
      vi.stubGlobal('location', { ...location, assign: vi.fn() });

      const pending = plus.startCheckout();
      await settle();
      httpMock
        .expectOne(CHECKOUT_URL)
        .flush({ error: 'Subscriptions are not configured.' }, { status: 503, statusText: 'x' });
      await pending;

      expect(plus.error()).toContain('nothing was charged');
    });

    it('explains an unreachable service rather than blaming the user', async () => {
      vi.stubGlobal('location', { ...location, assign: vi.fn() });

      const pending = plus.startCheckout();
      await settle();
      // Status 0 is what a browser reports when the request never completed —
      // offline, DNS failure, blocked. There is no server message to relay.
      httpMock.expectOne(CHECKOUT_URL).error(new ProgressEvent('error'), { status: 0 });
      await pending;

      expect(plus.error()).toContain('Could not reach');
    });

    it('includes the status when the Worker sends no message', async () => {
      vi.stubGlobal('location', { ...location, assign: vi.fn() });

      const pending = plus.startCheckout();
      await settle();
      httpMock.expectOne(CHECKOUT_URL).flush('', { status: 500, statusText: 'Server Error' });
      await pending;

      // Something to quote in a bug report, rather than nothing at all.
      expect(plus.error()).toContain('500');
    });

    it('surfaces a failure instead of navigating', async () => {
      const assign = vi.fn();
      // jsdom refuses `vi.spyOn(location, 'assign')`. Stubbing the whole object
      // is the house pattern; `test-setup.ts` restores it before every test.
      vi.stubGlobal('location', { ...location, assign });

      const pending = plus.startCheckout();
      await settle();
      httpMock.expectOne(CHECKOUT_URL).flush('no', { status: 502, statusText: 'Bad Gateway' });
      await pending;

      expect(plus.error()).toContain('Could not start checkout');
      expect(assign).not.toHaveBeenCalled();
      expect(plus.startingCheckout()).toBe(false);
    });

    it('refuses to start when nobody is signed in', async () => {
      session.token.mockResolvedValue(null);

      await plus.startCheckout();

      expect(plus.error()).toContain('Sign in');
      await settle();
      httpMock.expectNone(CHECKOUT_URL);
    });
  });
});
