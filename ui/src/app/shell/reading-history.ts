import { DOCUMENT, Location, PlatformLocation, ViewportScroller } from '@angular/common';
import { DestroyRef, inject, Injectable } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  DetachedRouteHandle,
  destroyDetachedRouteHandle,
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationStart,
  RouteReuseStrategy,
  Router,
} from '@angular/router';

/** Reading surfaces only: editors, settings and authentication retain normal lifecycles. */
export const READING_ROUTES = new Set([
  'home',
  'algo',
  'radio',
  'videos',
  'videos/queue',
  'videos/search',
  'videos/parties',
  'endorsed/:accountId',
  'collections/starter',
  'collections/starter/:slug',
  'annual-report',
  'annual-report/:year',
  'public',
  'notifications',
  'search',
  'bookmarks',
  'feeds/:feed',
  'feeds/servers/:server/:feed',
  'feeds/bluesky/:ref',
  'lists/:id',
  'client-lists/:id',
  'tag-bundles/:id',
  'tags/:tag',
  'misskey/:kind/:id',
  'link',
  'rss',
  'forum',
  'forum/d/:id',
  'videos/fedi',
  'statuses/:id',
  'read/:id',
  'accounts/:id',
  'accounts/:id/:handle',
  'collections/:id',
  'collections/preview/:id',
]);

export interface ReadingLifecycle {
  suspendReading?(): void;
  resumeReading?(): void;
}

interface Position {
  xy: [number, number];
  anchor: HTMLElement | null;
  top: number;
  focus: HTMLElement | null;
}
interface Visit {
  handle: DetachedRouteHandle;
  route: ActivatedRouteSnapshot['routeConfig'];
  params: ActivatedRouteSnapshot['params'];
  position: Position;
  nodes: number;
}

/**
 * Separate visits retain separate views; query-only entries share their mounted
 * view. The handle
 * owns its DOM, component state and component-scoped pagination services.
 * Eviction destroys it (including subscriptions); nothing is persisted.
 */
@Injectable({ providedIn: 'root' })
export class ReadingHistory implements RouteReuseStrategy {
  private document = inject(DOCUMENT);
  private viewport = inject(ViewportScroller);
  private location = inject(Location);
  private platformLocation = inject(PlatformLocation);
  private router?: Router;
  private destroyRef = inject(DestroyRef);
  private visits = new Map<number, Visit>();
  // Browser history survives reloads; these in-memory views deliberately do not.
  private readonly session = `${Date.now()}:${Math.random()}`;
  private positions = new Map<number, { view: number; position: Position }>();
  private currentView = 0;
  private targetView = 0;
  private current = 0;
  private target = 0;
  private currentUrl = '';
  private scope = '';
  private currentScope = '';
  private position?: Position;
  private nodes = 0;
  private stopRestore?: () => void;
  private previous: number | null = null;
  private targetPrevious: number | null = null;
  private replacing = false;
  /** Also tells the shell not to move keyboard focus to the top on return. */
  restoring = false;

