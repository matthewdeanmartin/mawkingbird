import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { catchError, firstValueFrom, of } from 'rxjs';
import { AccountAnalytics } from '../account-analytics/account-analytics';
import { AnonymousPublicApi } from '../anonymous/anonymous-public-api';
import { AnonymousPublicRef } from '../anonymous/anonymous-route-ref';
import { MbButton } from '../../design-system/button/button';
import { MbControl, MbField } from '../../design-system/field/field';
import { MbNotice } from '../../design-system/notice/notice';
import { Account } from '../../platform/api/models';
import { Auth } from '../../platform/session/auth';
import { adaptProfile } from '../../connections/bluesky/bluesky-adapter';
import { BlueskyApi } from '../../connections/bluesky/bluesky-api';
import { parsePerson } from './fediverse-handle';

// i18n analyticsLookup.label: Mastodon or Bluesky handle
// i18n analyticsLookup.hint: Any public account, like @alice@mastodon.social or alice.bsky.social. No sign-in needed.
// i18n analyticsLookup.show: Show analytics
// i18n analyticsLookup.mine: My analytics
// i18n analyticsLookup.looking: Looking up {{handle}}…
// i18n analyticsLookup.invalid: Type a full handle, like @alice@mastodon.social or alice.bsky.social.
// i18n analyticsLookup.notFound: {{handle}} could not be read from its server. It may not exist, or the server may not share public data.
// i18n analyticsLookup.publicOnly: From {{handle}}'s public posts and followers, read from their own server.
// i18n analyticsLookup.blueskyOnly: From {{handle}}'s public posts on Bluesky. Reposts are left out.

/** What is on screen: the signed-in account, or a looked-up public one. */
type Shown =
  | { kind: 'me'; key: string; account: Account }
  | { kind: 'public'; key: string; account: Account; ref: AnonymousPublicRef; handle: string }
  | { kind: 'bluesky'; key: string; account: Account; did: string; handle: string };

/**
 * Analytics for any public Mastodon or Bluesky account, signed in or not.
 *
 * A Mastodon handle is resolved on its own server's public API and the
 * ordinary account analytics run against that server (the `publicRef` path the
 * profile page's Analytics tab already uses). A Bluesky handle is resolved on
 * Bluesky's public AppView and the analytics read its public author feed. Signed in with Mastodon there is
 * also "My analytics", the default when no handle is asked for. The handle
 * rides in `?acct=` so a result can be linked and survives a reload.
 */
