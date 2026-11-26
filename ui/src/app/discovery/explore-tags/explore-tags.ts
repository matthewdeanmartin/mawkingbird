import { Component, computed, inject, OnInit, signal, viewChild } from '@angular/core';
import { MbTab, MbTabs } from '../../design-system/tabs/tabs';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Observable, map } from 'rxjs';
import { MbButton } from '../../design-system/button/button';
import {
  MbItemList,
  MbItemMeta,
  MbItemRow,
  MbItemTitle,
} from '../../design-system/item-list/item-list';
import { MbPageHeader } from '../../design-system/page-header/page-header';
import { AnonymousTags } from '../../accounts/anonymous/anonymous-tags';
import { Lists } from '../../feeds/lists/lists';
import { Api } from '../../platform/api/api';
import { Tag } from '../../platform/api/models';
import { Auth } from '../../platform/session/auth';
import {
  HashtagSamples,
  MAX_SIMILAR_SEEDS,
  rankSimilar,
} from '../similar-hashtags/similar-hashtags';

// i18n exploreTags.title: Hashtags
// i18n exploreTags.lede: Follow a hashtag and posts on that topic come into Home, from people you don’t follow yet.
// i18n exploreTags.suggested: Suggested
// i18n exploreTags.tabs: Hashtag sections
// i18n exploreTags.tab.yours: Yours
// i18n exploreTags.tab.similar: Similar
// i18n exploreTags.tab.featured: Featured
// i18n exploreTags.tab.more: More
// i18n exploreTags.noneHere: Nothing to suggest here right now.
// i18n exploreTags.group.yours: You post with these
// i18n exploreTags.group.similar: Tags similar to what you follow now
// i18n exploreTags.group.trending: Trending on your server
// i18n exploreTags.loading: Loading…
// i18n exploreTags.failed: Couldn’t load these.
// i18n exploreTags.peopleThisWeek.one: {{count}} person this week
// i18n exploreTags.peopleThisWeek.other: {{count}} people this week
// i18n exploreTags.follow: Follow
// i18n exploreTags.following: Following
// i18n exploreTags.followAria: Follow #{{tag}}
// i18n exploreTags.followFailed: Couldn’t follow #{{tag}}.
// i18n exploreTags.byTopic: Hashtags by topic, with people to follow:
// i18n exploreTags.byTopicLink: Communities
// i18n exploreTags.noTags.bluesky: Bluesky has no followed hashtags. Its feeds do the same job: pick topics and read them as one timeline.
// i18n exploreTags.noTags.misskey: Misskey doesn’t follow hashtags into Home. Antennas and channels do that job.
// i18n exploreTags.noTags.feeds: Open Feeds
// i18n exploreTags.noTags.search: Search posts

/** Where a suggestion came from; one group each, in this order. */
export type SuggestionGroup = 'yours' | 'similar' | 'trending';

export interface TagSuggestion {
  name: string;
  /** Distinct accounts using it over the server's last week, when the API says. */
  people: number | null;
}

interface GroupState {
  status: 'loading' | 'ready' | 'failed';
  tags: TagSuggestion[];
}

export type TagsTab = 'yours' | 'similar' | 'featured' | 'more';

/** The tab last open, kept for the session so Back from a tag page returns to it. */
let lastTab: TagsTab = 'yours';

/** For tests. */
export function resetTagsTab(): void {
  lastTab = 'yours';
}

/** Suggestions shown per group: enough to choose from, few enough to read. */
export const PER_GROUP = 8;

/** People using a tag over its history (Mastodon sends a week, newest first). */
export function peopleThisWeek(tag: Pick<Tag, 'history'>): number | null {
  if (!tag.history?.length) return null;
  return tag.history.reduce((sum, day) => sum + (Number(day.accounts) || 0), 0);
}

/**
 * Each group without tags already followed or shown in an earlier group,
 * capped. A hashtag appears once on the page, in the first group that has it.
 */
