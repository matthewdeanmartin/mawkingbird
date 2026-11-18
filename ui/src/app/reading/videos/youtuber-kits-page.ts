import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { map } from 'rxjs';
import { Account } from '../../platform/api/models';
import { Auth } from '../../platform/session/auth';
import { MbButton } from '../../design-system/button/button';
import { MbControl, MbField } from '../../design-system/field/field';
import { MbPageHeader } from '../../design-system/page-header/page-header';
import { MbContentState } from '../../design-system/content-state/content-state';
import { FollowButton } from '../../accounts/follow-button/follow-button';
import { ImportFollows } from '../../accounts/import-follows';
import { VideoSubscriptions } from './video-subscriptions';
import {
  packTitle,
  preferredKitLanguage,
  YoutuberKits,
  YoutuberMember,
  YoutuberPack,
} from './youtuber-kits';

// i18n youtuberKits.title: YouTubers on Mastodon
// i18n youtuberKits.lead: Creators with a YouTube channel and a Mastodon account. Subscribe to their videos here, follow them on Mastodon, or both.
// i18n youtuberKits.language: Language
// i18n youtuberKits.loading: Loading creators…
// i18n youtuberKits.none: No creator kits yet
// i18n youtuberKits.noneLine: Kits of YouTubers on Mastodon arrive with an app update.
// i18n youtuberKits.count: {{count}} creators
// i18n youtuberKits.all: All kits
// i18n youtuberKits.subscribeAll: Subscribe to all
// i18n youtuberKits.subscribeAllTitle: Add every channel in this kit to Subscriptions, from their public feeds. No YouTube account needed.
// i18n youtuberKits.followAll: Follow all
// i18n youtuberKits.both: Do both
// i18n youtuberKits.subscribed: Subscribed to {{count}} channels.
// i18n youtuberKits.following: Following: {{done}} of {{total}}
// i18n youtuberKits.followedDone: Followed {{done}} of {{total}}.
// i18n youtuberKits.stop: Stop
// i18n youtuberKits.subscribe: Subscribe
// i18n youtuberKits.subscribedOne: Subscribed
// i18n youtuberKits.channel: Channel
// i18n youtuberKits.bot: Video feed
// i18n youtuberKits.botTitle: An account that posts this channel's videos: a place to comment on them.
// i18n youtuberKits.lastUpload: Last video {{date}}
// i18n youtuberKits.signInToFollow: Following creators needs a Mastodon account; subscribing works without one.

/**
 * YouTubers on Mastodon (spec/youtube-client.md, S5): starter kits whose
 * members each bring two things, a channel and an account. The double
 * subscribe offers them separately and together: Subscribe to all adds the
 * channels' feeds to Subscriptions, Follow all follows the accounts on the
 * reader's server (the bulk follower: resolves, paces, confirms), Do both runs
 * the two.
 */
