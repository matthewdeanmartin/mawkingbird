import { inject, Injectable, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FEATURE_CTAS, PLUS_CTAS } from './feed-ctas';

export const FEATURE_USE_KEY = 'mockingbird_feature_use';
const known = new Set([...FEATURE_CTAS, ...PLUS_CTAS].map((card) => card.id));

/** Browser-local feature visits only: no URLs, accounts, timestamps or telemetry. */
@Injectable({ providedIn: 'root' })
export class FeatureUseHistory {
  private router = inject(Router);
  private used = signal<ReadonlySet<string>>(this.read());
  constructor() {
    this.visit(this.router.url);
    this.router.events.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event instanceof NavigationEnd) this.visit(event.urlAfterRedirects);
    });
  }
  has(id: string): boolean {
    return this.used().has(id);
  }
  mark(id: string): void {
    if (!known.has(id) || this.has(id)) return;
    const next = new Set([...this.used(), id]);
    this.used.set(next);
    try {
      localStorage.setItem(FEATURE_USE_KEY, JSON.stringify([...next]));
    } catch {
      /* Keep memory state. */
    }
  }
  private visit(url: string): void {
    const tree = this.router.parseUrl(url);
    const path = '/' + (tree.root.children['primary']?.segments.map((s) => s.path).join('/') ?? '');
    for (const card of FEATURE_CTAS) {
      if (card.action) continue;
      if (path !== card.route && !path.startsWith(card.route + '/')) continue;
      if (card.fragment && tree.fragment !== card.fragment) continue;
      if (
        card.query &&
        !Object.entries(card.query).every(([key, value]) => tree.queryParams[key] === value)
      )
        continue;
      this.mark(card.id);
    }
    if (path === '/analytics') this.mark('analytics');
  }
  private read(): ReadonlySet<string> {
    try {
      const data: unknown = JSON.parse(localStorage.getItem(FEATURE_USE_KEY) ?? '[]');
      return new Set(
        Array.isArray(data)
          ? data.filter((id): id is string => typeof id === 'string' && known.has(id))
          : [],
      );
    } catch {
      return new Set();
    }
  }
}
