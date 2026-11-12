import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { BlueskySession } from '../../connections/bluesky/bluesky-session';
import { MbButton } from '../../design-system/button/button';
import { MbControl, MbField } from '../../design-system/field/field';
import { MbNotice } from '../../design-system/notice/notice';
import { Server } from '../../platform/http/server';
import { Auth } from '../../platform/session/auth';
import { StatusCard } from '../../posts/status-card/status-card';
import { serverHost } from '../../posts/copy-link/deep-links';
import { InteractionFailure, InteractionFinder, InteractionResult } from './interaction-finder';

// i18n findInteractions.first: First account
// i18n findInteractions.second: Second account
// i18n findInteractions.hint: A Mastodon handle like @alice@mastodon.social, or a Bluesky handle like alice.bsky.social.
// i18n findInteractions.find: Find interactions
// i18n findInteractions.me: Me and…
// i18n findInteractions.searching: Reading both accounts' posts…
// i18n findInteractions.invalid: That does not look like a full handle: {{value}}
// i18n findInteractions.mixed: These accounts are on different networks, so they cannot reply to or mention each other directly.
// i18n findInteractions.same: Those are the same account.
// i18n findInteractions.notFound: {{value}} could not be read. It may not exist, or its server may not share public posts.
// i18n findInteractions.none: No replies or mentions between them turned up.
// i18n findInteractions.count: {{count}} posts between them.
// i18n findInteractions.scannedMastodon: Checked the latest {{a}} posts by {{first}} and {{b}} by {{second}}, read from their own servers. Older exchanges are not included.
// i18n findInteractions.scannedBluesky: Checked the latest {{a}} posts by {{first}} and {{b}} by {{second}}.
// i18n findInteractions.searchedBluesky: Bluesky search was used as well, so older posts are included.
// i18n findInteractions.signInForSearch: Sign in with Bluesky to search further back than the latest posts.

/**
 * Two handles in, the replies and mentions between them out, as ordinary post
 * cards — so Copy link, translation and the rest work on every result. The
 * handles ride in `?a=` and `?b=`, which makes a result linkable and lets a
 * sign-in come back to it.
 */
@Component({
  selector: 'app-interactions-workbench',
  imports: [StatusCard, MbButton, MbField, MbControl, MbNotice, TranslocoPipe],
  template: `
    <form class="pair" (submit)="submit($event)">
      <mb-field [label]="'findInteractions.first' | transloco">
        <input
          mbControl
          type="text"
          name="a"
          autocomplete="off"
          spellcheck="false"
          placeholder="@alice@mastodon.social"
          [value]="a()"
          (input)="a.set($any($event.target).value)"
        />
      </mb-field>
      <mb-field
        [label]="'findInteractions.second' | transloco"
        [hint]="'findInteractions.hint' | transloco"
      >
        <input
          mbControl
          type="text"
          name="b"
          autocomplete="off"
          spellcheck="false"
          placeholder="@bob@fosstodon.org"
          [value]="b()"
          (input)="b.set($any($event.target).value)"
        />
      </mb-field>
      <div class="pair-actions">
        <button mbButton type="submit" [disabled]="busy()">
          {{ 'findInteractions.find' | transloco }}
        </button>
        @if (myHandle(); as handle) {
          <button mbButton type="button" variant="outline" (click)="a.set(handle)">
            {{ 'findInteractions.me' | transloco }}
          </button>
        }
      </div>
    </form>

    @if (busy()) {
      <p class="muted" aria-live="polite">{{ 'findInteractions.searching' | transloco }}</p>
    } @else if (failure(); as f) {
      <mb-notice tone="error" announcement="alert">{{
        failureKey(f) | transloco: { value: failureValue(f) }
      }}</mb-notice>
    } @else if (result(); as r) {
      <section class="results" aria-live="polite">
        <p class="summary">
          {{
            (r.posts.length ? 'findInteractions.count' : 'findInteractions.none')
              | transloco: { count: r.posts.length }
          }}
        </p>
        <p class="muted small">
          {{
            (r.network === 'mastodon'
              ? 'findInteractions.scannedMastodon'
              : 'findInteractions.scannedBluesky'
            )
              | transloco
                : { a: r.scanned[0], b: r.scanned[1], first: labels()[0], second: labels()[1] }
          }}
          @if (r.network === 'bluesky') {
            {{
              (r.searched ? 'findInteractions.searchedBluesky' : 'findInteractions.signInForSearch')
                | transloco
            }}
          }
        </p>
        @for (post of r.posts; track post.id) {
          <app-status-card [status]="post" />
        }
      </section>
    }
  `,
  styles: `
    .pair {
      display: grid;
      gap: 12px;
      margin-block-end: 16px;
    }
    .pair-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .summary {
      font-weight: 700;
      margin-block-end: 4px;
    }
    .results app-status-card {
      border-inline: 1px solid var(--border);
    }
  `,
})
export class InteractionsWorkbench implements OnInit {
  private readonly finder = inject(InteractionFinder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(Auth);
  private readonly server = inject(Server);
  private readonly blueskySession = inject(BlueskySession);

  protected readonly a = signal('');
  protected readonly b = signal('');
  protected readonly busy = signal(false);
  protected readonly result = signal<InteractionResult | null>(null);
  protected readonly failure = signal<InteractionFailure | null>(null);
  /** The two inputs as they were when the last search ran, for the summary line. */
  protected readonly labels = signal<[string, string]>(['', '']);
  private runSeq = 0;

  /** The signed-in reader's own handle, Mastodon first, for "Me and…". */
  protected readonly myHandle = computed(() => {
    const account = this.auth.lacksMastodonToken ? null : this.auth.account();
    if (account) {
      const acct = account.acct.includes('@')
        ? account.acct
        : `${account.acct}@${serverHost(this.server.baseUrl()) ?? ''}`;
      if (!acct.endsWith('@')) return `@${acct}`;
    }
    const bsky = this.blueskySession.session();
    return bsky?.handle ? `@${bsky.handle}` : null;
  });

  ngOnInit(): void {
    const params = this.route.snapshot.queryParamMap;
    const a = params?.get('a') ?? '';
    const b = params?.get('b') ?? '';
    this.a.set(a);
    this.b.set(b);
    if (a && b) void this.run(a, b);
  }

  protected submit(event: Event): void {
    event.preventDefault();
    const a = this.a().trim();
    const b = this.b().trim();
    if (!a || !b) return;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { a, b },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
    void this.run(a, b);
  }

  private async run(a: string, b: string): Promise<void> {
    const seq = ++this.runSeq;
    this.labels.set([a, b]);
    this.result.set(null);
    this.failure.set(null);
    // Fail fast on malformed or mismatched input, before any request.
    const checked = this.finder.check(a, b);
    if (!('people' in checked)) {
      this.failure.set(checked);
      return;
    }
    this.busy.set(true);
    const outcome = await this.finder.find(a, b);
    if (seq !== this.runSeq) return;
    this.busy.set(false);
    if ('posts' in outcome) this.result.set(outcome);
    else this.failure.set(outcome);
  }

  protected failureKey(failure: InteractionFailure): string {
    return `findInteractions.${failure.reason}`;
  }

  protected failureValue(failure: InteractionFailure): string {
    return 'which' in failure ? this.labels()[failure.which] : '';
  }
}
