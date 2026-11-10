import { computed, inject, Injectable, signal } from '@angular/core';
import { catchError, defer, forkJoin, from, map, Observable, of, throwError } from 'rxjs';
import { scopedKey } from '../../account-scope';
import { Auth } from '../../auth';
import { HomeDiagnostics } from '../../home-diagnostics';
import { Status } from '../../models';
import { FeedProvider } from '../provider';
import { MisskeyApi, MisskeyApiError } from './misskey-api';
import { isMisskeyVisitor, misskeyIdentity } from './misskey-identity-store';
import { MkNote, MkTimeline } from './misskey-types';
import { MisskeyVisitorFollow, MisskeyVisitorFollows } from './misskey-visitor-follows';

/** Which Misskey timeline Home shows, per account. */
export const MK_TIMELINE_KEY = 'mockingbird_misskey_timeline';

/**
 * A timeline Home can show: one of the server's, or `following`, the
 * visitor's browser-local follows read one user at a time.
 */
export type MkHomeTimeline = MkTimeline | 'following';

/** The timelines Home can show a signed-in account, in picker order. */
export const MK_TIMELINES: readonly MkHomeTimeline[] = ['home', 'social', 'local', 'global'];

/**
 * The visitor's timelines. Home and Social need an account on the server;
 * Local and Global answer visitors unless the admin switched them off for
 * them (the server then says `LTL_DISABLED` / `GTL_DISABLED`).
 */
export const MK_VISITOR_TIMELINES: readonly MkHomeTimeline[] = ['following', 'local', 'global'];

/** Followed users read per page, as Anonymous does. */
const FAN_OUT = 8;
/** Notes per followed user per page. */
const PER_USER = 10;

export function misskeyTimelinesFor(key: string | null): readonly MkHomeTimeline[] {
  return isMisskeyVisitor(key) ? MK_VISITOR_TIMELINES : MK_TIMELINES;
}

function readTimeline(key: string | null): MkHomeTimeline {
  const allowed = misskeyTimelinesFor(key);
  // A visitor starts on Local: Following is empty until they follow someone.
  const fallback: MkHomeTimeline = isMisskeyVisitor(key) ? 'local' : 'home';
  try {
    const raw = localStorage.getItem(scopedKey(MK_TIMELINE_KEY));
    return allowed.includes(raw as MkHomeTimeline) ? (raw as MkHomeTimeline) : fallback;
  } catch {
    return fallback;
  }
}

interface FollowCursor {
  follow: MisskeyVisitorFollow;
  untilId: string | null;
  exhausted: boolean;
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
  private visitorFollows = inject(MisskeyVisitorFollows);

  readonly id = 'misskey' as const;
  readonly label = 'Misskey';
  readonly badge = '🐈 Misskey';
  readonly linked = computed(() => this.auth.activeMisskeyKey() !== null);
  readonly errors = signal<string[]>([]);
  /** True after the server rejected the token; Home offers to sign in again. */
  readonly authenticationFailed = signal(false);

  /** The timeline Home reads. Changing it takes effect on the next reset. */
  readonly timeline = signal<MkHomeTimeline>(readTimeline(this.auth.activeMisskeyKey()));

  private untilId: string | null = null;
  private exhausted = false;
  private cursors: FollowCursor[] = [];
  private seen = new Set<string>();

  setTimeline(timeline: MkHomeTimeline): void {
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
    this.timeline.set(readTimeline(this.auth.activeMisskeyKey()));
    this.seen.clear();
    this.cursors = this.visitorFollows
      .follows()
      .map((follow) => ({ follow, untilId: null, exhausted: false }));
  }

  fetchPage(): Observable<Status[]> {
    const identity = misskeyIdentity(this.auth.activeMisskeyKey());
    if (this.exhausted || !identity) {
      return of([]);
    }
    const server = identity.profile.server;
    const timeline = this.timeline();
    if (timeline === 'following') return this.fetchFollowing();
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

  /**
   * The visitor's Following timeline: each followed user's notes, read with
   * `users/notes` on the server they were followed through, merged newest
   * first. One unreadable user is skipped and reported, never the whole page.
   */
  private fetchFollowing(): Observable<Status[]> {
    const active = this.cursors.filter((cursor) => !cursor.exhausted).slice(0, FAN_OUT);
    if (!active.length) {
      this.exhausted = true;
      return of([]);
    }
    return defer(() =>
      forkJoin([
        forkJoin(active.map((cursor) => this.followPage(cursor))),
        from(import('./misskey-adapter')),
      ]),
    ).pipe(
      map(([pages, { adaptMisskeyNote }]) =>
        pages
          .flatMap(({ server, notes }) =>
            notes
              .filter((note) => !note.isHidden && !this.seen.has(note.id))
              .map((note) => {
                this.seen.add(note.id);
                return adaptMisskeyNote(note, server);
              }),
          )
          .sort((a, b) => b.created_at.localeCompare(a.created_at)),
      ),
    );
  }

  private followPage(cursor: FollowCursor): Observable<{ server: string; notes: MkNote[] }> {
    const { follow } = cursor;
    return this.api
      .call<MkNote[]>(follow.server, 'users/notes', {
        userId: follow.userId,
        limit: PER_USER,
        withReplies: false,
        withRenotes: true,
        ...(cursor.untilId ? { untilId: cursor.untilId } : {}),
      })
      .pipe(
        map((notes) => {
          const last = notes.at(-1)?.id ?? null;
          cursor.exhausted = !last || last === cursor.untilId || notes.length < PER_USER;
          cursor.untilId = last;
          return { server: follow.server, notes };
        }),
        catchError(() => {
          cursor.exhausted = true;
          const handle = `@${follow.username}@${follow.host}`;
          this.errors.update((list) => (list.includes(handle) ? list : [...list, handle]));
          return of({ server: follow.server, notes: [] as MkNote[] });
        }),
      );
  }
}
