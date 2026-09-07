import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of, tap } from 'rxjs';
import { Status } from '../../models';
import { FeedAggregator } from '../feed-aggregator';
import { AnonymousFeedCorpus } from './anonymous-feed-corpus';

export interface AnonymousAlgoSnapshot {
  statuses: Status[];
  acquired: boolean;
}

/** Explicit, pull-only acquisition facade for the Anonymous Algo corpus. */
@Injectable({ providedIn: 'root' })
export class AnonymousAlgoSource {
  private aggregator = inject(FeedAggregator);
  private corpus = inject(AnonymousFeedCorpus);

  refresh(): Observable<AnonymousAlgoSnapshot> {
    this.aggregator.reset();
    if (!this.aggregator.hasMore()) {
      return of({ statuses: this.corpus.statuses(), acquired: false });
    }
    return this.aggregator.nextPage().pipe(
      tap((statuses) => this.corpus.ingest(statuses)),
      map((statuses) => ({ statuses: this.corpus.statuses(), acquired: statuses.length > 0 })),
      catchError(() => of({ statuses: this.corpus.statuses(), acquired: false })),
    );
  }
}
