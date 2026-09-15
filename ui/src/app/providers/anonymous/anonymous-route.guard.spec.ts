import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  convertToParamMap,
  provideRouter,
  Router,
  RouterStateSnapshot,
} from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { Auth } from '../../auth';
import {
  anonymousChatGuard,
  anonymousCollectionGuard,
  anonymousUnavailableGuard,
} from './anonymous-route.guard';
import { SHIPPED_STARTER_KITS } from '../../starter-kits';
import { routes } from '../../app.routes';
import { ClientPrefs } from '../../client-prefs';

describe('anonymousUnavailableGuard', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  function run(feature = 'Messages') {
    return TestBed.runInInjectionContext(() =>
      anonymousUnavailableGuard(
        { data: { anonymousFeature: feature } } as unknown as ActivatedRouteSnapshot,
        {} as RouterStateSnapshot,
      ),
    );
  }

  it('allows authenticated accounts through', () => {
    TestBed.inject(Auth).setToken('token');
    expect(run()).toBe(true);
  });

  it('redirects Anonymous before the protected page can load', () => {
    TestBed.inject(Auth).enterAnonymous();
    const result = run('Messages');
    expect(TestBed.inject(Router).serializeUrl(result as ReturnType<Router['createUrlTree']>)).toBe(
      '/unavailable?feature=Messages',
    );
  });
});

describe('anonymousCollectionGuard', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    TestBed.inject(Auth).enterAnonymous();
  });

  function run(id: string) {
    return TestBed.runInInjectionContext(() =>
      anonymousCollectionGuard(
        {
          paramMap: convertToParamMap({ id }),
          data: { anonymousFeature: 'Collections' },
        } as unknown as ActivatedRouteSnapshot,
        {} as RouterStateSnapshot,
      ),
    );
  }

  it('opens every bundled collection from its normal route anonymously', async () => {
    const shell = routes.find((route) => route.path === '' && route.children);
    expect(shell?.children?.find((route) => route.path === 'collections/:id')?.canActivate).toEqual(
      [anonymousCollectionGuard],
    );
    expect(SHIPPED_STARTER_KITS.length).toBeGreaterThan(0);
    for (const kit of SHIPPED_STARTER_KITS) expect(await run(kit.id)).toBe(true);
  });

  it('keeps server-only collections protected', async () => {
    expect(
      TestBed.inject(Router).serializeUrl(
        (await run('server-only')) as ReturnType<Router['createUrlTree']>,
      ),
    ).toBe('/unavailable?feature=Collections');
    TestBed.inject(Auth).setToken('token');
    expect(await run('server-only')).toBe(true);
  });
});

describe('anonymousChatGuard', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  function run() {
    return TestBed.runInInjectionContext(() =>
      anonymousChatGuard(
        { data: { anonymousFeature: 'Chat' } } as unknown as ActivatedRouteSnapshot,
        {} as RouterStateSnapshot,
      ),
    );
  }

  it('allows authenticated accounts through', () => {
    TestBed.inject(Auth).setToken('token');
    expect(run()).toBe(true);
  });

  it('lets an anonymous visitor chat, because Eliza is always there', () => {
    // The old guard turned everyone away with "no chat in anonymous mode",
    // which was never true: Eliza is browser-local and needs no account.
    TestBed.inject(Auth).enterAnonymous();

    expect(run()).toBe(true);
  });

  it('redirects only when AI is off, leaving genuinely nothing to show', () => {
    TestBed.inject(Auth).enterAnonymous();
    TestBed.inject(ClientPrefs).setAiMode('off');

    const result = run();
    expect(TestBed.inject(Router).serializeUrl(result as ReturnType<Router['createUrlTree']>)).toBe(
      '/unavailable?feature=Chat',
    );
  });
});
