import { computed, inject, Injectable, signal } from '@angular/core';
import { catchError, forkJoin, map, Observable, of } from 'rxjs';
import { Status } from '../../models';
import { FeedProvider } from '../provider';
import { PasteFeedSubscriptions } from './paste-feed-subscriptions';
import { PasteProviderRegistry } from './paste-provider-registry';

/** Opt-in recent-public-pastes source, shared by authenticated and Anonymous home. */
@Injectable({ providedIn: 'root' })
export class PasteFeedProvider implements FeedProvider {
  private providers = inject(PasteProviderRegistry);
  private subscriptions = inject(PasteFeedSubscriptions);

  readonly id = 'paste' as const;
  readonly label = 'Pastes';
  readonly badge = '📋 Pastes';
  readonly linked = computed(() => this.subscriptions.enabledFeeds().length > 0);
  readonly errors = signal<string[]>([]);

  private exhausted = false;

  reset(): void {
    this.exhausted = false;
    this.errors.set([]);
  }

  fetchPage(): Observable<Status[]> {
    if (this.exhausted) {
      return of([]);
    }
    this.exhausted = true;
    const failures: string[] = [];
    const providers = this.subscriptions
      .enabledFeeds()
      .map((subscription) =>
        this.providers.feeds.find((provider) => provider.id === subscription.providerId),
      )
      .filter((provider) => provider !== undefined);
    if (!providers.length) {
      return of([]);
    }
    return forkJoin(
      providers.map((provider) =>
        provider.recent().pipe(
          map((items) => items.map((item) => provider.status(item))),
          catchError(() => {
            failures.push(`Could not load ${provider.label}'s public feed.`);
            return of<Status[]>([]);
          }),
        ),
      ),
    ).pipe(
      map((pages) => {
        this.errors.set(failures);
        return pages.flat().sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
      }),
    );
  }
}
