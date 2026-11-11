import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { featureFlagGuard } from './feature-flag.guard';
import { FeatureFlags } from './feature-flags';

/** Run the guard for one flag id, with the flag service in a chosen state. */
function runGuard(flagId: string, enabled: boolean): boolean | UrlTree {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: FeatureFlags,
        useValue: { enabled: () => enabled },
      },
    ],
  });

  const route = { data: { featureFlag: flagId } } as unknown as ActivatedRouteSnapshot;
  const state = {} as RouterStateSnapshot;
  return TestBed.runInInjectionContext(() => featureFlagGuard(route, state)) as boolean | UrlTree;
}

describe('featureFlagGuard', () => {
  it('admits a route whose flag is enabled', () => {
    expect(runGuard('mawkingbird-plus', true)).toBe(true);
  });

  it('redirects a route whose flag is off', () => {
    const result = runGuard('mawkingbird-plus', false);

    expect(result).toBeInstanceOf(UrlTree);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/home');
  });

  it('drops the query string when redirecting', () => {
    // The bug this exists for: `parseUrl('/home')` preserved the current query,
    // so signing in to a flagged-off Mawkingbird Plus landed the browser on
    // `/home?code=<oauth authorization code>` — a live credential parked in the
    // address bar of a page with no idea what to do with it, copied from there
    // into history, bookmarks and the Referer of every outbound link.
    const result = runGuard('x', false) as UrlTree;
    const serialized = TestBed.inject(Router).serializeUrl(result);

    expect(serialized).not.toContain('?');
    expect(serialized).not.toContain('code');
  });
});
