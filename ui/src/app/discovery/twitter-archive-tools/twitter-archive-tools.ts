import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MbButton } from '../../design-system/button/button';
import { MbContentLink } from '../../design-system/metadata/metadata';
import { LanguageVersions } from '../../public-pages/focused-apps/language-versions';
import { AppOnlyLinkRel } from '../../public-pages/public-page-urls';
import { UnbirdArchiveTools } from '../../unbird/unbird-archive-tools';

/**
 * Twitter archive tools as a public page: the door for people who have the
 * archive .zip and no plan for it yet (spec/sprint/unbird-2026-11.md).
 *
 * The tools are deferred, so prerendering holds only the copy and touches no
 * storage. From here the natural next step is finding people on Mastodon.
 */
@Component({
  selector: 'app-twitter-archive-tools',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    UnbirdArchiveTools,
  ],
  templateUrl: './twitter-archive-tools.html',
  styleUrl: '../../public-pages/focused-apps/focused-page.css',
})
export class TwitterArchiveTools {
  /** Set on the signed-in route, where the shell supplies header and account menu. */
  protected readonly inShell = inject(ActivatedRoute).snapshot.data['inShell'] === true;
}
