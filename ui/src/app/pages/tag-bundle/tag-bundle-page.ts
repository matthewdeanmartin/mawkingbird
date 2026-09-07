import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { authorsOf } from '../../lists/list-source';
import { ListFeedResolver } from '../../lists/list-feed-resolver';
import { MAX_BUNDLE_TAGS, TagBundle, TagBundles } from '../../lists/tag-bundles';
import { Account, Status } from '../../models';
import { PageDiagnostics } from '../../page-diagnostics';
import { StatusCard } from '../../status-card/status-card';

/**
 * One tag bundle: the merged feed of its tags, and the people posting in it.
 *
 * Members are **synthetic** — the distinct authors of the loaded posts, exactly as
 * `sprint/lists-0-overview.md` decision 2 specifies for every source that has no real
 * membership. That makes a bundle a way to *find* people through a topic, which is
 * closer to why anyone reads hashtags than a bare post list would be.
 *
 * Editing lives here rather than in a dialog because a bundle is defined by its tags:
 * you tune it while reading it, notice a tag is noisy, and drop it on the spot.
 */
/** English source strings; see scripts/extract-i18n.mjs. */
// i18n tagBundle.notFound: That bundle isn't in this browser.
// i18n tagBundle.backToFeeds: Back to feeds
// i18n tagBundle.headerPrefix: Tag bundle · kept in this browser ·
// i18n tagBundle.tagCount: {{count}} of {{max}} tags
// i18n tagBundle.removeTag: Remove #{{tag}}
// i18n tagBundle.noTagsYet: No tags yet — add one below to build the feed.
// i18n tagBundle.addPlaceholder: Add a hashtag…
// i18n tagBundle.add: Add
// i18n tagBundle.fullAt: Full at {{max}} tags. Each tag is one request every time this feed opens, so the cap keeps a bundle from hammering the server.
// i18n tagBundle.tabPosts: Posts
// i18n tagBundle.tabPeople: People
// i18n tagBundle.loading: Loading…
// i18n tagBundle.addATag: Add a tag to see posts.
// i18n tagBundle.noRecentPosts: No recent posts in these tags.
// i18n tagBundle.membersNote: Everyone who wrote a post in this feed. A bundle has no real membership, so this is whoever is posting in these tags right now.
// i18n tagBundle.nobodyYet: Nobody yet.
// i18n tagBundle.bundleFullError: A bundle holds at most {{max}} tags — each one is a request every time the feed opens. Remove one first.
// i18n tagBundle.tagAlreadyIn: That tag is already in this bundle.
@Component({
  selector: 'app-tag-bundle-page',
  imports: [RouterLink, FormsModule, StatusCard, TranslocoPipe],
  templateUrl: './tag-bundle-page.html',
  styleUrl: './tag-bundle-page.css',
})
export class TagBundlePage implements OnInit {
  private route = inject(ActivatedRoute);
  private resolver = inject(ListFeedResolver);
  private diagnostics = inject(PageDiagnostics);
  private transloco = inject(TranslocoService);
  protected store = inject(TagBundles);

  protected bundle = signal<TagBundle | null>(null);
  protected statuses = signal<Status[]>([]);
  protected members = signal<Account[]>([]);
  protected loading = signal(true);
  protected tab = signal<'posts' | 'members'>('posts');

  /** The "add a tag" box, and why the last add was refused. */
  protected newTag = signal('');
  protected addError = signal('');

  protected readonly maxTags = MAX_BUNDLE_TAGS;

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const id = params.get('id');
      if (id) {
        this.load(id);
      }
    });
  }

  private load(id: string): void {
    this.loading.set(true);
    this.tab.set('posts');
    this.statuses.set([]);
    this.members.set([]);

    const bundle = this.store.get(id);
    this.bundle.set(bundle);
    if (!bundle || !bundle.tags.length) {
      this.loading.set(false);
      return;
    }

    this.resolver.mergeTagTimelines(bundle.tags).subscribe({
      next: (merged) => {
        this.statuses.set(merged.statuses);
        // Synthetic members: whoever wrote the posts we actually loaded. They grow as
        // the feed does, which is honest about what we know.
        this.members.set(authorsOf(merged.statuses));
        this.loading.set(false);
        this.diagnostics.info('TagBundlePage', 'feed:loaded', {
          tags: bundle.tags.length,
          posts: merged.statuses.length,
          authors: this.members().length,
        });
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.diagnostics.error('TagBundlePage', 'feed:error', error);
      },
    });
  }

  /** Add the typed tag, refresh the feed, and explain any refusal. */
  addTag(): void {
    const bundle = this.bundle();
    const raw = this.newTag();
    if (!bundle || !raw.trim()) {
      return;
    }
    this.addError.set('');
    if (this.store.isFull(bundle.id)) {
      this.addError.set(
        this.transloco.translate<string>('tagBundle.bundleFullError', { max: MAX_BUNDLE_TAGS }),
      );
      return;
    }
    if (!this.store.addTag(bundle.id, raw)) {
      this.addError.set(this.transloco.translate<string>('tagBundle.tagAlreadyIn'));
      return;
    }
    this.newTag.set('');
    this.load(bundle.id);
  }

  removeTag(tag: string): void {
    const bundle = this.bundle();
    if (!bundle) {
      return;
    }
    this.addError.set('');
    this.store.removeTag(bundle.id, tag);
    this.load(bundle.id);
  }
}
