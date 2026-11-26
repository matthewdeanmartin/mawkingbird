import { Component, computed, inject, ChangeDetectionStrategy } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { MbButton } from '../../design-system/button/button';
import { MbContentLink } from '../../design-system/metadata/metadata';
import { AppOnlyLinkRel } from '../public-page-urls';
import { PodcastFaq } from './podcast-faq';
import type { PodcastKitPage } from './podcast-pages';

/**
 * One topic (`/podcasts-on-mastodon/technology/`): each show's account, what it is
 * about and where it posts. Playing and following happen in the app
 * (`/singles/starter-kits`), which a visitor without an account can open. Links
 * to a show's own site are nofollow. Post text is never shown: see import-podcasts.mjs.
 */
@Component({
  selector: 'app-podcast-kit-public',
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
          <h1>{{ page.heading }}</h1>
          <p>{{ page.copy.kitIntro(page.kit.title) }}</p>
          <div class="feature-actions">
            <a
              mbButton
              routerLink="/singles/starter-kits"
              [queryParams]="{ lang: page.hub.lang, kit: page.kit.category }"
              >{{ page.copy.openKit }}</a
            >
          </div>
          <p class="kit-note">{{ page.copy.noAccount }}</p>
        </div>
        <section>
          <ul class="people creators">
            @for (show of page.kit.members; track show.acct) {
              <li>
                @if (show.avatar) {
                  <img [src]="show.avatar" width="48" height="48" alt="" loading="lazy" />
                } @else {
                  <span aria-hidden="true"></span>
                }
                <div>
                  @if (show.url) {
                    <a mbContentLink [href]="show.url" rel="noopener">{{ show.displayName }}</a>
                  } @else {
                    <strong>{{ show.displayName }}</strong>
                  }
                  <span class="handle">&#64;{{ show.acct }}</span>
                  @if (show.bot) {
                    <span class="badge">{{ page.copy.feedAccount }}</span>
                  }
                  @if (show.bio) {
                    <p>{{ show.bio }}</p>
                  }
                  <p class="channel">
                    @if (show.sources.length) {
                      <span>{{ page.copy.sharesOn(show.sources.join(', ')) }}</span>
                    }
                    @if (show.showUrl) {
                      @if (show.sources.length) {
                        ·
                      }
                      <a [href]="show.showUrl" rel="nofollow noopener">{{ page.copy.website }}</a>
                    }
                  </p>
                </div>
              </li>
            }
          </ul>
        </section>
        @if (page.others.length) {
          <section>
            <h2>{{ page.copy.moreTopics }}</h2>
            <ul class="kit-links">
              @for (other of page.others; track other.path) {
                <li>
                  <a mbContentLink [routerLink]="['/' + other.path]">{{ other.title }}</a>
                </li>
              }
            </ul>
          </section>
        }
        <app-podcast-faq [copy]="page.copy" [versions]="page.versions" />
        <footer>
          <a mbContentLink [routerLink]="['/' + page.hub.path]">{{ page.copy.allTopics }}</a>
          <a mbContentLink routerLink="/features">Mawkingbird</a>
          <a mbContentLink href="/help/">Help</a>
        </footer>
      </main>
    }
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: [
    '../features/features.css',
    '../features/follow.css',
    '../youtubers/youtuber-public.css',
  ],
})
export class PodcastKitPublic {
  private readonly data = toSignal(inject(ActivatedRoute).data.pipe(map((d) => d['page'])), {
    initialValue: null,
  });
  protected readonly page = computed(() => this.data() as PodcastKitPage | null);
}
