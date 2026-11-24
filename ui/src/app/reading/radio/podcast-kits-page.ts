import { translatedComputed } from '../../i18n/translated';
import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { map } from 'rxjs';
import { FollowButton } from '../../accounts/follow-button/follow-button';
import { anonymousStatusRouteRef } from '../../accounts/anonymous/anonymous-route-ref';
import { MbButton } from '../../design-system/button/button';
import { PackLanguagePicker } from '../../discovery/pack-language-picker';
import { UiLocale } from '../../i18n/locale';
import { Account } from '../../platform/api/models';
import { ClientPrefs } from '../../platform/storage/client-prefs';
import { ExternalPlayerHost } from '../audio-embeds/external-player-host';
import { externalMedia } from '../audio-embeds/providers';
import { VideoPlayerHost } from '../video-player/video-player-host';
import { youtubeSource } from '../video-player/media-source';
import {
  PodcastIndex,
  PodcastKits,
  PodcastMember,
  PodcastPack,
  PodcastRecentPost,
  podcastPackLanguage,
} from './podcast-kits';
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
// i18n podcastKits.browserLanguage: Browser language ({{language}})
// i18n podcastKits.native: Native Mastodon media
// i18n podcastKits.nativeAudio: Native Mastodon audio
// i18n podcastKits.nativeVideo: Native Mastodon video
// i18n podcastKits.fullPlayer: Plays through in Radio
// i18n podcastKits.outgoing: Inline player
// i18n podcastKits.short: Short sample or non-advancing player
// i18n podcastKits.play: Play in Radio
// i18n podcastKits.openPost: Open post
// i18n podcastKits.findMore: Find this account’s singles
// i18n podcastKits.show: Show website
// i18n podcastKits.bot: Show feed
// i18n podcastKits.playVideo: Play video
// i18n podcastKits.showPost: Show post and media

