import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { MbButton } from '../../design-system/button/button';
import { MbContentLink } from '../../design-system/metadata/metadata';
import { AppOnlyLinkRel } from '../public-page-urls';
import PODCAST_HUBS from '../podcasts/podcast-hubs.json';
import type { YoutuberHubPage } from './youtuber-pages';

/**
 * A language's hub of YouTuber kits (`/youtubers-on-mastodon/`,
 * `/de/youtuber-auf-mastodon/`, …): prerendered, indexed, written in its
 * language. The kits link to their own public pages; the app opens on the
 * in-app kits page, which works without an account.
 */
@Component({
  selector: 'app-youtuber-hub-public',
  imports: [RouterLink, AppOnlyLinkRel, MbButton, MbContentLink],
  template: `
    @if (page(); as page) {
      <main class="features" [attr.lang]="page.lang">
        <header>
          <a mbContentLink [routerLink]="['/' + page.hub.path]"
            >Mawkingbird · {{ page.hub.label }}</a
          >
          <a mbButton routerLink="/videos/starters" [queryParams]="{ lang: page.lang }">{{
            page.copy.openApp
          }}</a>
        </header>
        <div class="kit-intro">
          <p class="eyebrow">{{ page.copy.eyebrow }}</p>
          <h1>{{ page.copy.hubHeading }}</h1>
          @for (paragraph of page.copy.hubIntro; track $index) {
            <p>{{ paragraph }}</p>
          }
        </div>
        <section>
          <ul class="kit-list">
            @for (kit of page.kits; track kit.path) {
              <li>
                <a mbContentLink [routerLink]="['/' + kit.path]"
                  ><span aria-hidden="true">{{ kit.icon }}</span> {{ kit.title }}</a
                >
                <span class="kit-count">{{ page.copy.creators(kit.count) }}</span>
              </li>
            }
          </ul>
        </section>
        <section>
          <h2>{{ page.copy.faqTitle }}</h2>
          <dl class="faq">
            @for (item of page.copy.faq; track item.q) {
              <dt>{{ item.q }}</dt>
              <dd>{{ item.a }}</dd>
            }
          </dl>
          <p>
            <a mbContentLink routerLink="/accounts/@mawkingbird@mastodon.social">{{
              page.copy.contact
            }}</a>
          </p>
        </section>
        @if (page.versions.length) {
          <p class="versions">
            {{ page.copy.alsoIn }}:
            @for (version of page.versions; track version.lang) {
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
        <footer>
          @if (page.lang !== 'en') {
            <a mbContentLink routerLink="/youtubers-on-mastodon">YouTubers on Mastodon (English)</a>
          }
          @if (podcasts(); as hub) {
            <a mbContentLink [routerLink]="['/' + hub.path]">{{ hub.label }}</a>
          }
          <a mbContentLink routerLink="/follow">Mawkingbird · Who to follow</a>
          <a mbContentLink routerLink="/features">Mawkingbird</a>
          <a mbContentLink href="/help/">Help</a>
        </footer>
      </main>
    }
  `,
  styleUrls: ['../features/features.css', '../features/follow.css', './youtuber-public.css'],
})
export class YoutuberHubPublic {
  private readonly data = toSignal(inject(ActivatedRoute).data.pipe(map((d) => d['page'])), {
    initialValue: null,
  });
  protected readonly page = computed(() => this.data() as YoutuberHubPage | null);
  /** The podcast hub in this language, where there is one. */
  protected readonly podcasts = computed(
    () =>
      (PODCAST_HUBS as unknown as Record<string, { path: string; label: string }>)[
        this.page()?.lang ?? ''
      ],
  );
}