@Component({
  selector: 'app-youtuber-kits-page',
  imports: [
    TranslocoPipe,
    RouterLink,
    DatePipe,
    MbButton,
    MbField,
    MbControl,
    MbPageHeader,
    MbContentState,
    FollowButton,
  ],
  template: `
    <mb-page-header
      [title]="'youtuberKits.title' | transloco"
      [description]="'youtuberKits.lead' | transloco"
    />
    @if (loading()) {
      <p role="status" class="muted">{{ 'youtuberKits.loading' | transloco }}</p>
    } @else if (!languages().length) {
      <mb-content-state
        [title]="'youtuberKits.none' | transloco"
        [description]="'youtuberKits.noneLine' | transloco"
      />
    } @else {
      @if (languages().length > 1) {
        <mb-field class="lang" density="compact" [label]="'youtuberKits.language' | transloco">
          <select mbControl [value]="lang()" (change)="chooseLanguage($any($event.target).value)">
            @for (code of languages(); track code) {
              <option [value]="code" [selected]="code === lang()">{{ languageName(code) }}</option>
            }
          </select>
        </mb-field>
      }
      @if (pack(); as kit) {
        <a class="back" [routerLink]="[]" [queryParams]="{ lang: lang() }"
          >← {{ 'youtuberKits.all' | transloco }}</a
        >
        <h2>{{ kit.icon }} {{ titleOf(kit) }}</h2>
        <div class="kit-actions">
          <button
            mbButton
            type="button"
            [title]="'youtuberKits.subscribeAllTitle' | transloco"
            (click)="subscribeAll(kit)"
          >
            {{ 'youtuberKits.subscribeAll' | transloco }}
          </button>
          @if (canFollow()) {
            <button
              mbButton
              type="button"
              variant="outline"
              [disabled]="importer.running()"
              (click)="followAll(kit)"
            >
              {{ 'youtuberKits.followAll' | transloco }}
            </button>
            <button
              mbButton
              type="button"
              variant="outline"
              [disabled]="importer.running()"
              (click)="both(kit)"
            >
              {{ 'youtuberKits.both' | transloco }}
            </button>
          }
        </div>
        <p role="status" class="muted small" aria-live="polite">
          @if (subscribedCount() !== null) {
            {{ 'youtuberKits.subscribed' | transloco: { count: subscribedCount() } }}
          }
          @if (followTotal()) {
            {{
              (importer.running() ? 'youtuberKits.following' : 'youtuberKits.followedDone')
                | transloco: { done: followDone(), total: followTotal() }
            }}
            @if (importer.running()) {
              <button mbButton type="button" variant="link" size="small" (click)="importer.stop()">
                {{ 'youtuberKits.stop' | transloco }}
              </button>
            }
          }
        </p>
        @if (!canFollow()) {
          <p class="muted small">{{ 'youtuberKits.signInToFollow' | transloco }}</p>
        }
        <ul class="members">
          @for (member of kit.members; track member.acct) {
            <li>
              @if (member.avatar) {
                <img [src]="member.avatar" alt="" width="44" height="44" loading="lazy" />
              }
              <div class="who">
                <strong>{{ member.displayName }}</strong>
                <span class="muted small">&#64;{{ member.acct }}</span>
                <span class="small">
                  <a [routerLink]="['/videos/channel', member.channel.id]">{{
                    member.channel.title
                  }}</a>
                  @if (member.channel.lastUpload) {
                    ·
                    <span class="muted">{{
                      'youtuberKits.lastUpload'
                        | transloco: { date: (member.channel.lastUpload | date: 'mediumDate') }
                    }}</span>
                  }
                  @if (member.bot) {
                    ·
                    <span class="badge" [title]="'youtuberKits.botTitle' | transloco">{{
                      'youtuberKits.bot' | transloco
                    }}</span>
                  }
                </span>
              </div>
              <div class="row-actions">
                <button
                  mbButton
                  type="button"
                  size="small"
                  [variant]="isSubscribed(member) ? 'outline' : 'solid'"
                  [attr.aria-pressed]="isSubscribed(member)"
                  (click)="toggle(member)"
                >
                  {{
                    (isSubscribed(member) ? 'youtuberKits.subscribedOne' : 'youtuberKits.subscribe')
                      | transloco
                  }}
                </button>
                <app-follow-button
                  [accountId]="'creator:' + member.acct"
                  [handle]="member.acct"
                  [foreign]="account(member)"
                />
              </div>
            </li>
          }
        </ul>
      } @else {
        <ul class="kits">
          @for (kit of packs(); track kit.category) {
            <li>
              <a [routerLink]="[]" [queryParams]="{ lang: lang(), kit: kit.category }">
                <span class="icon" aria-hidden="true">{{ kit.icon }}</span>
                <span class="kit-name">{{ titleOf(kit) }}</span>
                <span class="muted small">{{
                  'youtuberKits.count' | transloco: { count: kit.members.length }
                }}</span>
                <span class="faces" aria-hidden="true">
                  @for (member of kit.members.slice(0, 4); track member.acct) {
                    @if (member.avatar) {
                      <img [src]="member.avatar" alt="" width="28" height="28" loading="lazy" />
                    }
                  }
                </span>
              </a>
            </li>
          }
        </ul>
      }
    }
  `,
  styles: `
    :host {
      display: block;
      max-width: 60rem;
      padding: 1rem;
    }
    .muted {
      color: var(--muted);
    }
    .small {
      font-size: 0.85rem;
    }
    .lang {
      max-width: 16rem;
      margin-block-end: 1rem;
    }
    .kits {
      display: grid;
      gap: 0.75rem;
      grid-template-columns: repeat(auto-fill, minmax(min(100%, 14rem), 1fr));
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .kits a {
      border: 1px solid var(--border);
      border-radius: 10px;
      color: inherit;
      display: grid;
      gap: 0.25rem;
      padding: 0.75rem;
      text-decoration: none;
    }
    .kits a:hover,
    .kits a:focus-visible {
      background: var(--hover);
    }
    .icon {
      font-size: 1.4rem;
    }
    .kit-name {
      font-weight: 600;
    }
    .faces {
      display: flex;
    }
    .faces img,
    .members img {
      border-radius: 50%;
    }
    .faces img {
      margin-inline-end: -0.5rem;
      outline: 2px solid var(--bg, transparent);
    }
    .kit-actions,
    .row-actions {
      align-items: center;
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }
    .members {
      list-style: none;
      margin: 0.75rem 0 0;
      padding: 0;
    }
    .members li {
      align-items: center;
      border-top: 1px solid var(--border);
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      padding: 0.6rem 0;
    }
    .who {
      display: grid;
      flex: 1 1 14rem;
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .badge {
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 0 0.3rem;
    }
    .back {
      display: inline-block;
      margin-block-end: 0.5rem;
    }
    h2 {
      font-size: 1.2rem;
      margin: 0.25rem 0 0.75rem;
    }
  `,
})
export class YoutuberKitsPage {
  private readonly kits = inject(YoutuberKits);
  private readonly subs = inject(VideoSubscriptions);
  private readonly router = inject(Router);
  protected readonly importer = inject(ImportFollows);
  private readonly query = toSignal(inject(ActivatedRoute).queryParamMap.pipe(map((p) => p)), {
    initialValue: null,
  });