@Component({
  selector: 'app-analytics-lookup',
  imports: [AccountAnalytics, MbButton, MbField, MbControl, MbNotice, TranslocoPipe],
  template: `
    <form class="lookup" (submit)="submit($event)">
      <mb-field
        [label]="'analyticsLookup.label' | transloco"
        [hint]="'analyticsLookup.hint' | transloco"
      >
        <input
          mbControl
          type="text"
          name="acct"
          autocomplete="off"
          spellcheck="false"
          placeholder="@alice@mastodon.social"
          [value]="draft()"
          (input)="draft.set($any($event.target).value)"
        />
      </mb-field>
      <div class="lookup-actions">
        <button mbButton type="submit" [disabled]="busy()">
          {{ 'analyticsLookup.show' | transloco }}
        </button>
        @if (me(); as account) {
          <button mbButton type="button" variant="outline" (click)="showMine()">
            {{ 'analyticsLookup.mine' | transloco }}
          </button>
        }
      </div>
    </form>

    @if (busy()) {
      <p class="muted" aria-live="polite">
        {{ 'analyticsLookup.looking' | transloco: { handle: pending() } }}
      </p>
    } @else if (error(); as key) {
      <mb-notice tone="error" announcement="alert">{{
        key | transloco: { handle: pending() }
      }}</mb-notice>
    }

    <!-- One-item loop: a new account re-creates the analytics, which load once on init. -->
    @for (view of shownList(); track view.key) {
      @if (view.kind === 'public') {
        <p class="muted small">
          {{ 'analyticsLookup.publicOnly' | transloco: { handle: view.handle } }}
        </p>
        <app-account-analytics [account]="view.account" [publicRef]="view.ref" />
      } @else if (view.kind === 'bluesky') {
        <p class="muted small">
          {{ 'analyticsLookup.blueskyOnly' | transloco: { handle: view.handle } }}
        </p>
        <app-account-analytics [account]="view.account" [blueskyActor]="view.did" />
      } @else {
        <app-account-analytics [account]="view.account" />
      }
    }
  `,
  styles: `
    .lookup {
      display: grid;
      gap: 10px;
      margin-block-end: 16px;
    }
    .lookup-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
  `,
})
export class AnalyticsLookup implements OnInit {
  private readonly auth = inject(Auth);
  private readonly anonymousPublic = inject(AnonymousPublicApi);
  private readonly bluesky = inject(BlueskyApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  /** The signed-in Mastodon account, when there is one to show "My analytics" for. */
  protected readonly me = computed(() =>
    this.auth.lacksMastodonToken ? null : (this.auth.account() ?? null),
  );
  protected readonly draft = signal('');
  protected readonly pending = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  private readonly shown = signal<Shown | null>(null);
  protected readonly shownList = computed(() => {
    const view = this.shown();
    return view ? [view] : [];
  });
  private lookupSeq = 0;

  ngOnInit(): void {
    const acct = this.route.snapshot.queryParamMap?.get('acct') ?? null;
    if (acct) {
      this.draft.set(acct);
      void this.lookup(acct);
    } else {
      this.showMine(false);
    }
  }

  protected submit(event: Event): void {
    event.preventDefault();
    const value = this.draft().trim();
    if (!value) return;
    this.setQuery(value);
    void this.lookup(value);
  }

  protected showMine(updateUrl = true): void {
    const account = this.me();
    this.lookupSeq++;
    this.busy.set(false);
    this.error.set(null);
    if (!account) {
      this.shown.set(null);
      return;
    }
    this.draft.set('');
    if (updateUrl) this.setQuery(null);
    this.shown.set({ kind: 'me', key: `me:${account.id}`, account });
  }

  private async lookup(value: string): Promise<void> {
    const seq = ++this.lookupSeq;
    const person = parsePerson(value);
    this.pending.set(value.trim());
    this.error.set(null);
    if (!person) {
      this.error.set('analyticsLookup.invalid');
      return;
    }
    this.busy.set(true);
    const shown = await (person.network === 'mastodon'
      ? this.mastodon(person.handle.user, person.handle.host, person.label)
      : this.blueskyAccount(person.actor, person.label));
    if (seq !== this.lookupSeq) return;
    this.busy.set(false);
    if (!shown) {
      this.error.set('analyticsLookup.notFound');
      return;
    }
    this.shown.set(shown);
  }

  private async mastodon(user: string, host: string, label: string): Promise<Shown | null> {
    const server = `https://${host}`;
    const account = await firstValueFrom(
      this.anonymousPublic.lookupAccount(server, user).pipe(catchError(() => of(null))),
    );
    return account
      ? {
          kind: 'public',
          key: `${host}:${account.id}`,
          account,
          ref: { server, id: account.id },
          handle: label,
        }
      : null;
  }

  private async blueskyAccount(actor: string, label: string): Promise<Shown | null> {
    const profile = await firstValueFrom(
      this.bluesky.getProfile(actor).pipe(catchError(() => of(null))),
    );
    return profile?.did
      ? {
          kind: 'bluesky',
          key: `bsky:${profile.did}`,
          account: adaptProfile(profile),
          did: profile.did,
          handle: profile.handle ? `@${profile.handle}` : label,
        }
      : null;
  }

  private setQuery(acct: string | null): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { acct },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