  start(router: Router): void {
    if (this.router) return;
    this.router = router;
    this.viewport.setHistoryScrollRestoration('manual');
    const events = router.events.subscribe((event) => {
      if (event instanceof NavigationStart) {
        this.stopRestore?.();
        this.position = this.capture();
        let leaf = router.routerState.snapshot.root;
        while (leaf.firstChild) leaf = leaf.firstChild;
        if (this.current && this.isReading(leaf)) {
          this.positions.delete(this.current);
          this.positions.set(this.current, { view: this.currentView, position: this.position });
          while (this.positions.size > 10)
            this.positions.delete(this.positions.keys().next().value!);
        }
        const state = event.restoredState as Record<string, unknown> | null;
        const sameSession = state?.['readingSession'] === this.session;
        this.target =
          sameSession && typeof state?.['readingVisit'] === 'number'
            ? state['readingVisit']
            : event.id;
        this.targetView =
          sameSession && typeof state?.['readingView'] === 'number'
            ? state['readingView']
            : event.id;
        this.replacing =
          event.navigationTrigger === 'imperative' &&
          router.currentNavigation()?.extras.replaceUrl === true;
        this.targetPrevious = state
          ? sameSession && typeof state['readingPrevious'] === 'number'
            ? state['readingPrevious']
            : null
          : this.replacing
            ? this.previous
            : this.current || null;
        this.restoring =
          this.visits.has(this.targetView) ||
          (event.navigationTrigger !== 'imperative' && this.positions.has(this.target));
      } else if (event instanceof NavigationEnd) {
        this.current = this.target;
        this.currentView = this.targetView;
        this.currentUrl = event.urlAfterRedirects;
        this.currentScope = this.scope;
        this.previous = this.targetPrevious;
        this.saveHistoryState();
        if (this.restoring)
          this.position = this.positions.get(this.target)?.position ?? this.position;
        if (this.restoring && this.position) this.restore(this.position);
        else {
          const win = this.document.defaultView;
          const frame = win?.requestAnimationFrame(() => {
            const anchor = router.parseUrl(this.currentUrl).fragment;
            if (anchor) this.viewport.scrollToAnchor(anchor);
            else this.viewport.scrollToPosition([0, 0]);
          });
          this.stopRestore = () => {
            if (frame !== undefined) win?.cancelAnimationFrame(frame);
          };
        }
      } else if (event instanceof NavigationCancel || event instanceof NavigationError) {
        this.target = this.current;
        this.restoring = false;
        this.saveHistoryState();
      }
    });
    this.destroyRef.onDestroy(() => {
      events.unsubscribe();
      this.clear();
    });
  }

  private saveHistoryState(): void {
    // Update metadata without normalizing public trailing slashes, subpaths or hashes.
    const platform = this.platformLocation;
    platform.replaceState(
      {
        ...(platform.getState() as object),
        readingVisit: this.current,
        readingView: this.currentView,
        readingSession: this.session,
        readingPrevious: this.previous,
      },
      '',
      platform.pathname + platform.search + platform.hash,
    );
  }

  /** Called by the lazy shell; no account/provider dependencies in the initial bundle. */
  setScope(scope: string): void {
    if (scope === this.scope) return;
    const initial = !this.scope;
    this.scope = scope;
    if (!initial) this.clear();
    // The first shell activation precedes the first NavigationEnd.
    if (initial) this.currentScope = scope;
  }

  back(fallback = '/home'): void {
    if (this.previous !== null) this.location.back();
    else void this.router?.navigateByUrl(fallback, { replaceUrl: true });
  }

  shouldDetach(route: ActivatedRouteSnapshot): boolean {
    return this.isReading(route) && this.currentScope === this.scope && !this.replacing;
  }

  store(route: ActivatedRouteSnapshot, handle: DetachedRouteHandle | null): void {
    if (!handle || !this.position) return;
    this.remove(this.currentView);
    this.visits.set(this.currentView, {
      handle,
      route: route.routeConfig,
      params: route.params,
      position: this.position,
      nodes: this.nodes,
    });
    // DOM size is a deterministic resource bound in addition to the view count.
    // Never retain arbitrarily many huge feeds even within the ten-view limit.
    while (this.visits.size > 10 || this.nodeCount() > 100_000) {
      this.remove([...this.visits.keys()].find((key) => key !== this.targetView)!);
    }
  }

  shouldAttach(route: ActivatedRouteSnapshot): boolean {
    const visit = this.visits.get(this.targetView);
    return (
      this.isReading(route) &&
      !!visit &&
      visit.route === route.routeConfig &&
      this.sameParams(visit.params, route.params)
    );
  }

  retrieve(route: ActivatedRouteSnapshot): DetachedRouteHandle | null {
    if (!this.shouldAttach(route)) return null;
    const visit = this.visits.get(this.targetView)!;
    // Angular can ask more than once before attach; release ownership in attached().
    return visit.handle;
  }

