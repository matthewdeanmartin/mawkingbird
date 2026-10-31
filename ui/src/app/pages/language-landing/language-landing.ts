import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MbButton } from '../../design-system/button/button';
import { MbContentLink } from '../../design-system/metadata/metadata';
import { provideRouteLanguage } from '../../page-language';
import { LanguageChecklist } from './language-checklist';
import { LANGUAGE_LANDING_COPY, LanguageLandingCopy } from './language-landing.copy';
import { LanguageVersions } from '../focused-apps/language-versions';

/**
 * A language landing page (`mastodon-auf-deutsch`, `mastodon-in-english`,
 * `learn-english-with-mastodon`): a pitch for the languages Mawkingbird
 * serves while signed out, the reader's language settings as one checklist
 * once signed in, then the way home. It shows no posts; `/` does that.
 *
 * One component for every such page: the registry path it is mounted on
 * picks the copy, and the route's `lang` pins anything translated inside it.
 */
@Component({
  selector: 'app-language-landing',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, LanguageChecklist],
  templateUrl: './language-landing.html',
  styleUrl: '../focused-apps/focused-page.css',
  // Like .steps, without the numbers: these are claims, not a sequence.
  styles: `
    .claims {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
      margin: 28px 0;
      padding: 0;
      list-style: none;
    }
    .claims li {
      padding: 16px;
      border: 1px solid var(--border);
      border-radius: 12px;
    }
    .claims h2 {
      font-size: 1.05rem;
      margin: 0 0 6px;
    }
    .claims p {
      margin: 0;
      line-height: 1.6;
    }
  `,
  providers: [provideRouteLanguage()],
})
export class LanguageLanding {
  private readonly route = inject(ActivatedRoute).snapshot;
  /** Set on the signed-in route, where the shell supplies header and account menu. */
  protected readonly inShell = this.route.data['inShell'] === true;
  protected readonly copy: LanguageLandingCopy = pageCopy(this.route.pathFromRoot);
  protected readonly returnHere = { next: `/${this.copy.path}` };
}

/** The copy for the registry path in this route chain (the shell twin's is its parent). */
function pageCopy(chain: { routeConfig?: { path?: string } | null }[]): LanguageLandingCopy {
  for (const route of [...chain].reverse()) {
    const copy = LANGUAGE_LANDING_COPY[route.routeConfig?.path ?? ''];
    if (copy) return copy;
  }
  return LANGUAGE_LANDING_COPY['mastodon-in-english'];
}
