import { TestBed } from '@angular/core/testing';
import { Route, Router, Routes, provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { routes } from '../../app.routes';

/**
 * How a reader gets to Storage Diagnostics, written down so it stops being
 * rediscovered.
 *
 * The page is reached in two steps — More → Observability → Storage Diagnostics
 * — and that is the accepted design, not an oversight. It had a row in the More
 * menu once and lost it: that menu is over-full, and adding a row back means
 * taking another out. Observability is the right parent anyway, since the two
 * pages were split apart and Storage Diagnostics is where the destructive
 * controls on local data ended up.
 *
 * An audit read the missing top-level entry as a defect and asked for either a
 * direct navigation entry or an explicit statement that the two-step path is
 * intended. This is that statement, in the form that can fail: the route must
 * stay directly navigable, and Observability must keep pointing at it. Deleting
 * either link is then a test failure and a decision, rather than a quiet
 * regression that leaves the page stranded.
 *
 * What is deliberately *not* asserted: a right-rail or More-menu entry. No such
 * link exists, and claiming one in a test would be the same mistake the audit
 * made in prose.
 */
describe('Storage Diagnostics reachability', () => {
  let router: Router;

  /** Depth-first search for a path, wherever it is nested. */
  function findRoute(path: string): Route | undefined {
    const walk = (list: Routes): Route | undefined => {
      for (const route of list) {
        if (route.path === path) return route;
        const nested = route.children && walk(route.children);
        if (nested) return nested;
      }
      return undefined;
    };
    return walk(router.config);
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter(routes)] });
    router = TestBed.inject(Router);
  });

  it('is directly navigable, so a bookmark or typed URL resolves', async () => {
    const tree = router.parseUrl('/storage-diagnostics');
    expect(router.config.length).toBeGreaterThan(0);
    // serializeUrl round-trips only a route the router can match.
    expect(router.serializeUrl(tree)).toBe('/storage-diagnostics');
  });

  it('has a route declared, with a page title', () => {
    const storage = findRoute('storage-diagnostics');
    expect(storage).toBeDefined();
    expect(storage?.title).toBe('Storage Diagnostics');
  });

  it('is not guarded, so it stays reachable while signed out', () => {
    // The page reports on this browser's own storage; an account is irrelevant
    // to it, and someone clearing local data may well be signed out already.
    expect(findRoute('storage-diagnostics')?.canActivate ?? []).toHaveLength(0);
  });
});
