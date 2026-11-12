import { Component, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MbButton } from '../../design-system/button/button';
import { MbContentLink } from '../../design-system/metadata/metadata';
import { LanguageVersions } from '../../public-pages/focused-apps/language-versions';
import { AppOnlyLinkRel } from '../../public-pages/public-page-urls';
import { InteractionsWorkbench } from './interactions-workbench';

/**
 * "Find interactions" as a focused mini-app: every reply and mention between
 * two Mastodon or two Bluesky accounts. Works signed out; signing in adds
 * "Me and…" and, for Bluesky, post search. The workbench is deferred, so the
 * prerender holds only the copy and makes no requests.
 */
@Component({
  selector: 'app-find-interactions',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    InteractionsWorkbench,
  ],
  templateUrl: './find-interactions.html',
  styleUrl: '../../public-pages/focused-apps/focused-page.css',
})
export class FindInteractions {
  private readonly router = inject(Router);
  /** Set on the signed-in route, where the shell supplies header and account menu. */
  protected readonly inShell = inject(ActivatedRoute).snapshot.data['inShell'] === true;

  /** Back here after sign-in, with the two handles the visitor already typed. */
  protected get returnHere(): { next: string } {
    return { next: this.router.url.split('#')[0] || '/find-interactions' };
  }
}
