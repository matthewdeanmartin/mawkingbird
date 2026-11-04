import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MbButton } from '../../design-system/button/button';
import { MbContentLink } from '../../design-system/metadata/metadata';
import { FEED_BUILDER_TOPICS } from './feed-builder-registry';
import { FeedHubEntry } from './feed-builder-routes';

/** `/communities/`: every topic page, grouped by topic, each in its own language. */
@Component({
  selector: 'app-feed-builder-hub',
  imports: [RouterLink, MbButton, MbContentLink],
  templateUrl: './feed-builder-hub.html',
  styleUrls: ['../features/features.css', '../features/follow.css', './feed-builder.css'],
})
export class FeedBuilderHub {
  private readonly entries = inject(ActivatedRoute).snapshot.data['entries'] as FeedHubEntry[];
  protected readonly topics = FEED_BUILDER_TOPICS.map((topic) => {
    const versions = this.entries.filter((entry) => entry.topic === topic);
    return {
      topic,
      english: versions.find((entry) => entry.lang === 'en') ?? versions[0],
      others: versions.filter((entry) => entry.lang !== 'en'),
    };
  });
}
