import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { MbButton } from '../../design-system/button/button';
import { MbContentLink } from '../../design-system/metadata/metadata';
import { Status } from '../../models';
import {
  AnonymousFollowFeedSession,
  AnonymousMastodonProvider,
} from '../../providers/anonymous/anonymous-mastodon-provider';
import { StatusCard } from '../../status-card/status-card';
import { LanguageVersions } from '../focused-apps/language-versions';
import { previewFollow } from './feed-builder-people';
import { FEED_BUILDER_HUB, FEED_BUILDER_PREVIEW } from './feed-builder-registry';
import { FeedPage } from './feed-builder-routes';
import { FeedSelection } from './feed-selection';

/**
 * A topic page's Preview tab: the feed the page builds, read the way anonymous
 * Home reads its follows (public timelines through the anonymous reading
 * server), from the hashtags and people ticked in the Builder. Never the
 * reader's own Home, signed in or not, and nothing is followed or stored.
 */
@Component({
  selector: 'app-feed-preview',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, StatusCard],
  templateUrl: './feed-preview.html',
  styleUrls: ['../features/features.css', './feed-builder.css'],
})
export class FeedPreview implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly provider = inject(AnonymousMastodonProvider);
  private readonly selection = inject(FeedSelection);

  protected readonly page = this.route.snapshot.data['page'] as FeedPage;
  protected readonly inShell = this.route.snapshot.data['inShell'] === true;
  protected readonly chrome = this.page.chrome;
  protected readonly controls = this.page.controls;
  protected readonly copy = this.page.copy;
  protected readonly lang = this.page.lang;
  protected readonly hub = `/${FEED_BUILDER_HUB}`;
  protected readonly root = `/${this.page.path}`;
  protected readonly previewLink = `/${this.page.path}/${FEED_BUILDER_PREVIEW}`;
  protected readonly returnHere = { next: this.root };

  private readonly key = `${this.page.topic}.${this.page.lang}`;
  protected readonly tags = this.selection.selectedTags(
    this.key,
    this.page.data.tags.map((tag) => tag.name),
  );
  protected readonly people = this.page.data.people.filter((person) =>
    this.selection.personOn(this.key, person.acct),
  );

  protected readonly statuses = signal<Status[]>([]);
  protected readonly loading = signal(false);
  protected readonly hasMore = signal(true);
  protected readonly empty = computed(
    () => !this.loading() && !this.statuses().length && !this.hasMore(),
  );
  private session: AnonymousFollowFeedSession | null = null;

  ngOnInit(): void {
    if (!this.tags.length && !this.people.length) {
      this.hasMore.set(false);
      return;
    }
    this.session = this.provider.createFollowFeed(
      this.people.map(previewFollow),
      () => true,
      this.tags,
    );
    void this.loadMore();
  }

  async loadMore(): Promise<void> {
    if (!this.session || this.loading()) return;
    this.loading.set(true);
    try {
      const page = await firstValueFrom(this.session.fetchPage());
      this.statuses.update((shown) => [...shown, ...page.statuses]);
      this.hasMore.set(page.hasMore);
    } catch {
      this.hasMore.set(false);
    } finally {
      this.loading.set(false);
    }
  }
}
