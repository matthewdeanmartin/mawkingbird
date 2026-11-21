import { signal, WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BlueskySession, BskySession } from '../../../connections/bluesky/bluesky-session';
import { AnonymousCapabilities } from '../../../accounts/anonymous/anonymous-capabilities';
import { ConnectionBluesky } from './connection-bluesky';

/** Expose the protected signals — ngModel writes are async in specs. */
interface BlueskyInternals {
  oauthHandle: WritableSignal<string>;
}

describe('ConnectionBluesky', () => {
  let bskySession: {
    session: WritableSignal<BskySession | null>;
    beginOAuthConnector: ReturnType<typeof vi.fn>;
    unlink: ReturnType<typeof vi.fn>;
    expiresAt: ReturnType<typeof vi.fn>;
    enforceLifetime: ReturnType<typeof vi.fn>;
    usesAppPassword: () => boolean;
    upgradeToOAuth: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    bskySession = {
      session: signal<BskySession | null>(null),
      beginOAuthConnector: vi.fn(() => new Promise<never>(() => undefined)),
      unlink: vi.fn(),
      expiresAt: vi.fn(() => null),
      enforceLifetime: vi.fn(),
      usesAppPassword: () => {
        const current = bskySession.session();
        return !!current && current.authMethod !== 'oauth';
      },
      upgradeToOAuth: vi.fn(() => new Promise<never>(() => undefined)),
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: BlueskySession, useValue: bskySession },
        { provide: AnonymousCapabilities, useValue: { canUseBluesky: true, active: false } },
      ],
    });
  });

  function setUp(): ComponentFixture<ConnectionBluesky> {
    const fixture = TestBed.createComponent(ConnectionBluesky);
    fixture.detectChanges();
    return fixture;
  }

  it('unlink calls the session service', () => {
    bskySession.session.set({
      service: 'https://bsky.social',
      handle: 'me.bsky.social',
      did: 'did:plc:me',
      accessJwt: 'a',
      refreshJwt: 'r',
    });
    const fixture = setUp();
    const el = fixture.nativeElement as HTMLElement;

    [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Unlink'))!.click();
    expect(bskySession.unlink).toHaveBeenCalled();
  });

  /**
   * OAuth is the way in; the app password is the last resort. The first control
   * on the page starts OAuth, and the app-password form waits, closed, at the end.
   */
  describe('OAuth first', () => {
    it('leads with Continue with Bluesky and starts OAuth through the entryway', () => {
      const fixture = setUp();
      const el = fixture.nativeElement as HTMLElement;

      const first = el.querySelector<HTMLButtonElement>('button');
      expect(first?.textContent).toContain('Continue with Bluesky');
      first!.click();

      expect(bskySession.beginOAuthConnector).toHaveBeenCalledWith('https://bsky.social');
      expect(sessionStorage.getItem('mockingbird_bsky_connector_return')).toBe(
        '/settings/connections/bluesky',
      );
    });

    it('starts OAuth for a specific handle, stripped of its @', () => {
      const fixture = setUp();
      (fixture.componentInstance as unknown as BlueskyInternals).oauthHandle.set('@me.example');
      fixture.detectChanges();
      (fixture.nativeElement as HTMLElement)
        .querySelector('form.bsky-oauth-handle')!
        .dispatchEvent(new Event('submit'));

      expect(bskySession.beginOAuthConnector).toHaveBeenCalledWith('me.example');
    });

    it('explains a handle that could not be resolved', async () => {
      bskySession.beginOAuthConnector.mockRejectedValue(new Error('Failed to resolve handle'));
      const fixture = setUp();
      (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('button')!.click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect((fixture.nativeElement as HTMLElement).textContent).toContain(
        "Couldn't find that Bluesky handle",
      );
    });

    it('describes unlinking an OAuth connection as revoking access, not an app password', () => {
      bskySession.session.set({
        authMethod: 'oauth',
        service: 'https://pds.example',
        handle: 'me.bsky.social',
        did: 'did:plc:me',
      });
      const text = (setUp().nativeElement as HTMLElement).textContent;

      expect(text).toContain("revoke Mawkingbird's access");
      expect(text).not.toContain('app password');
    });
  });

  it('re-checks retention on init, since this page can be reached by deep link', () => {
    setUp();
    expect(bskySession.enforceLifetime).toHaveBeenCalled();
  });

  it('still offers linking to the Anonymous account, and says why that works', () => {
    // Bluesky needs no Mastodon token, so anonymous sessions get a link of their
    // own — and the page says so rather than leaving people guessing.
    TestBed.overrideProvider(AnonymousCapabilities, {
      useValue: { canUseBluesky: true, active: true },
    });
    const fixture = setUp();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('form.bsky-form')).not.toBeNull();
    expect(el.textContent).toContain('while you');
    expect(el.textContent).toContain("doesn't involve a Mastodon account");
  });
});

describe('ConnectionBluesky app-password phase-out', () => {
  const session = signal<BskySession | null>(null);
  const upgradeToOAuth = vi.fn(() => new Promise<never>(() => undefined));

  beforeEach(() => {
    localStorage.clear();
    session.set(null);
    upgradeToOAuth.mockClear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: BlueskySession,
          useValue: {
            session,
            beginOAuthConnector: vi.fn(),
            unlink: vi.fn(),
            expiresAt: () => null,
            enforceLifetime: vi.fn(),
            usesAppPassword: () => !!session() && session()!.authMethod !== 'oauth',
            upgradeToOAuth,
          },
        },
        { provide: AnonymousCapabilities, useValue: { canUseBluesky: true, active: false } },
      ],
    });
  });

  it('never asks for an app password', () => {
    const fixture = TestBed.createComponent(ConnectionBluesky);
    fixture.detectChanges();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('input[type="password"]'),
    ).toBeNull();
  });

  it('offers an app-password link the switch to Bluesky sign-in, and an OAuth link nothing', () => {
    session.set({
      service: 'https://bsky.social',
      handle: 'me.example',
      did: 'did:plc:me',
      authMethod: 'app-password',
    });
    const fixture = TestBed.createComponent(ConnectionBluesky);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const button = [...el.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Switch to Bluesky sign-in'),
    )!;
    button.click();
    expect(upgradeToOAuth).toHaveBeenCalledOnce();

    session.set({ ...session()!, authMethod: 'oauth' });
    fixture.detectChanges();
    expect(el.textContent).not.toContain('Switch to Bluesky sign-in');
  });
});
