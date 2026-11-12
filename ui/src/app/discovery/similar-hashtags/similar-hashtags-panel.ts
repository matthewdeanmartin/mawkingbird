import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { catchError, firstValueFrom, of } from 'rxjs';
import { Api } from '../../platform/api/api';
import { Auth } from '../../platform/session/auth';
import { TagState } from '../tag-actions/tag-state';
import { Status } from '../../platform/api/models';
import { MbButton } from '../../design-system/button/button';
import { MbControl, MbField } from '../../design-system/field/field';
import { TagActions } from '../tag-actions/tag-actions';
import {
  HashtagSamples,
  MAX_SIMILAR_SEEDS,
  SAMPLE_MAX,
  SAMPLE_PAGE,
  SAMPLE_STEP,
  parseHashtags,
  rankSimilar,
  sampledPosts,
} from './similar-hashtags';

// i18n similarTags.title: Similar hashtags
// i18n similarTags.to: Similar to
// i18n similarTags.remove: Remove #{{tag}}
// i18n similarTags.addLabel: Add a hashtag
// i18n similarTags.addButton: Add
// i18n similarTags.reading: Reading recent posts… {{count}} so far
// i18n similarTags.sampled: {{count}} recent posts from {{server}}, since {{since}}. Ranked by how many of them each hashtag appears on.
// i18n similarTags.none: No recent posts on {{server}} carry these hashtags.
// i18n similarTags.noOthers: Those posts carry no other hashtags.
// i18n similarTags.failed: Couldn't read recent posts from {{server}}.
// i18n similarTags.retry: Try again
// i18n similarTags.more: Sample {{count}} more posts
// i18n similarTags.posts.one: {{count}} post
// i18n similarTags.posts.other: {{count}} posts
// i18n similarTags.close: Back to hashtag results

/** Rows shown; the long tail is mostly one-off tags. */
const SHOWN = 50;

/** Followed tags are read in pages of 200; five covers all but extreme accounts. */
const FOLLOWED_TAG_PAGES = 5;

/**
 * Similar hashtags for a set of seed hashtags: samples recent posts carrying
 * any of them and lists the other hashtags those posts carry, most shared first.
 *
 * The seeds belong to the host (the search URL, the tool page's URL); this panel
 * asks for changes through `tagsChange` and re-samples when they arrive.
 */
@Component({
  selector: 'app-similar-hashtags-panel',
  imports: [RouterLink, FormsModule, TranslocoPipe, MbButton, MbControl, MbField, TagActions],
  templateUrl: './similar-hashtags-panel.html',
  styleUrl: './similar-hashtags-panel.css',
})
export class SimilarHashtagsPanel {
  readonly tags = input.required<string[]>();
  /** Show a way back to whatever the panel replaced (Search's own results). */
  readonly closable = input(false);
  readonly tagsChange = output<string[]>();
  readonly closed = output<void>();

  private samples = inject(HashtagSamples);
  private api = inject(Api);
  private auth = inject(Auth);
  private tagState = inject(TagState);
  protected readonly maxSeeds = MAX_SIMILAR_SEEDS;
  protected readonly step = SAMPLE_STEP;

  protected statuses = signal<Status[]>([]);
  protected reading = signal(false);
  protected failed = signal(false);
  protected exhausted = signal(false);
  protected draft = signal('');
  protected server = signal('');

  protected posts = computed(() => sampledPosts(this.statuses()));
  protected ranked = computed(() => rankSimilar(this.statuses(), this.tags()).slice(0, SHOWN));
  protected since = computed(() => {
    const oldest = this.statuses().at(-1)?.created_at;
    return oldest ? new Date(oldest).toLocaleDateString() : '';
  });
  protected canSampleMore = computed(
    () => !this.reading() && !this.exhausted() && this.statuses().length < SAMPLE_MAX,
  );

  /** Bumped per run so a superseded sample stops writing. */
  private run = 0;

  constructor() {
    effect(() => {
      const tags = this.tags();
      untracked(() => {
        this.statuses.set([]);
        this.exhausted.set(false);
        if (tags.length) void this.sample();
      });
    });
    inject(DestroyRef).onDestroy(() => this.run++);
    void this.loadFollowedTags();
  }

  /**
   * Seed the shared follow state with the tags you follow, so each row's Follow
   * button says "Following" where it should. Regular search gets this for free
   * (Mastodon's search results carry `following`); sampled posts do not, which
   * left this list right only for tags that had passed through search or been
   * toggled here. Anonymous reads its own browser store and needs nothing.
   */
  private async loadFollowedTags(): Promise<void> {
    if (this.auth.isAnonymous || this.auth.lacksMastodonToken) return;
    let maxId: string | undefined;
    for (let page = 0; page < FOLLOWED_TAG_PAGES; page++) {
      const result = await firstValueFrom(
        this.api.followedTagsPage(maxId, 200, true).pipe(catchError(() => of(null))),
      );
      if (!result) return;
      for (const tag of result.tags) this.tagState.remember({ ...tag, following: true });
      if (!result.nextMaxId) return;
      maxId = result.nextMaxId;
    }
  }

  /** Read up to {@link SAMPLE_STEP} more posts. */
  async sample(): Promise<void> {
    const tags = this.tags();
    if (!tags.length) return;
    const run = ++this.run;
    this.reading.set(true);
    this.failed.set(false);
    this.server.set(this.samples.host());
    const target = Math.min(this.statuses().length + SAMPLE_STEP, SAMPLE_MAX);
    try {
      while (this.statuses().length < target) {
        const batch = await firstValueFrom(this.samples.page(tags, this.statuses().at(-1)));
        if (run !== this.run) return;
        this.statuses.update((list) => [...list, ...batch]);
        if (batch.length < SAMPLE_PAGE) {
          this.exhausted.set(true);
          break;
        }
      }
    } catch {
      if (run === this.run) this.failed.set(true);
    } finally {
      if (run === this.run) this.reading.set(false);
    }
  }

  protected addFromBox(event: Event): void {
    event.preventDefault();
    this.addTags(parseHashtags(this.draft()));
    this.draft.set('');
  }

  protected addTags(more: string[]): void {
    const next = parseHashtags([...this.tags(), ...more].join(' '));
    if (next.length !== this.tags().length) this.tagsChange.emit(next);
  }

  protected remove(tag: string): void {
    this.tagsChange.emit(this.tags().filter((t) => t !== tag));
  }
}
