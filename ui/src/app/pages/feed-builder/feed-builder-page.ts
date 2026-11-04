import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MbBadge } from '../../design-system/badge/badge';
import { MbButton } from '../../design-system/button/button';
import { MbDisclosure } from '../../design-system/disclosure/disclosure';
import { MbContentLink } from '../../design-system/metadata/metadata';
import { LanguageVersions } from '../focused-apps/language-versions';
import { FeedPerson, FeedTag, shelves } from './feed-builder-data';
import { FEED_BUILDER_HUB } from './feed-builder-registry';
import { FeedPage } from './feed-builder-routes';
import { TagActivity } from './tag-activity';

/**
 * Where readers ask questions or ask to be removed: the project account, opened
 * in Mawkingbird (works signed out). Not the bare mastodon.social URL, which the
 * pages carry only as `rel="me"` identity metadata (check-seo-build.mjs).
 */
export const HELP_PATH = '/accounts/@mawkingbird@mastodon.social';

/**
 * A topic page ("starter kit" in public copy) in one language: the pitch, the
 * hashtags (with future tags for languages whose own tags are still small),
 * the people by shelf, the servers, how people are chosen, and questions.
 * Everything here is prerendered except the live tag activity, which is
 * deferred to the browser. One component serves every topic and language;
 * the words come from the topic's copy and the language's shared words.
 */
@Component({
  selector: 'app-feed-builder-page',
  imports: [
    RouterLink,
    MbBadge,
    MbButton,
    MbContentLink,
    MbDisclosure,
    LanguageVersions,
    TagActivity,
  ],
  templateUrl: './feed-builder-page.html',
  styleUrls: ['../features/features.css', '../features/follow.css', './feed-builder.css'],
})
export class FeedBuilderPage {
  protected readonly page = inject(ActivatedRoute).snapshot.data['page'] as FeedPage;
  protected readonly hub = `/${FEED_BUILDER_HUB}`;
  protected readonly helpPath = HELP_PATH;
  protected readonly chrome = this.page.chrome;
  protected readonly copy = this.page.copy;
  protected readonly lang = this.page.lang;
  protected readonly tags = computed(() => this.page.data.tags.filter((tag) => tag.kind === 'tag'));
  protected readonly futureTags = computed(() =>
    this.page.data.tags.filter((tag) => tag.kind === 'future'),
  );
  protected readonly shelves = shelves(this.page.data.people);
  protected readonly servers = this.page.data.servers;
  protected readonly updated = new Date(this.page.data.generatedAt).toLocaleDateString(this.lang, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  /** An English tag on a page in another language says so. */
  protected foreign(tag: FeedTag): boolean {
    return this.lang !== 'en' && tag.lang !== this.lang;
  }

  protected youtubeUrl(person: FeedPerson): string {
    return `https://www.youtube.com/channel/${person.youtube?.channelId}`;
  }

  /** Presence badges, without repeating the YouTube link shown beside them. */
  protected elsewhere(person: FeedPerson) {
    return person.elsewhere.filter((kind) => !(kind === 'youtube' && person.youtube));
  }
}
