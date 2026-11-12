import { Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountAnalytics } from '../account-analytics/account-analytics';
import { AnonymousPublicApi } from '../anonymous/anonymous-public-api';
import { BlueskyApi } from '../../connections/bluesky/bluesky-api';
import { AnonymousPublicRef } from '../anonymous/anonymous-route-ref';
import { Account } from '../../platform/api/models';
import { Auth } from '../../platform/session/auth';
import { AnalyticsLookup } from './analytics-lookup';
import { parseFediverseHandle } from './fediverse-handle';

/** Stands in for the real analytics, which would fetch on init. */
@Component({ selector: 'app-account-analytics', template: '' })
class FakeAnalytics {
  readonly account = input.required<Account>();
  readonly publicRef = input<AnonymousPublicRef | null>(null);
  readonly blueskyActor = input<string | null>(null);
}

const alice = { id: '42', acct: 'alice@far.example', username: 'alice' } as Account;
const me = { id: 'me', acct: 'me', username: 'me' } as Account;

describe('parseFediverseHandle', () => {
  it('accepts handles with or without @, and profile URLs', () => {
    expect(parseFediverseHandle('@alice@Far.Example')).toEqual({
      user: 'alice',
      host: 'far.example',
    });
    expect(parseFediverseHandle('alice@far.example')).toEqual({
      user: 'alice',
      host: 'far.example',
    });
    expect(parseFediverseHandle('https://far.example/@alice')).toEqual({
      user: 'alice',
      host: 'far.example',
    });
  });

  it('refuses what cannot be looked up', () => {
    for (const value of ['@alice', 'alice', 'https://far.example/users/alice', '@a@b@c', '']) {
      expect(parseFediverseHandle(value)).toBeNull();
    }
  });
});

describe('AnalyticsLookup', () => {
  const lookupAccount = vi.fn();
  const getProfile = vi.fn();
  const navigate = vi.fn().mockResolvedValue(true);

  beforeEach(() => {
    lookupAccount.mockReset();
    getProfile.mockReset();
    navigate.mockClear();
  });

  function render(opts: { acct?: string; signedIn?: boolean }) {
    TestBed.configureTestingModule({
      providers: [
        { provide: AnonymousPublicApi, useValue: { lookupAccount } },
        { provide: BlueskyApi, useValue: { getProfile } },
        { provide: Router, useValue: { navigate } },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { queryParamMap: convertToParamMap(opts.acct ? { acct: opts.acct } : {}) },
          },
        },
        {
          provide: Auth,
          useValue: {
            lacksMastodonToken: !opts.signedIn,
            account: () => (opts.signedIn ? me : null),
          },
        },
      ],
    });
    TestBed.overrideComponent(AnalyticsLookup, {
      remove: { imports: [AccountAnalytics] },
      add: { imports: [FakeAnalytics] },
    });
    const fixture = TestBed.createComponent(AnalyticsLookup);
    fixture.detectChanges();
    return fixture;
  }

  async function settle(fixture: ReturnType<typeof render>) {
    // The lookup awaits a resolution, then its result: flush both before looking.
    for (let tick = 0; tick < 5; tick++) await Promise.resolve();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function shown(fixture: ReturnType<typeof render>) {
    const debug = fixture.debugElement.query((el) => el.componentInstance instanceof FakeAnalytics);
    return debug?.componentInstance as FakeAnalytics | undefined;
  }

  it("signed out, reads a handle's analytics from its own server", async () => {
    lookupAccount.mockReturnValue(of(alice));
    const fixture = render({ acct: '@alice@far.example' });
    await settle(fixture);
    expect(lookupAccount).toHaveBeenCalledWith('https://far.example', 'alice');
    expect(shown(fixture)?.account()).toBe(alice);
    expect(shown(fixture)?.publicRef()).toEqual({ server: 'https://far.example', id: '42' });
  });

  it("reads a Bluesky handle's analytics from Bluesky's public feed", async () => {
    getProfile.mockReturnValue(
      of({ did: 'did:plc:alice', handle: 'alice.bsky.social', displayName: 'Alice' }),
    );
    const fixture = render({ acct: '@alice.bsky.social' });
    await settle(fixture);
    expect(getProfile).toHaveBeenCalledWith('alice.bsky.social');
    expect(lookupAccount).not.toHaveBeenCalled();
    expect(shown(fixture)?.blueskyActor()).toBe('did:plc:alice');
    expect(shown(fixture)?.publicRef()).toBeNull();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      "From @alice.bsky.social's public posts on Bluesky.",
    );
  });

  it('signed in, shows your own analytics until you ask for someone else', async () => {
    const fixture = render({ signedIn: true });
    await settle(fixture);
    expect(shown(fixture)?.account()).toBe(me);
    expect(shown(fixture)?.publicRef()).toBeNull();
    const buttons = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')];
    expect(buttons.map((b) => b.textContent?.trim())).toContain('My analytics');
  });

  it('signed out, offers no "My analytics"', () => {
    const fixture = render({});
    const labels = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].map((b) =>
      b.textContent?.trim(),
    );
    expect(labels).not.toContain('My analytics');
    expect(shown(fixture)).toBeUndefined();
  });

  it('says so when the server will not share the account', async () => {
    lookupAccount.mockReturnValue(throwError(() => new Error('403')));
    const fixture = render({ acct: 'alice@far.example' });
    await settle(fixture);
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('mb-notice')?.textContent,
    ).toContain('could not be read from its server');
    expect(shown(fixture)).toBeUndefined();
  });
});
