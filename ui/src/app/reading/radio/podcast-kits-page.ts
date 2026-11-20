import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { map } from 'rxjs';
import { FollowButton } from '../../accounts/follow-button/follow-button';
import { MbButton } from '../../design-system/button/button';
import { MbControl, MbField } from '../../design-system/field/field';
import { Account } from '../../platform/api/models';
import { PodcastIndex, PodcastKits, PodcastMember, PodcastPack } from './podcast-kits';
import { RadioHeader } from './radio-header';
import { SinglesTabs } from './section-tabs';

// i18n podcastKits.title: Podcast starter kits
// i18n podcastKits.lead: Pick a subject to find podcasters on Mastodon. See what they share before you follow.
// i18n podcastKits.snapshot: Media seen when these kits were built: {{date}}
// i18n podcastKits.loading: Loading podcast kits…
// i18n podcastKits.unavailable: Podcast kits are unavailable right now.
// i18n podcastKits.empty: Podcast kits are being prepared.
// i18n podcastKits.all: All kits
// i18n podcastKits.shows: {{count}} shows
// i18n podcastKits.language: Language
// i18n podcastKits.native: Native Mastodon audio
// i18n podcastKits.fullPlayer: Plays through in Radio
// i18n podcastKits.outgoing: Opens outside Radio
// i18n podcastKits.short: Short sample or non-advancing player
// i18n podcastKits.play: Play in Radio
// i18n podcastKits.openPost: Open post
// i18n podcastKits.findMore: Find this account’s singles
// i18n podcastKits.show: Show website
// i18n podcastKits.bot: Show feed

