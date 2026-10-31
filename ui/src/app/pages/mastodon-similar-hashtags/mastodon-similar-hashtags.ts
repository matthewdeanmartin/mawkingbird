import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MbButton } from '../../design-system/button/button';
import { MbContentLink } from '../../design-system/metadata/metadata';
import { SimilarHashtagsWorkbench } from './similar-hashtags-workbench';
import { provideRouteLanguage } from '../../page-language';
import { LanguageVersions } from '../focused-apps/language-versions';

/**
 * "Similar hashtags on Mastodon" as a focused mini-app: the hashtags that turn
 * up alongside the ones you give, ranked by how many recent posts they share.
 *
 * Works signed out: tag timelines are public on the big servers. Signed out it
 * samples mastodon.social; signed in, your own server. The workbench is
 * deferred, so the prerender holds only the copy and makes no requests.
 */
@Component({
  selector: 'app-mastodon-similar-hashtags',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, SimilarHashtagsWorkbench],
  templateUrl: './mastodon-similar-hashtags.html',
  styleUrl: '../focused-apps/focused-page.css',
})
export class MastodonSimilarHashtags {
  /** Set on the signed-in route, where the shell supplies header and account menu. */
  protected readonly inShell = inject(ActivatedRoute).snapshot.data['inShell'] === true;
  protected readonly returnHere = { next: '/mastodon-similar-hashtags' };
}

/**
 * The German page (focused-tools.json `lang: "de"`): the same tool and logic,
 * German words, and everything translated inside it pinned to German (see
 * page-language.ts).
 */
@Component({
  selector: 'app-mastodon-similar-hashtags-de',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, SimilarHashtagsWorkbench],
  templateUrl: './mastodon-similar-hashtags.de.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonSimilarHashtagsDe extends MastodonSimilarHashtags {
  protected override readonly returnHere = { next: '/de/aehnliche-hashtags-mastodon' };
}
