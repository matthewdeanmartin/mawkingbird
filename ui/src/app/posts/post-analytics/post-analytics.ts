import { AccountName } from '../../accounts/account-name';
import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { forkJoin, Observable, Subscription } from 'rxjs';
import { accountProfilePath } from '../../accounts/account-route';
import { AnonymousPublicApi } from '../../accounts/anonymous/anonymous-public-api';
import {
  AnonymousPublicRef,
  parseAnonymousStatusRouteRef,
} from '../../accounts/anonymous/anonymous-route-ref';
import { BoosterLookup } from '../../accounts/booster-lookup';
import { REACH_MODEL, ThreadReach, threadOf, threadReach } from '../../accounts/reach-model';
import { MbButton } from '../../design-system/button/button';
import { MbHelp } from '../../design-system/help/help';
import { MbPageHeader } from '../../design-system/page-header/page-header';
import { Api } from '../../platform/api/api';
import { Auth } from '../../platform/session/auth';
import { NATIVE_ANALYTICS } from '../../platform/session/platform-login';
import type { NativePostActivity } from '../../platform/session/native-analytics-types';
import { arrivalBuckets } from '../../accounts/analytics-history';
import { Account, Context, Status } from '../../platform/api/models';
import { parseAnonymousFeedId } from '../../reading/read/thread-loader';
import { StatusCard } from '../status-card/status-card';
import { Server } from '../../platform/http/server';
import { postAnalyticsDeepLink } from '../copy-link/deep-links';

// i18n postAnalytics.title: Post analytics
// i18n postAnalytics.description: Reach and engagement for one post and the thread it belongs to.
// i18n postAnalytics.loading: Loading the post…
// i18n postAnalytics.unsupported: Post analytics covers Mastodon posts for now.
// i18n postAnalytics.error.notFound: Your server can't find this post, or it isn't public. Post numbers only work on the server that gave them out, so to share analytics, use Copy link on this page.
// i18n postAnalytics.error.load: Couldn't load this post. Try again later.
// i18n postAnalytics.openPost: Open the post
// i18n postAnalytics.methodology: How these numbers work
// i18n postAnalytics.copyLink: Copy link
// i18n postAnalytics.copied: Link copied
// i18n postAnalytics.thePost: The post
// i18n postAnalytics.about: About {{stat}}
// i18n postAnalytics.tiles.reach: Est. reach
// i18n postAnalytics.tiles.potential: Could have reached
// i18n postAnalytics.tiles.likes: Favourites
// i18n postAnalytics.tiles.boosts: Boosts
// i18n postAnalytics.tiles.quotes: Quotes
// i18n postAnalytics.tiles.replies: Replies
// i18n postAnalytics.tiles.parts: Thread posts
// i18n postAnalytics.repliesVisible: {{count}} visible here
// i18n postAnalytics.help.reach: People who probably saw this thread. Modelled from followers, boosts, quotes, favourites and replies with the FediWings method, which was fitted to Instagram story views. Never more than “Could have reached”, never fewer than the people who reacted.
// i18n postAnalytics.help.reachQuick: Quick estimate: each boost counts as one typical booster with {{audience}} followers. No extra API calls.
// i18n postAnalytics.help.reachFull: Uses the real boosters' follower counts.
// i18n postAnalytics.help.potential: The author's {{followers}} followers plus the followers of everyone who boosted. The upper limit for Est. reach; people who follow both are counted twice.
// i18n postAnalytics.help.thread: Summed over the {{count}} posts of the thread: this post plus the author's own replies above and below it.
// i18n postAnalytics.help.replies: Reply count from the server, summed over the thread. "Visible here" counts the replies by other people this server shows; replies from servers it does not know about are missing.
// i18n postAnalytics.help.parts: This post plus the author's own replies chained to it. Replies to other people start their own thread.
// i18n postAnalytics.boosters.heading: Who boosted
// i18n postAnalytics.boosters.explain: Looks up who boosted the thread and uses their follower counts for reach. One call per boosted post.
// i18n postAnalytics.boosters.button.one: Look up boosters ({{count}} API call)
// i18n postAnalytics.boosters.button.other: Look up boosters ({{count}} API calls)
// i18n postAnalytics.boosters.progress: Looking up boosters… {{finished}} of {{total}}
// i18n postAnalytics.boosters.rateLimited: The server asked us to slow down. Try again in a few minutes.
// i18n postAnalytics.boosters.none: Nobody has boosted this thread.
// i18n postAnalytics.boosters.followers: {{count}} followers
// i18n postAnalytics.boosters.unattributed: {{seen}} of {{boosts}} boosts have a visible booster; the others count {{audience}} followers each.