  protected readonly loading = signal(true);
  protected readonly available = signal<Record<string, number>>({});
  protected readonly languages = computed(() =>
    Object.keys(this.available()).sort((a, b) => this.available()[b] - this.available()[a]),
  );
  protected readonly lang = computed(() => {
    const asked = this.query()?.get('lang');
    if (asked && this.available()[asked]) return asked;
    return preferredKitLanguage(this.available(), this.kits.wantedLanguages()) ?? 'en';
  });
  protected readonly packs = signal<YoutuberPack[]>([]);
  protected readonly pack = computed(() => {
    const wanted = this.query()?.get('kit');
    return wanted ? (this.packs().find((p) => p.category === wanted) ?? null) : null;
  });
  protected readonly subscribedCount = signal<number | null>(null);
  /** Follow all progress, from the shared bulk follower. */
  protected readonly followTotal = computed(() => this.importer.rows().length);
  protected readonly followDone = computed(
    () => this.importer.rows().filter((row) => row.status === 'followed').length,
  );
  private readonly auth = inject(Auth);
  /** Follow all needs a Mastodon session (Anonymous follows locally); Bluesky-only cannot. */
  protected readonly canFollow = computed(() => this.auth.kind() === 'mastodon');

  constructor() {
    this.available.set(this.kits.languages());
    if (!Object.keys(this.available()).length) this.loading.set(false);
    effect(() => {
      const lang = this.lang();
      if (!this.languages().length) return;
      untracked(() => {
        this.loading.set(true);
        void this.kits.packs(lang).then((packs) => {
          if (this.lang() !== lang) return;
          this.packs.set(packs);
          this.loading.set(false);
        });
      });
    });
    effect(() => {
      this.pack();
      untracked(() => this.subscribedCount.set(null));
    });
  }

  protected titleOf(pack: YoutuberPack): string {
    return packTitle(pack, this.lang());
  }

  protected languageName(code: string): string {
    try {
      return new Intl.DisplayNames([code], { type: 'language' }).of(code) ?? code;
    } catch {
      return code;
    }
  }

  protected chooseLanguage(lang: string): void {
    void this.router.navigate([], { queryParams: { lang }, replaceUrl: true });
  }

  protected isSubscribed(member: YoutuberMember): boolean {
    return this.subs.feeds().some((feed) => feed.id === member.channel.id);
  }

  protected toggle(member: YoutuberMember): void {
    if (this.isSubscribed(member)) this.subs.remove(member.channel.id);
    else this.subs.add(member.channel.id, member.channel.title || member.displayName);
  }

  protected subscribeAll(pack: YoutuberPack): void {
    let added = 0;
    for (const member of pack.members) {
      if (!this.isSubscribed(member)) {
        this.subs.add(member.channel.id, member.channel.title || member.displayName);
        added++;
      }
    }
    this.subscribedCount.set(added);
  }

  protected async followAll(pack: YoutuberPack): Promise<void> {
    if (this.importer.running()) return;
    this.importer.reset();
    this.importer.load(pack.members.map((member) => member.acct));
    await this.importer.start();
  }

  protected async both(pack: YoutuberPack): Promise<void> {
    this.subscribeAll(pack);
    await this.followAll(pack);
  }

  /** Follow resolves the handle on the reader's own server when clicked. */
  protected account(member: YoutuberMember): Account {
    const [username] = member.acct.split('@');
    return {
      id: `creator:${member.acct}`,
      acct: member.acct,
      username,
      display_name: member.displayName,
      url: member.url ?? `https://${member.acct.split('@')[1]}/@${username}`,
      avatar: member.avatar ?? '',
    } as Account;
  }
}
