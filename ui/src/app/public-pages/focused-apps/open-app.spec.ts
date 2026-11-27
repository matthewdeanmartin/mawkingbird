import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, PLATFORM_ID, ChangeDetectionStrategy } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRoute,
  convertToParamMap,
  PartialMatchRouteSnapshot,
  provideRouter,
  Router,
} from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginBluesky } from '../../accounts/sign-in/login-bluesky/login-bluesky';
import { LoginChooser } from '../../accounts/sign-in/login-chooser/login-chooser';
import { Login } from '../../accounts/sign-in/login/login';
import { saveBlueskyIdentity } from '../../connections/bluesky/bluesky-identity-store';
import { saveMisskeyVisitor } from '../../connections/misskey/misskey-identity-store';
import { mastodonSignedInMatch, signedInMatch } from '../../platform/session/auth.guard';
import { Auth } from '../../platform/session/auth';
import { ENGLISH_TOOLS, ToolPage } from '../focused-tools';
import { OpenApp } from './open-app';

@Component({
  imports: [OpenApp],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: '<app-open-app>Open the app</app-open-app>',
})
class Host {}

const VISITORS = [
  'fresh',
  'implicit',
  'chosen',
  'misskey visitor',
  'mastodon',
  'bluesky',
  'bluesky with mastodon',
] as const;
type Visitor = (typeof VISITORS)[number];

function arrive(visitor: Visitor): void {
  const auth = TestBed.inject(Auth);
  if (visitor === 'implicit' || visitor === 'chosen')
    auth.enterAnonymous(undefined, { implicit: visitor === 'implicit' });
  if (visitor === 'mastodon') auth.setToken('token');
  if (visitor === 'misskey visitor') {
    saveMisskeyVisitor('https://misskey.example', true);
    auth.enterMisskey('visitor');
  }
  if (visitor.startsWith('bluesky')) {
    saveBlueskyIdentity(
      { service: 'https://pds.example', did: 'did:plc:reader', handle: 'reader.example' },
      { authMethod: 'oauth' },
      true,
    );
    auth.enterBluesky();
    if (visitor === 'bluesky with mastodon') auth.connectMastodon('connector-token');
  }
}

function setUp(query: Record<string, string>, route: object = {}): void {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideHttpClient(withXhr()),
      provideHttpClientTesting(),
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: {
            data: {},
            pathFromRoot: [],
            queryParams: query,
            queryParamMap: convertToParamMap(query),
            ...route,
          },
        },
      },
    ],
  });
}

function link(tool: ToolPage | null, visitor: Visitor, inShell = false): HTMLAnchorElement | null {
  setUp(
    {},
    { data: { inShell }, pathFromRoot: [{ routeConfig: { path: tool?.path ?? 'tools' } }] },
  );
  arrive(visitor);
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  return fixture.nativeElement.querySelector('a[mbButton]');
}

/** Where a login address leaves this visitor: on a form, or sent on to another address. */
function open(href: string, visitor: Visitor): string {
  const url = new URL(href, 'https://app.example');
  setUp(Object.fromEntries(url.searchParams));
  arrive(visitor);
  const router = TestBed.inject(Router);
  let sentTo = 'form';
  vi.spyOn(router, 'navigateByUrl').mockImplementation(async (to) => {
    sentTo = String(to);
    return true;
  });
  vi.spyOn(router, 'navigate').mockImplementation(async (commands, extras) => {
    sentTo = router.serializeUrl(
      router.createUrlTree(commands as unknown[], { queryParams: extras?.queryParams }),
    );
    return true;
  });
  const page = { '/login/mastodon': Login, '/login/bluesky': LoginBluesky }[url.pathname];
  TestBed.createComponent<unknown>(page ?? LoginChooser).detectChanges();
  return sentTo;
}

function follow(href: string, visitor: Visitor): string {
  let at = href;
  for (let hops = 0; hops < 4; hops++) {
    const next = open(at, visitor);
    if (next === 'form' || !next.startsWith('/login')) return next;
    at = next;
  }
  return 'loop';
}

describe('OpenApp', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('signs a stranger in and back, skipping the network question where there is none', () => {
    const analytics = ENGLISH_TOOLS.find((tool) => tool.id === 'mastodon-analytics')!;
    const crosspost = ENGLISH_TOOLS.find((tool) => tool.id === 'crosspost')!;
    for (const visitor of ['fresh', 'implicit'] as const) {
      localStorage.clear();
      expect(link(analytics, visitor)?.getAttribute('href')).toBe(
        '/login/mastodon?next=%2Fmastodon-analytics',
      );
      localStorage.clear();
      expect(link(crosspost, visitor)?.getAttribute('href')).toBe('/login?next=%2Fcrosspost');
      localStorage.clear();
      expect(link(null, visitor)?.getAttribute('href')).toBe('/login');
    }
  });

  it('opens the app for someone who chose to read without an account', () => {
    for (const visitor of ['chosen', 'misskey visitor'] as const) {
      for (const tool of [...ENGLISH_TOOLS, null]) {
        localStorage.clear();
        expect(link(tool, visitor)?.getAttribute('href')).toBe('/');
      }
    }
  });

  it('names the app screen instead of repeating itself after sign-in', () => {
    const bookmarks = ENGLISH_TOOLS.find((tool) => tool.id === 'export-bookmarks')!;
    const shown = link(bookmarks, 'mastodon', true);
    expect(shown?.getAttribute('href')).toBe('/bookmarks');
    expect(shown?.textContent?.trim()).toBe('Bookmarks');
    expect(
      link(
        ENGLISH_TOOLS.find((tool) => tool.id === 'handle-generator')!,
        'mastodon',
        true,
      ),
    ).toBeNull();
  });

  it('prerenders the stranger’s link without reading a session', () => {
    setUp({}, { pathFromRoot: [{ routeConfig: { path: 'crosspost' } }] });
    TestBed.overrideProvider(PLATFORM_ID, { useValue: 'server' });
    TestBed.overrideProvider(Auth, {
      useFactory: () => {
        throw new Error('the prerender has no session');
      },
      deps: [],
    });
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('a')?.getAttribute('href')).toBe(
      '/login?next=%2Fcrosspost',
    );
  });

  // The blink: a sign-in link that sends the visitor straight back to the page
  // that is still asking them to sign in.
  for (const visitor of VISITORS) {
    it(`never bounces a ${visitor} visitor back to a page still asking to sign in`, () => {
      for (const tool of ENGLISH_TOOLS) {
        localStorage.clear();
        setUp({});
        arrive(visitor);
        const matches = TestBed.runInInjectionContext(() =>
          // Angular 22 added the partial snapshot; these guards don't read it.
          (tool.signIn === 'any' ? signedInMatch : mastodonSignedInMatch)(
            {},
            [],
            {} as PartialMatchRouteSnapshot,
          ),
        );
        if (matches) continue;
        const next = encodeURIComponent(`/${tool.path}`);
        localStorage.clear();
        const header = link(tool, visitor)!.getAttribute('href')!;
        const doors = [header, `/login?next=${next}`, `/login/mastodon?next=${next}`];
        if (tool.signIn === 'any') doors.push(`/login/bluesky?next=${next}`);
        for (const door of doors.filter((href) => href.startsWith('/login'))) {
          localStorage.clear();
          expect(follow(door, visitor), `${visitor}: ${door}`).toBe('form');
        }
      }
    });
  }
});