@Component({
  selector: 'app-podcast-kits-page',
  imports: [
    RouterLink,
    TranslocoPipe,
    RadioHeader,
    SinglesTabs,
    MbButton,
    MbField,
    MbControl,
    FollowButton,
  ],
  template: `
    <section class="page">
      <app-radio-header [heading]="'podcastKits.title' | transloco" />
      <app-singles-tabs current="starter" />
      <p class="lead">{{ 'podcastKits.lead' | transloco }}</p>
      @if (index(); as catalogue) {
        <p class="snapshot">
          {{ 'podcastKits.snapshot' | transloco: { date: dateOf(catalogue) } }}
        </p>
      }
      @if (loading()) {
        <p role="status">{{ 'podcastKits.loading' | transloco }}</p>
      } @else if (failed()) {
        <p role="alert">{{ 'podcastKits.unavailable' | transloco }}</p>
      } @else if (!entries().length) {
        <p>{{ 'podcastKits.empty' | transloco }}</p>
      } @else {
        @if (languages().length > 1) {
          <mb-field [label]="'podcastKits.language' | transloco">
            <select mbControl [value]="lang()" (change)="chooseLanguage($any($event.target).value)">
              @for (code of languages(); track code) {
                <option [value]="code">{{ code }}</option>
              }
            </select>
          </mb-field>
        }
        @if (pack(); as selected) {
          <a routerLink="/singles/starter-kits" [queryParams]="{ lang: lang() }">{{
            'podcastKits.all' | transloco
          }}</a>
          <h2>{{ selected.icon }} {{ titleOf(selected) }}</h2>
          <ul class="rows">
            @for (member of selected.members; track member.acct) {
              <li class="member">
                @if (member.avatar) {
                  <img [src]="member.avatar" alt="" width="44" height="44" loading="lazy" />
                }
                <div class="details">
                  <strong>{{ member.displayName }}</strong>
                  <a [href]="member.url" target="_blank" rel="noopener noreferrer">
                    &#64;{{ member.acct }}
                  </a>
                  @if (member.bot) {
                    <span>{{ 'podcastKits.bot' | transloco }}</span>
                  }
                  @if (member.bio) {
                    <p>{{ member.bio }}</p>
                  }
                  @if (member.showUrl) {
                    <a [href]="member.showUrl" target="_blank" rel="noopener noreferrer">{{
                      'podcastKits.show' | transloco
                    }}</a>
                  }
                  <ul class="media">
                    @for (item of member.media; track item.kind + item.source) {
                      <li>
                        <span>{{ mediaLabel(item.kind) | transloco }} · {{ item.source }}</span>
                        @if (item.kind === 'native' || item.kind === 'full-player') {
                          <a
                            mbButton
                            size="small"
                            routerLink="/radio"
                            [queryParams]="{ play: item.postUrl }"
                            >{{ 'podcastKits.play' | transloco }}</a
                          >
                        } @else {
                          <a [href]="item.postUrl" target="_blank" rel="noopener noreferrer">{{
                            'podcastKits.openPost' | transloco
                          }}</a>
                        }
                      </li>
                    }
                  </ul>
                  <a routerLink="/singles/find" [queryParams]="{ acct: member.acct }">{{
                    'podcastKits.findMore' | transloco
                  }}</a>
                </div>
                <app-follow-button
                  [accountId]="'podcast:' + member.acct"
                  [handle]="member.acct"
                  [foreign]="account(member)"
                />
              </li>
            }
          </ul>
        } @else {
          <ul class="kits">
            @for (entry of entries(); track entry.path) {
              <li>
                <a
                  routerLink="/singles/starter-kits"
                  [queryParams]="{ lang: lang(), kit: entry.category }"
                >
                  <strong>{{ entry.icon }} {{ titleOf(entry) }}</strong>
                  <span>{{ 'podcastKits.shows' | transloco: { count: entry.size } }}</span>
                </a>
              </li>
            }
          </ul>
        }
      }
    </section>
  `,
  styleUrl: './podcast-kits-page.css',
})
export class PodcastKitsPage {
  private readonly kits = inject(PodcastKits);
  private readonly transloco = inject(TranslocoService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly query = toSignal(this.route.queryParamMap.pipe(map((params) => params)), {
    initialValue: this.route.snapshot.queryParamMap,
  });
  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  protected readonly index = signal<PodcastIndex | null>(null);
  protected readonly files = signal<Record<string, PodcastPack>>({});
  protected readonly languages = computed(() => Object.keys(this.index()?.languages ?? {}));
  protected readonly lang = computed(() => {
    const available = this.index()?.languages ?? {};
    const wanted = this.query().get('lang');
    if (wanted && available[wanted]) return wanted;
    const active = this.transloco.getActiveLang();
    if (available[active]) return active;
    return available['en'] ? 'en' : (Object.keys(available)[0] ?? 'en');
  });
  protected readonly entries = computed(() =>
    (this.index()?.packs ?? []).filter((row) => row.lang === this.lang()),
  );
  protected readonly pack = computed(() => {
    const wanted = this.query().get('kit');
    const row = wanted ? this.entries().find((entry) => entry.category === wanted) : null;
    return row ? (this.files()[row.path] ?? null) : null;
  });

  constructor() {
    void this.kits
      .index()
      .then((index) => this.index.set(index))
      .catch(() => {
        this.failed.set(true);
        this.loading.set(false);
      });
    effect(() => {
      const index = this.index();
      const lang = this.lang();
      if (!index) return;
      const wanted = this.query().get('kit');
      const row = index.packs.find((entry) => entry.lang === lang && entry.category === wanted);
      untracked(() => {
        this.failed.set(false);
        this.loading.set(!!row && !this.files()[row.path]);
        if (!row || this.files()[row.path]) return;
        void this.kits
          .pack(row.path)
          .then((pack) => {
            if (this.lang() !== lang || this.query().get('kit') !== row.category) return;
            this.files.update((files) => ({ ...files, [row.path]: pack }));
            this.loading.set(false);
          })
          .catch(() => {
            if (this.lang() !== lang || this.query().get('kit') !== row.category) return;
            this.failed.set(true);
            this.loading.set(false);
          });
      });
    });
  }

  protected chooseLanguage(lang: string): void {
    void this.router.navigate(['/singles/starter-kits'], { queryParams: { lang } });
  }

  protected titleOf(pack: Pick<PodcastPack, 'title' | 'category'>): string {
    return pack.title[this.lang()] ?? pack.title['en'] ?? pack.category;
  }

  protected dateOf(index: PodcastIndex): string {
    return index.generatedAt.slice(0, 10);
  }

  protected mediaLabel(kind: string): string {
    return (
      (
        {
          native: 'podcastKits.native',
          'full-player': 'podcastKits.fullPlayer',
          outgoing: 'podcastKits.outgoing',
          short: 'podcastKits.short',
        } as Record<string, string>
      )[kind] ?? 'podcastKits.outgoing'
    );
  }

  protected account(member: PodcastMember): Account {
    const [username, host] = member.acct.split('@');
    return {
      id: `podcast:${member.acct}`,
      acct: member.acct,
      username,
      display_name: member.displayName,
      url: member.url ?? `https://${host}/@${username}`,
      avatar: member.avatar ?? '',
    } as Account;
  }
}
