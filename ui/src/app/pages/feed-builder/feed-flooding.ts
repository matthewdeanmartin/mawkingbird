import { HttpClient } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MbButton } from '../../design-system/button/button';
import { MbContentLink } from '../../design-system/metadata/metadata';
import { LocalModeration } from '../../local-moderation';
import { qualifiedHandle } from '../../account-handle';
import { accountRoutePath } from '../../account-route';
import { Account } from '../../models';
import { AnonymousAccount } from '../../providers/anonymous/anonymous-account';
import { LanguageVersions } from '../focused-apps/language-versions';
import {
  FEED_BUILDER_FLOODING,
  feedBuilderHubFor,
  FEED_BUILDER_PREVIEW,
} from './feed-builder-registry';
import { FeedPage } from './feed-builder-routes';
import { Flooder, TagReading, checkTags, flooders } from './feed-flooding-check';
import { FeedProgress } from './feed-progress';
import { readTag } from './feed-reader';
import { SampleProgress } from './feed-sample';
import { FeedSelection } from './feed-selection';
import { AppOnlyLinkRel } from '../../public-page-urls';

/** The temporary mute: Feed Doctor's, for a flood that will pass. */
export const TEMPORARY_MUTE_SECONDS = 8 * 60 * 60;

/**
 * A topic page's Flooding tab: a very small analytics tool. It reads the
 * newest posts of the ticked hashtags (a fixed budget, `FLOOD_CHECK`) and
 * shows any account taking up a quarter or more of one, by Feed Doctor's
 * rule, with two choices on the spot: mute for 8 hours, or for good. Mutes
 * are Mawkingbird's own (`LocalModeration`), so they work signed in or
 * anonymous. Nothing about flooders is stored or published by the page.
 */
@Component({
  selector: 'app-feed-flooding',
  imports: [RouterLink, AppOnlyLinkRel, MbButton, MbContentLink, LanguageVersions, FeedProgress],
  templateUrl: './feed-flooding.html',
  styleUrls: ['../features/features.css', '../features/follow.css', './feed-builder.css'],
})
export class FeedFlooding implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly http = inject(HttpClient);
  private readonly anonymous = inject(AnonymousAccount);
  private readonly selection = inject(FeedSelection);
  protected readonly moderation = inject(LocalModeration);

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

  private readonly tags = this.selection.selectedTags(
    `${this.page.topic}.${this.page.lang}`,
    this.page.data.tags.map((tag) => tag.name),
  );
  protected readonly nothingSelected = !this.tags.length;

  protected readonly readings = signal<TagReading[]>([]);
  protected readonly flooders = signal<Flooder[]>([]);
  protected readonly loading = signal(false);
  protected readonly progress = signal<SampleProgress | null>(null);
  /** How each account was muted from this page, for the label and Undo. */
  protected readonly muted = signal<Record<string, 'temporary' | 'permanent'>>({});
  private run = 0;

  ngOnInit(): void {
    if (!this.nothingSelected) void this.check();
  }

  async check(): Promise<void> {
    const run = ++this.run;
    this.loading.set(true);
    this.progress.set({ done: 0, planned: 0 });
    try {
      const readings = await checkTags({
        tags: this.tags,
        read: (tag, limit) => readTag(this.http, this.anonymous.server(), tag, limit),
        onProgress: (done, planned) => {
          if (run === this.run) this.progress.set({ done, planned });
        },
      });
      if (run !== this.run) return;
      this.readings.set(readings);
      this.flooders.set(flooders(readings));
    } finally {
      if (run === this.run) {
        this.loading.set(false);
        this.progress.set(null);
      }
    }
  }

  /**
   * The flooder's profile in Mawkingbird, by handle only: the id came from the
   * server the hashtag was read on and may mean someone else on the reader's.
   */
  protected profile(account: Account): (string | number)[] {
    return accountRoutePath({ handle: qualifiedHandle(account) ?? account.acct });
  }

  protected pct(share: number): number {
    return Math.round(share * 100);
  }

  protected mutedAs(account: Account): 'temporary' | 'permanent' | null {
    const how = this.muted()[account.acct.toLowerCase()];
    return how && this.moderation.isMuted(account) ? how : null;
  }

  protected mute(account: Account, how: 'temporary' | 'permanent'): void {
    this.moderation.mute(account, how === 'temporary' ? TEMPORARY_MUTE_SECONDS : null);
    this.muted.update((all) => ({ ...all, [account.acct.toLowerCase()]: how }));
  }

  protected undo(account: Account): void {
    this.moderation.clear(account);
    this.muted.update((all) => {
      const next = { ...all };
      delete next[account.acct.toLowerCase()];
      return next;
    });
  }
}