export function dedupeGroups(
  groups: Record<SuggestionGroup, TagSuggestion[]>,
  followed: ReadonlySet<string>,
): Record<SuggestionGroup, TagSuggestion[]> {
  const seen = new Set(followed);
  const out = {} as Record<SuggestionGroup, TagSuggestion[]>;
  for (const group of ['yours', 'similar', 'trending'] as const) {
    out[group] = [];
    for (const tag of groups[group]) {
      const key = tag.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      if (out[group].length < PER_GROUP) out[group].push(tag);
    }
  }
  return out;
}

/**
 * Explore → Tags (spec/sprint/explore-2026-11.md, Sprint 3): hashtags as a way
 * to find content, with suggestions to follow on top and the Feeds hub's own
 * tag sections (followed hashtags, tags.pub, tag bundles, featured) below.
 *
 * Those sections are the Feeds hub's `Lists` page itself, filtered to tags by
 * this route's `only: 'tags'` data, not a copy: Feeds keeps them unchanged,
 * and this page is one more way in (owner, 2026-11-26).
 *
 * Every suggestion source loads on its own, so one failing leaves the others.
 * Costs: one request each for "yours" (Mastodon only), "similar" (one tag
 * timeline over up to eight followed tags) and "trending".
 */
@Component({
  selector: 'app-explore-tags',
  imports: [
    Lists,
    MbButton,
    MbItemList,
    MbItemMeta,
    MbItemRow,
    MbItemTitle,
    MbPageHeader,
    MbTab,
    MbTabs,
    NgTemplateOutlet,
    RouterLink,
    TranslocoPipe,
  ],
  templateUrl: './explore-tags.html',
  styleUrl: './explore-tags.css',
})
export class ExploreTags implements OnInit {
  private api = inject(Api);
  protected auth = inject(Auth);
  private anonymousTags = inject(AnonymousTags);
  private samples = inject(HashtagSamples);
  private lists = viewChild(Lists);

  /** Bluesky and Misskey cannot follow hashtags into Home; they get one plain line. */
  protected readonly noTags = computed<'bluesky' | 'misskey' | null>(() => {
    if (this.auth.isAnonymous) return null;
    const kind = this.auth.kind();
    return kind === 'bluesky' || kind === 'misskey' ? kind : null;
  });

  private mastodon(): boolean {
    return this.auth.kind() === 'mastodon' && !this.auth.lacksMastodonToken;
  }

  /** Lowercased names followed, from the server or the browser's list. */
  private followed = signal<ReadonlySet<string>>(new Set());
  /** Followed on this page, so the row turns into "Following" in place. */
  protected followedHere = signal<ReadonlySet<string>>(new Set());
  protected busy = signal<ReadonlySet<string>>(new Set());
  protected error = signal<string | null>(null);

  protected readonly groups = signal<Record<SuggestionGroup, GroupState>>({
    yours: { status: 'ready', tags: [] },
    similar: { status: 'ready', tags: [] },
    trending: { status: 'loading', tags: [] },
  });

  protected readonly order: readonly SuggestionGroup[] = ['yours', 'similar', 'trending'];
  protected readonly groupLabel: Record<string, string> = {
    yours: 'exploreTags.group.yours',
    similar: 'exploreTags.group.similar',
    trending: 'exploreTags.group.trending',
  };

  /** The groups after de-duplication; what the template renders. */
  protected readonly shown = computed(() => {
    const groups = this.groups();
    const deduped = dedupeGroups(
      {
        yours: groups.yours.tags,
        similar: groups.similar.tags,
        trending: groups.trending.tags,
      },
      // Followed here stays shown (as "Following"), so it is not hidden again.
      new Set([...this.followed()].filter((name) => !this.followedHere().has(name))),
    );
    return this.order.map((id) => ({ id, status: groups[id].status, tags: deduped[id] }));
  });

