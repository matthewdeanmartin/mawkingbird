import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MbButton } from '../../design-system/button/button';
import { MbContentLink } from '../../design-system/metadata/metadata';
import { AmnestyWorkbench } from './amnesty-workbench';
import { provideRouteLanguage } from '../../page-language';
import { LanguageVersions } from '../focused-apps/language-versions';

/**
 * Mute Amnesty and Block Amnesty as a focused mini-app: unmute or unblock
 * everyone on Mastodon at once, which Mastodon itself only does one account at
 * a time. The workbench is deferred and only exists signed in.
 */
@Component({
  selector: 'app-mastodon-mute-block-amnesty',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, AmnestyWorkbench],
  templateUrl: './mastodon-mute-block-amnesty.html',
  styleUrl: '../focused-apps/focused-page.css',
})
export class MastodonMuteBlockAmnesty {
  /** Set on the signed-in route, where the shell supplies header and account menu. */
  protected readonly inShell = inject(ActivatedRoute).snapshot.data['inShell'] === true;
  protected readonly returnHere = { next: '/mastodon-mute-block-amnesty' };
}

/**
 * The German page (focused-tools.json `lang: "de"`): the same tool and logic,
 * German words, and everything translated inside it pinned to German (see
 * page-language.ts).
 */
@Component({
  selector: 'app-mastodon-mute-block-amnesty-de',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, AmnestyWorkbench],
  templateUrl: './mastodon-mute-block-amnesty.de.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonMuteBlockAmnestyDe extends MastodonMuteBlockAmnesty {
  protected override readonly returnHere = { next: '/de/mastodon-stummschaltungen-aufheben' };
}

/**
 * The Japanese page (focused-tools.json `lang: "ja"`): the same tool and
 * logic, Japanese words, and everything translated inside it pinned to
 * Japanese (see page-language.ts).
 */
@Component({
  selector: 'app-mastodon-mute-block-amnesty-ja',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, AmnestyWorkbench],
  templateUrl: './mastodon-mute-block-amnesty.ja.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonMuteBlockAmnestyJa extends MastodonMuteBlockAmnesty {
  protected override readonly returnHere = { next: '/ja/mastodon-mute-block-amnesty' };
}
