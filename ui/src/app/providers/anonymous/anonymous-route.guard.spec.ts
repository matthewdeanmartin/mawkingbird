import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  provideRouter,
  Router,
  RouterStateSnapshot,
} from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { Auth } from '../../auth';
import { anonymousChatGuard, anonymousUnavailableGuard } from './anonymous-route.guard';
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