@Component({
  selector: 'app-podcast-kits-page',
  imports: [
    RouterLink,
    TranslocoPipe,
    RadioHeader,
    SinglesTabs,
    MbButton,
    PackLanguagePicker,
    FollowButton,
    ExternalPlayerHost,
    VideoPlayerHost,
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
      @if (failed()) {
        <p role="alert">{{ 'podcastKits.unavailable' | transloco }}</p>
      } @else {
        @if (languages().length > 1) {
          <app-pack-language-picker
            [label]="'bundledStarterKits.languages' | transloco"
            [value]="pickerValue()"
            [options]="languageOptions()"
            (valueChange)="chooseLanguage($event)"
          />
        }
        @if (loading()) {
          <p role="status">{{ 'podcastKits.loading' | transloco }}</p>
        } @else if (!entries().length) {
          <p>{{ 'podcastKits.empty' | transloco }}</p>
        } @else if (pack(); as selected) {
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
                  <a [routerLink]="['/accounts', '@' + member.acct]"> &#64;{{ member.acct }} </a>
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
                  <div class="media-types">
                    @for (item of member.media; track item.kind + item.source) {
                      <span
                        >{{ mediaLabel(item.kind, item.mediaType) | transloco }} ·
                        {{ item.source }}</span
                      >
                    }
                  </div>
                  <div class="posts">
                    @for (post of member.recentPosts; track post.statusId) {
                      <article class="post">
                        <a [routerLink]="postRoute(post)" class="post-date">{{
                          post.createdAt.slice(0, 10)
                        }}</a>
                        @if (post.spoilerText || post.sensitive) {
                          <p>{{ post.spoilerText }}</p>
                          <button mbButton size="small" type="button" (click)="reveal(post)">
                            {{ 'podcastKits.showPost' | transloco }}
                          </button>
                        }
                        @if (
                          (!post.spoilerText && !post.sensitive) ||
                          revealedPosts().has(post.server + post.statusId)
                        ) {
                          @if (post.text) {
                            <p class="post-text">{{ post.text }}</p>
                          }
                          @for (item of post.sources; track item.url) {
                            <div class="post-media">
                              @if (
                                (item.kind === 'native' && item.mediaType === 'audio') ||
                                item.source === 'direct-audio'
                              ) {
                                <audio controls preload="none" [src]="item.url"></audio>
                              } @else if (item.kind === 'native' && item.mediaType === 'video') {
                                <video controls preload="none" [src]="item.url"></video>
                              } @else if (embedded(item.url); as player) {
                                @if (player.embed) {
                                  <app-external-player [source]="player" />
                                } @else if (videoSource(item.url); as video) {
                                  @if (activeVideo() === post.statusId + item.url) {
                                    <app-video-player [source]="video" [inline]="true" />
                                  } @else {
                                    <button
                                      mbButton
                                      size="small"
                                      type="button"
                                      (click)="activeVideo.set(post.statusId + item.url)"
                                    >
                                      {{ 'podcastKits.playVideo' | transloco }}
                                    </button>
                                  }
                                }
                              }
                            </div>
                          }
                        }
                        <a [routerLink]="postRoute(post)">{{
                          'podcastKits.openPost' | transloco
                        }}</a>
                        @if (radioPlayable(post)) {
                          <a
                            mbButton
                            size="small"
                            routerLink="/radio"
                            [queryParams]="{ play: post.postUrl }"
                            >{{ 'podcastKits.play' | transloco }}</a
                          >
                        }
                      </article>
                    }
                  </div>
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
  private readonly prefs = inject(ClientPrefs);
  private readonly uiLocale = inject(UiLocale);
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
  protected readonly activeVideo = signal<string | null>(null);
  protected readonly revealedPosts = signal(new Set<string>());
  protected readonly languages = computed(() => Object.keys(this.index()?.languages ?? {}));
  private readonly browserLanguages =
    typeof navigator === 'undefined'
      ? []
      : navigator.languages?.length
        ? [...navigator.languages]
        : navigator.language
          ? [navigator.language]
          : [];
  protected readonly browserLang = computed(() =>
    podcastPackLanguage(this.languages(), null, null, this.browserLanguages),
  );
  protected readonly lang = computed(() =>
    podcastPackLanguage(
      this.languages(),
      this.query().get('lang'),
      this.prefs.podcastPackLanguage(),
      this.browserLanguages,
    ),
  );
  protected readonly pickerValue = computed(
    () => this.query().get('lang') ?? this.prefs.podcastPackLanguage() ?? 'auto',
  );
  protected readonly languageOptions = translatedComputed(() => [
    {
      value: 'auto',
      label: this.browserLabel(),
    },
    ...this.languages().map((code) => ({ value: code, label: this.languageName(code) })),
  ]);

  private browserLabel(): string {
    this.uiLocale.active();
    return this.transloco.translate('podcastKits.browserLanguage', {
      language: this.languageName(this.browserLang()),
    });
  }
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
    this.prefs.podcastPackLanguage.set(lang === 'auto' ? null : lang);
    void this.router.navigate(['/singles/starter-kits'], {
      queryParams: lang === 'auto' ? {} : { lang },
    });
  }

  private languageName(code: string): string {
    return new Intl.DisplayNames([code], { type: 'language' }).of(code) ?? code;
  }

  protected titleOf(pack: Pick<PodcastPack, 'title' | 'category'>): string {
    return pack.title[this.lang()] ?? pack.title['en'] ?? pack.category;
  }

  protected dateOf(index: PodcastIndex): string {
    return index.generatedAt.slice(0, 10);
  }

  protected embedded = externalMedia;
  protected videoSource = youtubeSource;

  protected mediaLabel(kind: string, mediaType: string | null): string {
    if (kind === 'native' && mediaType === 'audio') return 'podcastKits.nativeAudio';
    if (kind === 'native' && mediaType === 'video') return 'podcastKits.nativeVideo';
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

  protected radioPlayable(post: PodcastRecentPost): boolean {
    return post.sources.some(
      (source) =>
        source.kind === 'full-player' || (source.kind === 'native' && source.mediaType === 'audio'),
    );
  }

  protected reveal(post: PodcastRecentPost): void {
    this.revealedPosts.update((current) => new Set([...current, post.server + post.statusId]));
  }

  protected postRoute(post: PodcastRecentPost): (string | number)[] {
    return [
      '/statuses',
      anonymousStatusRouteRef({
        server: post.server,
        id: post.statusId,
        originalUrl: post.postUrl,
      }),
    ];
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
