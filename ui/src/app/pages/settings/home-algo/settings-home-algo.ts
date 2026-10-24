import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbButton } from '../../../design-system/button/button';
import { MbCheckbox } from '../../../design-system/checkbox/checkbox';
import { MbSettingsRow } from '../../../design-system/settings-row/settings-row';
import { MbField, MbControl } from '../../../design-system/field/field';
import {
  HomeAlgoSettings,
  ALGO_FACTORY,
  ALGO_RANGES,
  AlgoOptions,
  FavoriteFeed,
} from '../../../home-algo-settings';
import { HomeDefaults, HomeDefault } from '../../../home-defaults';
import { HomeFeedCatalog } from '../../../home-feed-catalog';
import { FEED_SECTIONS } from '../../../lists/feed-sections';

// i18n settings.homeAlgo.title: Home and Algo
// i18n settings.homeAlgo.intro: Choose what fills Home, how each session starts, and how Algo finds and ranks posts. Changes apply when you save.
// i18n settings.homeAlgo.home: Home
// i18n settings.homeAlgo.mode: Home feed
// i18n settings.homeAlgo.friends: Friend focused
// i18n settings.homeAlgo.interests: Special interest focused
// i18n settings.homeAlgo.favorite: Favorite feed
// i18n settings.homeAlgo.modeHint: Friend focused keeps your usual Home. Special interest keeps posts matching followed topics, including plain words, plus followed hashtags. Favorite uses only the feed you choose.
// i18n settings.homeAlgo.type: Feed type
// i18n settings.homeAlgo.feed: Feed
// i18n settings.homeAlgo.choose: Choose a feed…
// i18n settings.homeAlgo.empty: No feeds of this type are available. Add one from Feeds or choose another type.
// i18n settings.homeAlgo.loadError: Could not load these feeds. Retry or choose another type.
// i18n settings.homeAlgo.session: Session defaults
// i18n settings.homeAlgo.sessionHint: Used when the app starts or you log in. Home toolbar changes last for the current session; they do not change these defaults.
// i18n settings.homeAlgo.presentation: Home presentation
// i18n settings.homeAlgo.presentationHint: The same saved default as Home’s toolbar. My tags requires an explicit hashtag, even in Special interest mode.
// i18n settings.homeAlgo.sources: Sources
// i18n settings.homeAlgo.rules: Rules
// i18n settings.homeAlgo.algo: Algo
// i18n settings.homeAlgo.algoHint: Changes take effect the next time you refresh Algo. Zero recency half-life disables age weighting. Collection limits bound how much work a refresh can do.
// i18n settings.homeAlgo.reset: Reset Algo to factory defaults
// i18n settings.homeAlgo.saveError: Could not save all settings. Your changes are still shown; please try again.
// i18n settings.homeAlgo.favoriteRequired: Choose a favorite feed before saving.
@Component({
  selector: 'app-settings-home-algo',
  imports: [FormsModule, TranslocoPipe, MbButton, MbCheckbox, MbSettingsRow, MbField, MbControl],
  templateUrl: './settings-home-algo.html',
})
export class SettingsHomeAlgo implements OnInit {
  ngOnInit(): void {
    if (this.draft.mode === 'favorite') void this.loadChoices();
  }
  protected settings = inject(HomeAlgoSettings);
  protected defaults = inject(HomeDefaults);
  private catalog = inject(HomeFeedCatalog);
  protected draft = structuredClone(this.settings.value());
  protected presentation: HomeDefault = this.defaults.value() ?? 'all';
  protected types = FEED_SECTIONS.filter((s) => s.id !== 'all');
  protected type: FavoriteFeed['type'] = this.draft.favorite?.type ?? 'tags';
  protected choices = signal<FavoriteFeed[]>(this.draft.favorite ? [this.draft.favorite] : []);
  protected loading = signal(false);
  protected loadError = signal(false);
  protected saved = signal(false);
  protected error = signal('');
  protected views: HomeDefault[] = ['all', 'text', 'media', 'video', 'articles', 'tags'];
  protected sourceRules = ['mutual', 'boost', 'original', 'hashtag', 'rss'];
  protected rules = ['requireLikes', 'excludeOwn', 'excludeReplies'];
  protected numbers = Object.entries(ALGO_RANGES).map(([key, range]) => ({
    key,
    min: range[0],
    max: range[1],
    step: range[2],
  }));
  private generation = 0;
  protected changed(): void {
    this.saved.set(false);
    this.error.set('');
  }
  protected bool(key: string): boolean {
    return this.draft.algo[key as keyof AlgoOptions] === true;
  }
  protected number(key: string): number {
    return Number(this.draft.algo[key as keyof AlgoOptions]);
  }
  protected setAlgo(key: string, value: number | boolean): void {
    Object.assign(this.draft.algo, { [key]: value });
    this.changed();
  }
  protected async loadChoices(): Promise<void> {
    const generation = ++this.generation;
    this.loading.set(true);
    this.loadError.set(false);
    this.changed();
    this.choices.set([]);
    try {
      const choices = await this.catalog.choices(this.type);
      if (generation === this.generation) this.choices.set(choices);
    } catch {
      if (generation === this.generation) this.loadError.set(true);
    } finally {
      if (generation === this.generation) this.loading.set(false);
    }
  }
  protected choose(id: string): void {
    this.draft.favorite = this.choices().find((c) => c.id === id) ?? null;
    this.changed();
  }
  protected reset(): void {
    this.draft.algo = { ...ALGO_FACTORY };
    this.changed();
  }
  protected save(): void {
    this.saved.set(false);
    if (this.draft.mode === 'favorite' && !this.draft.favorite) {
      this.error.set('settings.homeAlgo.favoriteRequired');
      return;
    }
    if (!this.settings.save(this.draft)) {
      this.error.set('settings.homeAlgo.saveError');
      return;
    }
    if (this.defaults.set(this.presentation) === false) {
      this.error.set('settings.homeAlgo.saveError');
      return;
    }
    this.saved.set(true);
    this.error.set('');
  }
}

