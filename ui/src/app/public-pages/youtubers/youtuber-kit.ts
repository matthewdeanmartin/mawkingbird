import { Component, computed, inject, ChangeDetectionStrategy } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { MbButton } from '../../design-system/button/button';
import { MbContentLink } from '../../design-system/metadata/metadata';
import { AppOnlyLinkRel } from '../public-page-urls';
import type { YoutuberKitPage } from './youtuber-pages';

/** A month and year in the page's language, without Angular locale data (safe in the prerender). */
export function monthYear(value: string | null, lang: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(lang, { year: 'numeric', month: 'short' }).format(date);
  } catch {
    return date.toISOString().slice(0, 7);
  }
}

/**
 * One YouTuber kit in one language (`/youtubers-on-mastodon/technology/`):
 * creators with their Mastodon account, channel, bio and newest videos, written
 * in the page's language, prerendered and indexed. Following and subscribing
 * happen in the app (`/videos/starters`), which a visitor without an account can
 * open; links out to YouTube are nofollow.
 */
@Component({
  selector: 'app-youtuber-kit-public',
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
          <h1>{{ page.heading }}</h1>
          <p>{{ page.copy.kitIntro(page.title) }}</p>
          <div class="feature-actions">
            <a
              mbButton
              routerLink="/videos/starters"
              [queryParams]="{ lang: page.lang, kit: page.pack.category }"
              >{{ page.copy.openKit }}</a
            >
          </div>
          <p class="kit-note">{{ page.copy.noAccount }}</p>
        </div>
        <section>
          <ul class="people creators">
            @for (person of page.pack.members; track person.acct) {
              <li>
                @if (person.avatar) {
                  <img [src]="person.avatar" width="48" height="48" alt="" loading="lazy" />
                }
                <div>
                  @if (person.url) {
                    <a mbContentLink [href]="person.url" rel="noopener">{{ person.displayName }}</a>
                  } @else {
                    <strong>{{ person.displayName }}</strong>
                  }
                  <span class="handle">&#64;{{ person.acct }}</span>
                  @if (person.bot) {
                    <span class="badge">{{ page.copy.videoFeed }}</span>
                  }
                  @if (person.bio) {
                    <p>{{ person.bio }}</p>
                  }
                  <p class="channel">
                    {{ page.copy.channel }}:
                    <a
                      [href]="'https://www.youtube.com/channel/' + person.channel.id"
                      rel="nofollow noopener"
                      >{{ person.channel.title }}</a
                    >
                    @if (person.channel.lastUpload) {
                      <span class="kit-count">
                        · {{ page.copy.lastVideo }}:
                        {{ month(person.channel.lastUpload, page.lang) }}</span
                      >
                    }
                  </p>
                  @if (person.videos.length) {
                    <ul class="videos">
                      @for (video of person.videos; track video.id) {
                        <li>
                          <a
                            [href]="'https://www.youtube.com/watch?v=' + video.id"
                            rel="nofollow noopener"
                            >{{ video.title }}</a
                          >
                        </li>
                      }
                    </ul>
                  }
                </div>
              </li>
            }
          </ul>
        </section>
        @if (page.others.length) {
          <section>
            <h2>{{ page.copy.moreKits }}</h2>
            <ul class="kit-links">
              @for (other of page.others; track other.path) {
                <li>
                  <a mbContentLink [routerLink]="['/' + other.path]">{{ other.title }}</a>
                </li>
              }
            </ul>
          </section>
        }
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
          <a mbContentLink [routerLink]="['/' + page.hub.path]">{{ page.copy.allKits }}</a>
          <a mbContentLink routerLink="/features">Mawkingbird</a>
          <a mbContentLink href="/help/">Help</a>
        </footer>
      </main>
    }
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['../features/features.css', '../features/follow.css', './youtuber-public.css'],
})
export class YoutuberKitPublic {
  private readonly data = toSignal(inject(ActivatedRoute).data.pipe(map((d) => d['page'])), {
    initialValue: null,
  });
  protected readonly page = computed(() => this.data() as YoutuberKitPage | null);
  protected month(value: string | null, lang: string): string {
    return monthYear(value, lang);
  }
}