  attached(): void {
    const visit = this.visits.get(this.targetView);
    if (!visit) return;
    this.position = visit.position;
    this.visits.delete(this.targetView);
    this.restoring = true;
  }

  shouldReuseRoute(future: ActivatedRouteSnapshot, current: ActivatedRouteSnapshot): boolean {
    if (future.routeConfig !== current.routeConfig) return false;
    if (!this.isReading(future)) return true;
    if (this.currentScope !== this.scope || this.visits.has(this.targetView)) return false;
    // Query-only tabs/photos/filters are one mounted view. Their normal route
    // subscriptions apply the selected tab on Back, without losing loaded pages.
    const reuse = this.sameParams(future.params, current.params);
    if (reuse) this.targetView = this.currentView;
    return reuse;
  }

  private sameParams(
    a: ActivatedRouteSnapshot['params'],
    b: ActivatedRouteSnapshot['params'],
  ): boolean {
    return (
      Object.keys(a).length === Object.keys(b).length &&
      Object.keys(a).every((key) => a[key] === b[key])
    );
  }

  clear(): void {
    for (const key of [...this.visits.keys()]) this.remove(key);
    this.positions.clear();
    this.stopRestore?.();
  }

  private isReading(route: ActivatedRouteSnapshot): boolean {
    if (
      route.pathFromRoot.some((part) =>
        ['settings', 'admin'].includes(part.routeConfig?.path ?? ''),
      )
    )
      return false;
    return (
      (READING_ROUTES.has(route.routeConfig?.path ?? '') ||
        route.data['readingHistory'] === true) &&
      !route.firstChild
    );
  }
  private remove(key: number): void {
    const visit = this.visits.get(key);
    if (!visit) return;
    this.visits.delete(key);
    for (const [entry, saved] of this.positions) {
      if (saved.view === key) this.positions.delete(entry);
    }
    destroyDetachedRouteHandle(visit.handle);
  }
  private nodeCount(): number {
    return [...this.visits.values()].reduce((total, visit) => total + visit.nodes, 0);
  }
  private capture(): Position {
    const main = this.document.getElementById('main') ?? this.document.querySelector('main');
    this.nodes = main?.querySelectorAll('*').length ?? 0;
    const anchor =
      [
        ...(main?.querySelectorAll<HTMLElement>('app-status-card, article, [role="listitem"]') ??
          []),
      ].find((el) => el.getBoundingClientRect().bottom > 0) ?? null;
    return {
      xy: this.viewport.getScrollPosition(),
      anchor,
      top: anchor?.getBoundingClientRect().top ?? 0,
      focus: main?.contains(this.document.activeElement)
        ? (this.document.activeElement as HTMLElement)
        : null,
    };
  }
  private restore(position: Position): void {
    const win = this.document.defaultView;
    if (!win) return;
    const correct = () => {
      const y = position.anchor?.isConnected
        ? win.scrollY + position.anchor.getBoundingClientRect().top - position.top
        : position.xy[1];
      this.viewport.scrollToPosition([position.xy[0], y]);
    };
    const frame = win.requestAnimationFrame(() => {
      position.focus?.focus({ preventScroll: true });
      correct();
    });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(correct);
    const main = this.document.getElementById('main') ?? this.document.querySelector('main');
    if (main) observer?.observe(main);
    const events = ['wheel', 'touchstart', 'pointerdown', 'keydown'];
    const stop = () => {
      win.cancelAnimationFrame(frame);
      observer?.disconnect();
      win.clearTimeout(timer);
      events.forEach((event) => win.removeEventListener(event, stop));
      this.stopRestore = undefined;
    };
    const timer = win.setTimeout(stop, 3000);
    events.forEach((event) => win.addEventListener(event, stop, { passive: true }));
    this.stopRestore = stop;
  }
}
