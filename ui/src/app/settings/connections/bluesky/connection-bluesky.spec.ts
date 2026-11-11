import { HttpErrorResponse } from '@angular/common/http';
import { signal, WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BlueskySession, BskySession } from '../../../connections/bluesky/bluesky-session';
import { AnonymousCapabilities } from '../../../accounts/anonymous/anonymous-capabilities';
import { ConnectionBluesky } from './connection-bluesky';

/** Expose the protected signals — ngModel writes are async in specs. */
interface BlueskyInternals {
  bskyHandle: WritableSignal<string>;
  bskyPassword: WritableSignal<string>;
  oauthHandle: WritableSignal<string>;
}

describe('ConnectionBluesky', () => {
  let bskySession: {
    session: WritableSignal<BskySession | null>;
    login: ReturnType<typeof vi.fn>;
    beginOAuthConnector: ReturnType<typeof vi.fn>;
    unlink: ReturnType<typeof vi.fn>;
    expiresAt: ReturnType<typeof vi.fn>;
    enforceLifetime: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    bskySession = {
      session: signal<BskySession | null>(null),
      login: vi.fn(),
      beginOAuthConnector: vi.fn(() => new Promise<never>(() => undefined)),
      unlink: vi.fn(),
      expiresAt: vi.fn(() => null),
      enforceLifetime: vi.fn(),
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

  function fill(fixture: ComponentFixture<ConnectionBluesky>, handle: string, pw: string): void {
    const c = fixture.componentInstance as unknown as BlueskyInternals;
    c.bskyHandle.set(handle);
    c.bskyPassword.set(pw);
    fixture.detectChanges();
  }

  function submit(fixture: ComponentFixture<ConnectionBluesky>): void {
    (fixture.nativeElement as HTMLElement)
      .querySelector('form.bsky-app-password')!
      .dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  }

  it('links Bluesky with a stripped @handle and shows the linked identity', () => {
    const linked: BskySession = {
      service: 'https://bsky.social',
      handle: 'me.bsky.social',
      did: 'did:plc:me',
      accessJwt: 'a',
      refreshJwt: 'r',
      displayName: 'Me!',
    };
    bskySession.login.mockImplementation(() => {
      bskySession.session.set(linked);
      return of(linked);
    });
    const fixture = setUp();

    fill(fixture, '@me.bsky.social', 'app-pass');
    submit(fixture);

    expect(bskySession.login).toHaveBeenCalledWith('me.bsky.social', 'app-pass');
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Me!');
    expect(el.textContent).toContain('@me.bsky.social');
    expect(el.textContent).toContain('Unlink');
    expect(el.textContent).toContain('Not stored with Mawkingbird');
  });

  it('shows a friendly error when Bluesky rejects the credentials', () => {
    bskySession.login.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 401, error: {} })),
    );
    const fixture = setUp();

    fill(fixture, 'me.bsky.social', 'wrong');
    submit(fixture);

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'rejected that handle/app password',
    );
  });

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

    it('keeps the app password closed, last, and never starts it from the OAuth button', () => {
      const fixture = setUp();
      const el = fixture.nativeElement as HTMLElement;
      const disclosures = [...el.querySelectorAll('details')];

      expect(disclosures.at(-1)?.querySelector('form.bsky-app-password')).not.toBeNull();
      expect(disclosures.every((d) => !d.open)).toBe(true);
      el.querySelector<HTMLButtonElement>('button')!.click();
      expect(bskySession.login).not.toHaveBeenCalled();
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
