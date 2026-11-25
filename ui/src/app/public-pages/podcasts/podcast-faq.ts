import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MbContentLink } from '../../design-system/metadata/metadata';
import { AppOnlyLinkRel } from '../public-page-urls';
import type { PodcastCopy } from './podcast-copy';
import type { PodcastVersion } from './podcast-pages';

/** Under every podcast page: questions, where to ask to be left out, other languages. */
@Component({
  selector: 'app-podcast-faq',
  imports: [RouterLink, AppOnlyLinkRel, MbContentLink],
  template: `
    <section>
      <h2>{{ copy().faqTitle }}</h2>
      <dl class="faq">
        @for (item of copy().faq; track item.q) {
          <dt>{{ item.q }}</dt>
          <dd>{{ item.a }}</dd>
        }
      </dl>
      <p>
        <a mbContentLink routerLink="/accounts/@mawkingbird@mastodon.social">{{
          copy().contact
        }}</a>
      </p>
    </section>
    @if (versions().length) {
      <p class="versions">
        {{ copy().alsoIn }}:
        @for (version of versions(); track version.lang) {
          <a
            mbContentLink
            [routerLink]="['/' + version.path]"
            [attr.hreflang]="version.lang"
            [attr.lang]="version.lang"
            >{{ version.name }}</a
          >
        }
      </p>
    }
  `,
  styleUrls: ['../features/features.css', '../youtubers/youtuber-public.css'],
})
export class PodcastFaq {
  readonly copy = input.required<PodcastCopy>();
  readonly versions = input<readonly PodcastVersion[]>([]);
}