// i18n postAnalytics.activity.heading: When it was boosted and favourited
// i18n postAnalytics.activity.help: From your notifications, by time since posting. Each cell shows the count in that window and the share received so far.
// i18n postAnalytics.activity.empty: No timed boosts or favourites for this post yet. Only notifications collected since this version name their post.
// i18n postAnalytics.activity.col.when: Since posting
// i18n postAnalytics.activity.col.boosts: Boosts
// i18n postAnalytics.activity.col.likes: Favourites
// i18n postAnalytics.activity.cell: {{count}} ({{pct}}%)
// i18n postAnalytics.activity.bucket.hour: Within 1 hour
// i18n postAnalytics.activity.bucket.sixHours: 1–6 hours
// i18n postAnalytics.activity.bucket.day: 6–24 hours
// i18n postAnalytics.activity.bucket.threeDays: 1–3 days
// i18n postAnalytics.activity.bucket.week: 3–7 days
// i18n postAnalytics.activity.bucket.month: 7–30 days
// i18n postAnalytics.activity.bucket.later: After 30 days

type LoadError = 'notFound' | 'load' | 'unsupported';

/**
 * One post's reach and engagement (`/statuses/:id/analytics`).
 *
 * Costs two calls on open (the post and its context) so the whole thread is
 * counted. Boosters are looked up only from the button, through the shared
 * {@link BoosterLookup} cache, so a post refined on the account page is free
 * here. Mastodon only: a signed-in home id or an anonymous public post. In
 * the native app, signed-in posts look boosters up on open, from the archive.
 */
@Component({
  selector: 'app-post-analytics',
  imports: [AccountName, MbButton, MbHelp, MbPageHeader, RouterLink, StatusCard, TranslocoPipe],
  templateUrl: './post-analytics.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './post-analytics.css',
})
export class PostAnalytics {
  private api = inject(Api);
  private anonymous = inject(AnonymousPublicApi);
  private destroyRef = inject(DestroyRef);
  private auth = inject(Auth);
  private native = inject(NATIVE_ANALYTICS);
  private server = inject(Server);
  protected boosters = inject(BoosterLookup);
  protected readonly accountProfilePath = accountProfilePath;
  protected readonly typicalBoosterAudience = REACH_MODEL.typicalBoosterAudience;

  /** The route id, as given: a home id or an anonymous ref. */
  protected routeId = signal('');
  private publicRef: AnonymousPublicRef | null = null;
  private loadSub: Subscription | null = null;

  protected loading = signal(true);
  protected error = signal<LoadError | null>(null);
  protected status = signal<Status | null>(null);
  private context = signal<Context>({ ancestors: [], descendants: [] });

  constructor() {
    // The component is reused when only :id changes, so follow the param.
    inject(ActivatedRoute)
      .paramMap.pipe(takeUntilDestroyed())
      .subscribe((params) => this.load(params.get('id') ?? ''));
  }