  /** One suggestion group, after de-duplication, for the tab that shows it. */
  protected group(id: SuggestionGroup) {
    return this.shown().find((group) => group.id === id)!;
  }

  /**
   * Yours | Similar | Featured | More (owner, 2026-11-26): followed hashtags
   * with the ones you post with; tags like those; the server's trending ones;
   * then tags.pub, bundles, your profile's featured hashtags and bulk import.
   */
  protected readonly tab = signal<TagsTab>(lastTab);

  protected select(value: string): void {
    lastTab = value as TagsTab;
    this.tab.set(lastTab);
  }

  ngOnInit(): void {
    if (this.noTags()) return;
    this.load('trending', this.api.trendingTags().pipe(map(toSuggestions)));
    if (this.auth.isAnonymous) {
      const names = this.anonymousTags.tags();
      this.followed.set(new Set(names.map((n) => n.toLowerCase())));
      this.loadSimilar(names);
      return;
    }
    if (!this.mastodon()) return;
    this.load('yours', this.api.featuredTagSuggestions().pipe(map(toSuggestions)));
    this.api.followedTags().subscribe({
      next: (tags) => {
        this.followed.set(new Set(tags.map((t) => t.name.toLowerCase())));
        this.loadSimilar(tags.map((t) => t.name));
      },
      // Without the list there are no seeds; suggestions may then repeat a followed tag.
      error: () => undefined,
    });
  }

  private loadSimilar(seeds: string[]): void {
    if (!seeds.length) return;
    const picked = seeds.slice(0, MAX_SIMILAR_SEEDS);
    this.load(
      'similar',
      this.samples
        .page(picked)
        .pipe(
          map((posts) => rankSimilar(posts, picked).map((t) => ({ name: t.name, people: null }))),
        ),
    );
  }

  private load(group: SuggestionGroup, source: Observable<TagSuggestion[]>): void {
    this.setGroup(group, { status: 'loading', tags: [] });
    source.subscribe({
      next: (tags) => this.setGroup(group, { status: 'ready', tags }),
      error: () => this.setGroup(group, { status: 'failed', tags: [] }),
    });
  }

  private setGroup(group: SuggestionGroup, state: GroupState): void {
    this.groups.update((groups) => ({ ...groups, [group]: state }));
  }

  protected isFollowing(name: string): boolean {
    return this.followedHere().has(name.toLowerCase());
  }

  /** Follow one hashtag: the browser's list for Anonymous, the server otherwise. */
  protected follow(name: string): void {
    const key = name.toLowerCase();
    if (this.busy().has(key) || this.isFollowing(name)) return;
    this.error.set(null);
    if (this.auth.isAnonymous) {
      const result = this.anonymousTags.follow(name);
      if (!result.ok) {
        this.error.set(result.error ?? null);
        return;
      }
      this.markFollowed(key);
      return;
    }
    this.busy.update((set) => new Set([...set, key]));
    this.api.followTag(name).subscribe({
      next: () => {
        this.markFollowed(key);
        this.done(key);
      },
      error: () => {
        this.error.set(`followFailed:${name}`);
        this.done(key);
      },
    });
  }

  private markFollowed(key: string): void {
    this.followedHere.update((set) => new Set([...set, key]));
    this.followed.update((set) => new Set([...set, key]));
    this.lists()?.refreshTags();
  }

  private done(key: string): void {
    this.busy.update((set) => new Set([...set].filter((k) => k !== key)));
  }

  /** A failed server follow names its tag; Anonymous's limit message is already a sentence. */
  protected failedTag(): string | null {
    const error = this.error();
    return error?.startsWith('followFailed:') ? error.slice('followFailed:'.length) : null;
  }
}

function toSuggestions(tags: Tag[]): TagSuggestion[] {
  return tags.map((tag) => ({ name: tag.name, people: peopleThisWeek(tag) }));
}