// i18n settings.homeAlgo.algo.mutual: Include mutuals
// i18n settings.homeAlgo.algo.boost: Include retweets
// i18n settings.homeAlgo.algo.original: Include original posts
// i18n settings.homeAlgo.algo.hashtag: Include followed hashtags
// i18n settings.homeAlgo.algo.rss: Include RSS (anonymous feed)
// i18n settings.homeAlgo.algo.requireLikes: Require at least one like (signed-in Algo)
// i18n settings.homeAlgo.algo.excludeOwn: Exclude my own posts (signed-in Algo)
// i18n settings.homeAlgo.algo.excludeReplies: Exclude replies (signed-in Algo)
// i18n settings.homeAlgo.algo.maxCalls: Maximum API calls per refresh
// i18n settings.homeAlgo.algo.targetPosts: Maximum ranked posts
// i18n settings.homeAlgo.algo.homePages: Home pages to collect
// i18n settings.homeAlgo.algo.mutualSample: Mutual accounts to sample
// i18n settings.homeAlgo.algo.hashtagPages: Pages per hashtag
// i18n settings.homeAlgo.algo.mutualStatusLimit: Posts per mutual account
// i18n settings.homeAlgo.algo.hashtagReserve: Calls reserved for hashtags
// i18n settings.homeAlgo.algo.hashtagCount: Hashtags to sample
// i18n settings.homeAlgo.algo.likeWeight: Likes exponent
// i18n settings.homeAlgo.algo.boostWeight: Retweets exponent
// i18n settings.homeAlgo.algo.replyWeight: Replies exponent
// i18n settings.homeAlgo.algo.recencyHalfLife: Recency half-life (hours; 0 disables)
// i18n settings.homeAlgo.algo.mutualWeight: Mutuals source weight
// i18n settings.homeAlgo.algo.originalWeight: Originals source weight
// i18n settings.homeAlgo.algo.boostSourceWeight: Retweets source weight
// i18n settings.homeAlgo.algo.hashtagWeight: Hashtags source weight
// i18n settings.homeAlgo.algo.rssWeight: RSS source weight
