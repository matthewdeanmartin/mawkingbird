import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MbContentLink } from '../../design-system/metadata/metadata';
import { AppOnlyLinkRel } from '../../public-page-urls';
import { FEED_BUILDER_HUBS } from './feed-builder-registry';

/**
 * A link to the communities hub in `lang`, or nothing when that language has
 * none yet. Every tool index (/tools, /de/, …) includes it, so a language that
 * gains a hub in feed-builder-hubs.json is linked without touching templates;
 * check-seo-build.mjs fails if an index with a hub does not link it.
 */
@Component({
  selector: 'app-communities-link',
  imports: [RouterLink, AppOnlyLinkRel, MbContentLink],
  template: `
    @if (hub(); as hub) {
      <p>
        <a mbContentLink [routerLink]="'/' + hub.path">{{ hub.label }}</a>
      </p>
    }
  `,
})
export class CommunitiesLink {
  readonly lang = input.required<string>();
  protected readonly hub = computed(() =>
    FEED_BUILDER_HUBS.find((hub) => hub.lang === this.lang()),
  );
}
