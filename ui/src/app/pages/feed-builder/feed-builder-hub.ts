import { Location, NgTemplateOutlet } from '@angular/common';
import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MbButton } from '../../design-system/button/button';
import { MbDialog } from '../../design-system/dialog/dialog';
import { MbControl, MbField } from '../../design-system/field/field';
import { MbContentLink } from '../../design-system/metadata/metadata';
import { MbNavigation, MbNavLink } from '../../design-system/navigation/navigation';
import { languageFolder, PageLanguage } from '../../focused-tools';
import { HubCopy } from './copy/hub-copy';
import {
  filledCategories,
  HubCategory,
  hubNavWordsFor,
  preferredHubLanguage,
  TOPIC_CATEGORY,
} from './feed-builder-categories';
import { FEED_BUILDER_HUB, FEED_BUILDER_HUBS, FEED_BUILDER_TOPICS } from './feed-builder-registry';
import { FeedHubEntry } from './feed-builder-routes';
import { AppOnlyLinkRel } from '../../public-page-urls';

/** One topic as the hub shows it in the chosen language. */
interface HubTopicView {
  topic: string;
  category: HubCategory;
  /** The version in the chosen language, or the English one when there is none. */
  primary: FeedHubEntry;
  /** True when {@link primary} is the English stand-in for a missing translation. */
  fallback: boolean;
  /** Every other language version, as small links after the primary one. */
  others: FeedHubEntry[];
}

/**
 * A communities hub: big categories in a left rail (a drawer on phones, as in
 * Settings), a compact list of every topic first, one category's topics with
 * their descriptions after a click.
 *
 * A language filter in the top corner picks which version of each topic is
 * shown first: the reader's browser language on the English hub, the hub's
 * own language elsewhere, with the English page standing in where a topic has
 * no translation yet. Every other version stays linked beside it, which is
 * also what keeps each hub linking every page it must for crawlers
 * (check-seo-build.mjs): the prerender knows no browser and renders the hub's
 * own language.
 *
 * Category and language live in the query string (`?c=tech&lang=de`) so a
 * filtered view can be shared; the rail's links are relative query links, not
 * routes, and never reach the sitemap.
 */
@Component({
  selector: 'app-feed-builder-hub',
  imports: [
    RouterLink,
    NgTemplateOutlet,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    MbDialog,
    MbField,
    MbControl,
    MbNavigation,
    MbNavLink,
  ],
  templateUrl: './feed-builder-hub.html',
  styleUrls: [
    '../features/features.css',
    '../features/follow.css',
    './feed-builder.css',
    './feed-builder-hub.css',
  ],
})
export class FeedBuilderHub {
  private readonly route = inject(ActivatedRoute).snapshot;
  private readonly location = inject(Location);
  private readonly entries = this.route.data['entries'] as FeedHubEntry[];
  protected readonly lang: PageLanguage = this.route.data['lang'] ?? 'en';
  protected readonly copy = this.route.data['copy'] as HubCopy;
  protected readonly words = hubNavWordsFor(this.lang);
  protected readonly english = this.lang === 'en';
  protected readonly englishHub = `/${FEED_BUILDER_HUB}`;
  /** This language's tool index: /tools for English, the language folder otherwise. */
  protected readonly toolsIndex = this.english ? '/tools' : `/${languageFolder(this.lang)}`;

  /** Languages with at least one topic page, in hub order, each named in itself. */
  protected readonly languages = FEED_BUILDER_HUBS.map((hub) => hub.lang)
    .filter((lang) => this.entries.some((entry) => entry.lang === lang))
    .map((code) => ({ code, name: languageName(code) }));

  /** Which version of each topic comes first. */
  protected readonly language = signal<string>(this.lang);
  /** The open category, or null for the compact list of everything. */
  protected readonly category = signal<HubCategory | null>(null);

  protected readonly categories = filledCategories(FEED_BUILDER_TOPICS);

  /** Every topic in the chosen language, translated topics before English stand-ins. */
  private readonly views = computed<HubTopicView[]>(() => {
    const chosen = this.language();
    const views = FEED_BUILDER_TOPICS.flatMap((topic): HubTopicView[] => {
      const versions = this.entries.filter((entry) => entry.topic === topic);
      const primary =
        versions.find((entry) => entry.lang === chosen) ??
        versions.find((entry) => entry.lang === 'en') ??
        versions[0];
      if (!primary) return [];
      return [
        {
          topic,
          category: TOPIC_CATEGORY[topic],
          primary,
          fallback: primary.lang !== chosen,
          others: versions.filter((entry) => entry !== primary),
        },
      ];
    });
    return [...views.filter((view) => !view.fallback), ...views.filter((view) => view.fallback)];
  });

  /** The rail's categories with their topics as shown. */
  protected readonly groups = computed(() =>
    this.categories.map(({ id }) => ({
      id,
      name: this.words.categories[id],
      topics: this.views().filter((view) => view.category === id),
    })),
  );

  protected readonly openGroup = computed(() =>
    this.groups().find((group) => group.id === this.category()),
  );

  protected readonly drawerOpen = signal(false);
  protected readonly phone = signal(false);
  protected readonly railButton = viewChild<MbButton, ElementRef<HTMLButtonElement>>(
    'railTrigger',
    { read: ElementRef },
  );

  constructor() {
    const destroyRef = inject(DestroyRef);
    // Browser only, after the first render: the prerender (and hydration) show
    // the hub's own language and the full list; the reader's preferences and
    // a shared link's filters apply on top.
    afterNextRender(() => {
      const query = new URLSearchParams(window.location.search);
      const available: string[] = this.languages.map((language) => language.code);
      const asked = query.get('lang');
      if (asked && available.includes(asked)) this.language.set(asked);
      else if (this.english)
        this.language.set(preferredHubLanguage(navigator.languages ?? [], available));
      const category = query.get('c');
      if (this.categories.some((c) => c.id === category)) {
        this.category.set(category as HubCategory);
      }
      const viewport = window.matchMedia?.('(max-width: 600px)');
      if (viewport) {
        this.phone.set(viewport.matches);
        const changed = (event: MediaQueryListEvent) => {
          this.phone.set(event.matches);
          if (!event.matches) this.drawerOpen.set(false);
        };
        viewport.addEventListener('change', changed);
        destroyRef.onDestroy(() => viewport.removeEventListener('change', changed));
      }
    });
  }

  protected chooseCategory(event: Event, category: HubCategory | null): void {
    event.preventDefault();
    this.category.set(category);
    this.drawerOpen.set(false);
    this.syncQuery();
  }

  protected chooseLanguage(language: string): void {
    this.language.set(language);
    this.syncQuery();
  }

  /** A rail link's href: works without script, and shares the filtered view. */
  protected categoryHref(category: HubCategory | null): string {
    const query = new URLSearchParams();
    if (category) query.set('c', category);
    if (this.language() !== this.lang) query.set('lang', this.language());
    return `?${query.toString()}`;
  }

  private syncQuery(): void {
    const path = this.location.path().split('?')[0];
    this.location.replaceState(path, this.categoryHref(this.category()).slice(1));
  }
}

/** A language's name in that language ("Deutsch", "日本語"), or its code. */
function languageName(code: string): string {
  try {
    const name = new Intl.DisplayNames([code], { type: 'language' }).of(code) ?? code;
    return name.charAt(0).toLocaleUpperCase(code) + name.slice(1);
  } catch {
    return code;
  }
}
