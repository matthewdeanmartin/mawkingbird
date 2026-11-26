import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbRailCard } from '../../design-system/identity/rail-card';
import { packTitle, preferredKitLanguage, YoutuberKits, YoutuberPack } from './youtuber-kits';

// i18n youtuberKits.rail.title: YouTubers on Mastodon
// i18n youtuberKits.rail.more: All creator kits
// i18n youtuberKits.rail.count: {{count}} creators

/** How many kits the rail offers before "All creator kits". */
export const RAIL_KITS = 5;

/**
 * Video mode's right rail: a few creator kits in the reader's language, the
 * biggest first, each opening its kit on the YouTubers page. Shows nothing
 * until kits are bundled. Rendered under `@defer` so the shell does not carry
 * it at start-up.
 */
@Component({
  selector: 'app-youtuber-kits-card',
  imports: [RouterLink, TranslocoPipe, MbRailCard],
  template: `
    @if (kits().length) {
      <section mbRailCard class="card">
        <h2 class="card-title">{{ 'youtuberKits.rail.title' | transloco }}</h2>
        <ul>
          @for (kit of kits(); track kit.category) {
            <li>
              <a routerLink="/videos/starters" [queryParams]="{ lang: lang(), kit: kit.category }">
                <span aria-hidden="true">{{ kit.icon }}</span>
                <span class="name">{{ title(kit) }}</span>
                <span class="muted">{{
                  'youtuberKits.rail.count' | transloco: { count: kit.members.length }
                }}</span>
              </a>
            </li>
          }
        </ul>
        <a class="more" routerLink="/videos/starters" [queryParams]="{ lang: lang() }">{{
          'youtuberKits.rail.more' | transloco
        }}</a>
      </section>
    }
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: `
    .card-title {
      font-size: 1rem;
      margin: 0 0 0.5rem;
    }
    ul {
      display: grid;
      gap: 0.25rem;
      list-style: none;
      margin: 0 0 0.5rem;
      padding: 0;
    }
    li a {
      align-items: baseline;
      color: inherit;
      display: flex;
      gap: 0.4rem;
      text-decoration: none;
    }
    li a:hover .name,
    li a:focus-visible .name {
      text-decoration: underline;
    }
    .name {
      flex: 1 1 auto;
      min-width: 0;
    }
    .muted {
      color: var(--muted);
      font-size: 0.85rem;
    }
    .more {
      font-size: 0.9rem;
    }
  `,
})
export class YoutuberKitsCard {
  private readonly service = inject(YoutuberKits);
  protected readonly kits = signal<YoutuberPack[]>([]);
  protected readonly lang = signal('en');

  constructor() {
    const lang = preferredKitLanguage(this.service.languages(), this.service.wantedLanguages());
    if (!lang) return;
    this.lang.set(lang);
    void this.service
      .packs(lang)
      .then((packs) =>
        this.kits.set(
          [...packs].sort((a, b) => b.members.length - a.members.length).slice(0, RAIL_KITS),
        ),
      );
  }

  protected title(kit: YoutuberPack): string {
    return packTitle(kit, this.lang());
  }
}