  private load(id: string): void {
    this.loadSub?.unsubscribe();
    this.routeId.set(id);
    this.publicRef = parseAnonymousStatusRouteRef(id) ?? parseAnonymousFeedId(id);
    this.loading.set(true);
    this.error.set(null);
    this.status.set(null);
    this.context.set({ ancestors: [], descendants: [] });
    this.activity.set(null);
    if (!this.publicRef && !/^[A-Za-z0-9_-]+$/.test(id)) {
      this.fail('unsupported');
      return;
    }
    const ref = this.publicRef;
    const requests: { status: Observable<Status>; context: Observable<Context> } = ref
      ? { status: this.anonymous.getStatus(ref), context: this.anonymous.getContext(ref) }
      : { status: this.api.getStatus(id), context: this.api.getContext(id) };
    this.loadSub = forkJoin(requests)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ status, context }) => {
          // A boost's page is about the post it boosted.
          this.status.set(status.reblog ?? status);
          this.context.set(context);
          this.loading.set(false);
          // Native keeps boosters in the archive, so Full reach is the default there.
          const handle = this.auth.token();
          if (!ref && this.native && handle?.startsWith('native-mastodon:')) {
            if (this.lookupCost() > 0) this.lookUpBoosters();
            const own = (status.reblog ?? status).account.id === this.auth.account()?.id;
            if (own) {
              this.native.postActivity(handle, (status.reblog ?? status).id).then(
                (activity) => this.activity.set(activity),
                () => undefined,
              );
            }
          }
        },
        error: (err: unknown) =>
          this.fail(err instanceof HttpErrorResponse && err.status === 404 ? 'notFound' : 'load'),
      });
  }

  /** Native, own posts only: when engagement arrived. */
  protected activity = signal<NativePostActivity | null>(null);

  protected arrivals = computed(() => {
    const activity = this.activity();
    const status = this.status();
    if (!activity || !status) return null;
    const times = (kind: string) =>
      activity.events.filter((e) => e.kind === kind).map((e) => e.occurredAt);
    const boosts = arrivalBuckets(status.created_at, times('reblog'));
    const likes = arrivalBuckets(status.created_at, times('favourite'));
    return {
      any: activity.events.length > 0,
      rows: boosts.map((b, i) => ({ key: b.key, boosts: b, likes: likes[i] })),
    };
  });

  private fail(reason: LoadError): void {
    this.error.set(reason);
    this.loading.set(false);
  }

  /** The thread this post belongs to, with reach; Full once boosters are known. */
  protected reach = computed<ThreadReach | null>(() => {
    const status = this.status();
    if (!status) return null;
    const thread = threadOf(status, this.context());
    return threadReach(thread, status.account.followers_count ?? 0, this.boosters.boostersOf);
  });

  /** Replies by other people that this server shows, within the thread. */
  protected visibleReplies = computed(() => {
    const status = this.status();
    const reach = this.reach();
    if (!status || !reach) return 0;
    const parts = new Set(reach.thread.parts.map((p) => p.id));
    return this.context().descendants.filter(
      (d) => d.account.id !== status.account.id && d.in_reply_to_id && parts.has(d.in_reply_to_id),
    ).length;
  });

  /** Distinct known boosters across the thread, biggest audience first. */
  protected boosterList = computed<Account[]>(() => {
    const reach = this.reach();
    if (!reach) return [];
    const seen = new Map<string, Account>();
    for (const part of reach.thread.parts) {
      for (const b of this.boosters.boostersOf(part) ?? []) seen.set(b.id, b);
    }
    return [...seen.values()].sort((a, b) => (b.followers_count ?? 0) - (a.followers_count ?? 0));
  });

  protected lookupCost = computed(() => {
    const reach = this.reach();
    return reach ? this.boosters.cost(reach.thread.parts) : 0;
  });

  /** A lookup is in flight. (In TS: a template's `run()?.ended` reads null.) */
  protected lookingUp = computed(() => this.boosters.run()?.ended === null);

  protected lookUpBoosters(): void {
    const reach = this.reach();
    if (reach) this.boosters.refine(reach.thread.parts, this.publicRef);
  }

  /** This page's address for anyone, on any server or none: `/<server>/@<acct>/<id>/analytics`. */
  protected shareLink = computed(() => {
    const status = this.status();
    return status ? postAnalyticsDeepLink(status, this.server.baseUrl()) : null;
  });
  protected copied = signal(false);

  protected async copyLink(link: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(link);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      /* Clipboard refused (insecure context, permissions): nothing to recover. */
    }
  }

  /** Compact display for tile values: 12,345 → 12.3K. */
  protected fmt(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 10_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
    return n.toLocaleString();
  }
}
