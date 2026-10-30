import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MbButton } from '../../design-system/button/button';
import { MbContentLink } from '../../design-system/metadata/metadata';
import { ScheduleWorkbench } from './schedule-workbench';

/**
 * Bulk Mastodon scheduling as a focused mini-app.
 *
 * Signed out, a public page aimed at "how do I schedule a Mastodon post", that
 * explains the server-side scheduling every Mastodon server already has and
 * offers sign-in. Signed in with Mastodon, the shell's trimmed nav around the
 * scheduler and the posts already waiting. The workbench is deferred and only
 * exists signed in, so prerendering touches no account.
 */
@Component({
  selector: 'app-schedule-mastodon-posts',
  imports: [RouterLink, MbButton, MbContentLink, ScheduleWorkbench],
  templateUrl: './schedule-mastodon-posts.html',
  styleUrl: '../focused-apps/focused-page.css',
})
export class ScheduleMastodonPosts {
  /** Set on the signed-in route, where the shell supplies header and account menu. */
  protected readonly inShell = inject(ActivatedRoute).snapshot.data['inShell'] === true;
  protected readonly returnHere = { next: '/schedule-mastodon-posts' };
}
