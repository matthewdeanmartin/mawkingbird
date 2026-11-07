import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MbButton } from '../../design-system/button/button';
import { MbContentLink } from '../../design-system/metadata/metadata';
import { languageFolder, PageLanguage } from '../../focused-tools';
import { HubCopy } from './copy/hub-copy';
import { FEED_BUILDER_HUB, FEED_BUILDER_TOPICS } from './feed-builder-registry';
import { FeedHubEntry } from './feed-builder-routes';
import { AppOnlyLinkRel } from '../../public-page-urls';

/**
 * A communities hub. `/communities/` lists every topic page, grouped by topic,
 * each version in its own language; a language's hub (`/de/mastodon-communities/`,
 * …) lists that language's pages and points to the English hub for the rest.
 */
@Component({
  selector: 'app-feed-builder-hub',
  imports: [RouterLink, AppOnlyLinkRel, MbButton, MbContentLink],
  templateUrl: './feed-builder-hub.html',
  styleUrls: ['../features/features.css', '../features/follow.css', './feed-builder.css'],
})
export class FeedBuilderHub {
  private readonly route = inject(ActivatedRoute).snapshot;
  private readonly entries = this.route.data['entries'] as FeedHubEntry[];
  protected readonly lang: PageLanguage = this.route.data['lang'] ?? 'en';
  protected readonly copy = this.route.data['copy'] as HubCopy;
  protected readonly english = this.lang === 'en';
  protected readonly englishHub = `/${FEED_BUILDER_HUB}`;
  /** This language's tool index: /tools for English, the language folder otherwise. */
  protected readonly toolsIndex = this.english ? '/tools' : `/${languageFolder(this.lang)}`;
  protected readonly topics = FEED_BUILDER_TOPICS.map((topic) => {
    const versions = this.entries.filter((entry) => entry.topic === topic);
    return {
      topic,
      english: versions.find((entry) => entry.lang === 'en') ?? versions[0],
      others: versions.filter((entry) => entry.lang !== 'en'),
    };
  }).filter((item) => item.english);
  /** A language hub's pages: one per topic, in this language only. */
  protected readonly ownPages = this.entries.filter((entry) => entry.lang === this.lang);
}
