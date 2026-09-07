import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Auth } from '../../auth';
import { Server } from '../../server';
import { PreviewSeed, PREVIEW_SERVER } from '../../first-run/preview-seed';
import { AnonymousFollows } from '../../providers/anonymous/anonymous-follows';
import { EntryPage } from './entry';

/**
 * `probeServerAvailability` calls `fetch` directly, so the probe is stubbed at
 * the global rather than through `HttpTestingController`.
 */
function probeAnswers(answers: Record<string, boolean>): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const reachable = Object.entries(answers).find(([host]) => url.includes(host))?.[1] ?? false;
      if (!reachable) {
        throw new Error('unreachable');
      }
      return new Response(JSON.stringify({ title: 'Test server' }), { status: 200 });
    }),
  );
}

/**
 * Let the component's async `ngOnInit` settle.
 *
 * The chain is probe → seed → batch refresh → navigate, and each link is a real
 * promise, so a couple of ticks is not enough. The seed's HTTP call is answered
 * here too: left open it would sit on its own 5s timeout before the navigation
 * ever happens, and the test would assert against a component still mid-init.
 */
async function settle(http: HttpTestingController): Promise<void> {
  for (let i = 0; i < 8; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (const req of http.match((r) => r.url.includes('/api/v1/accounts'))) {
      req.flush([]);
    }
  }
}

describe('EntryPage', () => {
  let navigate: ReturnType<typeof vi.spyOn>;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [Auth, Server, provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /**
   * The failure the old front page could only mitigate: a signed-in user shown
   * a marketing page reads as "the app logged me out". A dispatcher that renders
   * nothing cannot do it at all — and must not seed a preview over their account.
   */
  it('sends a signed-in Mastodon user straight home, seeding nothing', async () => {
    TestBed.inject(Auth).setToken('a-token');
    TestBed.createComponent(EntryPage).detectChanges();
    await settle(http);

    expect(navigate).toHaveBeenCalledWith('/home', { replaceUrl: true });
    expect(TestBed.inject(PreviewSeed).active).toBe(false);
    expect(TestBed.inject(AnonymousFollows).count()).toBe(0);
  });

  /**
   * The roadmap's standing clause is that an existing session of any kind
   * behaves identically. `isAuthenticated` is `kind() !== null`, so this holds
   * for Bluesky-primary too — asserted rather than inferred, because the
   * dispatcher is the one place every account kind passes through.
   */
  it('sends a Bluesky-primary user straight home, seeding nothing', async () => {
    const auth = TestBed.inject(Auth);
    auth.kind.set('bluesky');
    TestBed.createComponent(EntryPage).detectChanges();
    await settle(http);

    expect(navigate).toHaveBeenCalledWith('/home', { replaceUrl: true });
    expect(TestBed.inject(PreviewSeed).active).toBe(false);
    expect(TestBed.inject(AnonymousFollows).count()).toBe(0);
  });

  /**
   * "Continue without logging in" is a durable choice, not a per-visit one.
   * Re-asking it — or re-seeding over their real follows — is the bug that made
   * the previous front door annoying to anyone who had already answered.
   */
  it('sends a returning anonymous visitor home without asking again', async () => {
    TestBed.inject(Auth).enterAnonymous(PREVIEW_SERVER);
    TestBed.createComponent(EntryPage).detectChanges();
    await settle(http);

    expect(navigate).toHaveBeenCalledWith('/home', { replaceUrl: true });
    expect(TestBed.inject(PreviewSeed).active).toBe(false);
    expect(TestBed.inject(AnonymousFollows).count()).toBe(0);
  });

  it('enters anonymous and seeds the preview for a first-time visitor', async () => {
    probeAnswers({ 'mastodon.social': true });
    TestBed.createComponent(EntryPage).detectChanges();
    await settle(http);

    const auth = TestBed.inject(Auth);
    expect(auth.isAnonymous).toBe(true);
    expect(TestBed.inject(PreviewSeed).active).toBe(true);
    expect(TestBed.inject(AnonymousFollows).count()).toBe(3);
    expect(navigate).toHaveBeenCalledWith('/home', { replaceUrl: true });
  });

  /**
   * A reload with the modal still open. The anonymous account now exists
   * because *we* made it, so it must not be mistaken for a settled choice —
   * but it must not be seeded a second time either.
   */
  it('does not re-seed when a preview is already running', async () => {
    probeAnswers({ 'mastodon.social': true });
    TestBed.createComponent(EntryPage).detectChanges();
    await settle(http);
    const afterFirst = TestBed.inject(AnonymousFollows).count();

    TestBed.createComponent(EntryPage).detectChanges();
    await settle(http);

    expect(TestBed.inject(AnonymousFollows).count()).toBe(afterFirst);
    expect(TestBed.inject(PreviewSeed).active).toBe(true);
  });

  /** A blocked mastodon.social must not be a blank first impression. */
  it('falls through to another server when the first is unreachable', async () => {
    probeAnswers({ 'mastodon.social': false, 'mas.to': true });
    TestBed.createComponent(EntryPage).detectChanges();
    await settle(http);

    expect(TestBed.inject(Server).baseUrl()).toBe('https://mas.to');
    expect(TestBed.inject(PreviewSeed).active).toBe(true);
    expect(TestBed.inject(AnonymousFollows).count()).toBe(3);
  });

  /**
   * Every candidate down. This used to enter anyway and show the welcome modal
   * over an empty feed — but the point of the preview is that the timeline
   * behind the modal is real, and a network blocking mastodon.social usually
   * blocks the other two candidates as well. So the short chain hands off to a
   * search of the full directory rather than to a blank first impression.
   */
  it('asks for a working server instead of entering when no candidate is reachable', async () => {
    probeAnswers({});
    const fixture = TestBed.createComponent(EntryPage);
    fixture.detectChanges();
    await settle(http);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-unreachable-server-dialog')).not.toBeNull();
    expect(TestBed.inject(Auth).isAnonymous).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  /** It is a router. Rendering anything here is the mistake being corrected. */
  it('renders nothing of its own', async () => {
    probeAnswers({ 'mastodon.social': true });
    const fixture = TestBed.createComponent(EntryPage);
    fixture.detectChanges();
    await settle(http);

    expect((fixture.nativeElement as HTMLElement).textContent?.trim()).toBe('');
  });
});
