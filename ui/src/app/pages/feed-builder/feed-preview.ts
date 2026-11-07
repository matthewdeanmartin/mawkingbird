import { HttpClient } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MbButton } from '../../design-system/button/button';
import { MbContentLink } from '../../design-system/metadata/metadata';
import { Status } from '../../models';
import { AnonymousAccount } from '../../providers/anonymous/anonymous-account';
import { StatusCard } from '../../status-card/status-card';
import { LanguageVersions } from '../focused-apps/language-versions';
import {
  FEED_BUILDER_FLOODING,
  feedBuilderHubFor,
  FEED_BUILDER_PREVIEW,
} from './feed-builder-registry';
import { FeedPage } from './feed-builder-routes';
import { FeedProgress } from './feed-progress';
import { readPerson, readTag } from './feed-reader';
import { SAMPLE, SampleProgress, samplePreview } from './feed-sample';
import { FeedSelection } from './feed-selection';
import { AppOnlyLinkRel } from '../../public-page-urls';

/**
 * A topic page's Preview tab: a random sample of the feed the page builds,
 * read the way anonymous Home reads (public timelines, no account), from the
 * hashtags and people ticked in the Builder. Never the reader's own Home,
 * signed in or not, and nothing is followed or stored.
 *
 * One preview is a fixed, small number of requests (`SAMPLE` in
 * feed-sample.ts): a few hashtags from the anonymous reading server and a few
 * people from their own servers, by the home-server id the page carries, so
 * each source is exactly one request. Shuffle draws a different sample.
 */
@Component({
  selector: 'app-feed-preview',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    StatusCard,
    FeedProgress,
  ],
  templateUrl: './feed-preview.html',
  styleUrls: ['../features/features.css', './feed-builder.css'],
})
export class FeedPreview implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly http = inject(HttpClient);
  private readonly anonymous = inject(AnonymousAccount);
  private readonly selection = inject(FeedSelection);

  protected readonly page = this.route.snapshot.data['page'] as FeedPage;
  protected readonly inShell = this.route.snapshot.data['inShell'] === true;
  protected readonly chrome = this.page.chrome;
  protected readonly controls = this.page.controls;
  protected readonly copy = this.page.copy;
  protected readonly lang = this.page.lang;
  /** The communities hub in this page's language (English when it has none). */
  protected readonly hub = `/${feedBuilderHubFor(this.page.lang).path}`;
  protected readonly root = `/${this.page.path}`;
  protected readonly previewLink = `/${this.page.path}/${FEED_BUILDER_PREVIEW}`;
  protected readonly floodingLink = `/${this.page.path}/${FEED_BUILDER_FLOODING}`;
  protected readonly returnHere = { next: this.root };

  private readonly key = `${this.page.topic}.${this.page.lang}`;
  private readonly tags = this.selection.selectedTags(
    this.key,
    this.page.data.tags.map((tag) => tag.name),
  );
  private readonly people = this.page.data.people.filter((person) =>
    this.selection.personOn(this.key, person.acct),
  );
  protected readonly nothingSelected = !this.tags.length && !this.people.length;
  protected readonly sample = SAMPLE;

  protected readonly statuses = signal<Status[]>([]);
  protected readonly loading = signal(false);
  protected readonly progress = signal<SampleProgress | null>(null);
  /** Bumped by Shuffle, so a slow old sample cannot overwrite a newer one. */
  private run = 0;

  ngOnInit(): void {
    if (!this.nothingSelected) void this.shuffle();
  }

  async shuffle(): Promise<void> {
    const run = ++this.run;
    this.loading.set(true);
    this.statuses.set([]);
    this.progress.set({ done: 0, planned: 0 });
    try {
      const posts = await samplePreview({
        tags: this.tags,
        people: this.people,
        tagSampler: {
          fetch: (tag, limit) => readTag(this.http, this.anonymous.server(), tag, limit),
        },
        personSampler: { fetch: (person, limit) => readPerson(this.http, person, limit) },
        onProgress: (progress) => {
          if (run === this.run) this.progress.set({ ...progress });
        },
      });
      if (run === this.run) this.statuses.set(posts);
    } finally {
      if (run === this.run) {
        this.loading.set(false);
        this.progress.set(null);
      }
    }
  }
}
