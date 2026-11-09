import { computed, inject, Injectable, signal } from '@angular/core';
import { catchError, defer, forkJoin, from, map, Observable, of, throwError } from 'rxjs';
import { scopedKey } from '../../account-scope';
import { Auth } from '../../auth';
import { HomeDiagnostics } from '../../home-diagnostics';
import { Status } from '../../models';
import { FeedProvider } from '../provider';
import { MisskeyApi, MisskeyApiError } from './misskey-api';
import { misskeyIdentity } from './misskey-identity-store';
import { MkTimeline } from './misskey-types';

/** Which Misskey timeline Home shows, per account. */
export const MK_TIMELINE_KEY = 'mockingbird_misskey_timeline';

/** The timelines Home can show, in picker order. */
export const MK_TIMELINES: readonly MkTimeline[] = ['home', 'social', 'local', 'global'];

function readTimeline(): MkTimeline {
  try {
    const raw = localStorage.getItem(scopedKey(MK_TIMELINE_KEY));
    return MK_TIMELINES.includes(raw as MkTimeline) ? (raw as MkTimeline) : 'home';
  } catch {
    return 'home';
  }
}

/**
 * Misskey as the home-timeline source for a Misskey-primary account.
 *
 * Pages one Misskey timeline (Home, Social, Local or Global, the reader's
 * choice) with `untilId` and adapts each note. Linked only while a Misskey
 * identity is the active account; there is no Misskey connector mode yet.
 *
 * The adapter (and with it the MFM parser) is imported on first fetch, not at
 * the top of this file: the provider registry is part of the app shell, and
 * the parser must stay out of the initial bundle.
 */
@Injectable({ providedIn: 'root' })
export class MisskeyProvider implements FeedProvider {
  private api = inject(MisskeyApi);
  private auth = inject(Auth);
  private diagnostics = inject(HomeDiagnostics);

  readonly id = 'misskey' as const;
  readonly label = 'Misskey';
  readonly badge = '🐈 Misskey';
  readonly linked = computed(() => this.auth.activeMisskeyKey() !== null);
  readonly errors = signal<string[]>([]);
  /** True after the server rejected the token; Home offers to sign in again. */
  readonly authenticationFailed = signal(false);

  /** The timeline Home reads. Changing it takes effect on the next reset. */
  readonly timeline = signal<MkTimeline>(readTimeline());

  private untilId: string | null = null;
  private exhausted = false;

  setTimeline(timeline: MkTimeline): void {
    this.timeline.set(timeline);
    try {
      localStorage.setItem(scopedKey(MK_TIMELINE_KEY), timeline);
    } catch {
      // The choice still applies to this visit.
    }
  }

  reset(): void {
    this.untilId = null;
    this.exhausted = false;
    this.errors.set([]);
    this.authenticationFailed.set(false);
    // A different account may have become active since the last read.
    this.timeline.set(readTimeline());
  }

  fetchPage(): Observable<Status[]> {
    const identity = misskeyIdentity(this.auth.activeMisskeyKey());
    if (this.exhausted || !identity) {
      return of([]);
    }
    const server = identity.profile.server;
    const timeline = this.timeline();
    this.diagnostics.info('misskey:page-start', { timeline, hasCursor: this.untilId !== null });
    return defer(() =>
      forkJoin([this.api.timeline(timeline, this.untilId), from(import('./misskey-adapter'))]),
    ).pipe(
      map(([notes, { adaptMisskeyNote }]) => {
        const last = notes.at(-1)?.id ?? null;
        if (!last || last === this.untilId) {
          this.exhausted = true;
        }
        this.untilId = last;
        this.diagnostics.info('misskey:page-success', {
          timeline,
          notes: notes.length,
          exhausted: this.exhausted,
        });
        return notes.filter((note) => !note.isHidden).map((note) => adaptMisskeyNote(note, server));
      }),
      catchError((err: unknown) => {
        this.exhausted = true;
        const error = err instanceof MisskeyApiError ? err : null;
        this.authenticationFailed.set(!!error?.signInRequired);
        this.errors.set([error?.message ?? 'Misskey timeline unavailable.']);
        this.diagnostics.error('misskey:page-error', err, { timeline });
        // Let the aggregator isolate and log the failure, as Bluesky does.
        return throwError(() => err);
      }),
    );
  }
}
