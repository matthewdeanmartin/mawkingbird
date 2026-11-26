import { Component, computed, inject, ChangeDetectionStrategy } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { MbButton } from '../../design-system/button/button';
import { MbContentLink } from '../../design-system/metadata/metadata';
import { AppOnlyLinkRel } from '../public-page-urls';
import YOUTUBER_HUBS from '../youtubers/youtuber-hubs.json';
import { PodcastFaq } from './podcast-faq';
import type { PodcastHubPage } from './podcast-pages';

/** A language's hub (`/podcasts-on-mastodon/`): every topic with enough shows. */
@Component({
  selector: 'app-podcast-hub-public',
  imports: [RouterLink, AppOnlyLinkRel, MbButton, MbContentLink, PodcastFaq],
  template: `
    @if (page(); as page) {
      <main class="features" [attr.lang]="page.hub.lang">
        <header>
          <a mbContentLink [routerLink]="['/' + page.hub.path]"
            >Mawkingbird · {{ page.hub.label }}</a
          >
          <a mbButton routerLink="/singles/starter-kits" [queryParams]="{ lang: page.hub.lang }">{{
            page.copy.openApp
          }}</a>
        </header>
        <div class="kit-intro">
          <p class="eyebrow">{{ page.hub.label }}</p>
          <h1>{{ page.copy.hubHeading }}</h1>
          @for (paragraph of page.copy.hubIntro(page.shows); track $index) {
            <p>{{ paragraph }}</p>
          }
        </div>
        <section>
          <ul class="kit-list">
            @for (kit of page.kits; track kit.path) {
              <li>
                <a mbContentLink [routerLink]="['/' + kit.path]"
                  ><span aria-hidden="true">{{ kit.icon }}</span>
                  {{ page.copy.kitLink(kit.title) }}</a
                >
                <span class="kit-count">{{ page.copy.shows(kit.count) }}</span>
              </li>
            }
          </ul>
        </section>
        <app-podcast-faq [copy]="page.copy" [versions]="page.versions" />
        <footer>
          <a mbContentLink [routerLink]="['/' + youtubers()]">{{ page.copy.youtubers }}</a>
          <a mbContentLink routerLink="/follow">Mawkingbird · Who to follow</a>
          <a mbContentLink routerLink="/features">Mawkingbird</a>
          <a mbContentLink href="/help/">Help</a>
        </footer>
      </main>
    }
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['../features/features.css', '../features/follow.css'],
})
export class PodcastHubPublic {
  private readonly data = toSignal(inject(ActivatedRoute).data.pipe(map((d) => d['page'])), {
    initialValue: null,
  });
  protected readonly page = computed(() => this.data() as PodcastHubPage | null);
  /** The YouTuber hub in this language. */
  protected readonly youtubers = computed(() => {
    const hubs = YOUTUBER_HUBS as unknown as Record<string, { path: string }>;
    return (hubs[this.page()?.hub.lang ?? 'en'] ?? hubs['en']).path;
  });
}
