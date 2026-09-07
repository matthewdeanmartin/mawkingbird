import { Component, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { FocusTrap } from '../a11y/focus-trap';
import { Auth } from '../auth';

// i18n signInPrompt.title: Sign in to {{action}}
// i18n signInPrompt.body: This one needs an account on a server — it happens there, not in this browser. Reading, bookmarking and sharing keep working without one.
// i18n signInPrompt.signIn: Sign in
// i18n signInPrompt.createAccount: Create an account
// i18n signInPrompt.notNow: Not now
// i18n signInPrompt.action.like: like this
// i18n signInPrompt.action.reply: reply
// i18n signInPrompt.action.boost: boost this

/**
 * "You need an account for that" — shown when an anonymous reader taps an action
 * that only a server-side identity can perform.
 *
 * ## Why this exists at all
 *
 * Anonymous mode is deliberately generous: bookmarks, shares, drafts and follows
 * all have browser-local implementations that genuinely work. The line falls at
 * actions that must happen on someone else's server — reply, favourite, boost —
 * and `AnonymousCapabilities.statusCaps` correctly reports those as unavailable.
 *
 * The bug this answers was in what the card did *with* that correct answer: it
 * fell through to inert `<span class="action">` elements carrying the counts.
 * `.action` sets `cursor: pointer` and lights up on hover, so those spans looked
 * and felt exactly like the working buttons on every other card — and did nothing
 * when tapped. On a phone, where there is no hover to read, a tap that does
 * nothing is indistinguishable from a tap that missed the target.
 *
 * So the fix is not to make the affordance quieter but to make it *answer*: the
 * reader asked to like something, and the honest response is to say what that
 * costs and offer the way there.
 *
 * Navigating to `/login` exits Anonymous first, matching the shell's own login
 * link — otherwise the login page loads with an anonymous session still active
 * behind it.
 */
@Component({
  selector: 'app-sign-in-prompt',
  imports: [FocusTrap, RouterLink, TranslocoPipe],
  templateUrl: './sign-in-prompt.html',
  styleUrl: './sign-in-prompt.css',
})
export class SignInPrompt {
  protected auth = inject(Auth);

  /**
   * What the reader was trying to do, as a translated phrase ("like this").
   * Named in the heading so the prompt answers the tap that opened it rather
   * than delivering a generic lecture about accounts.
   */
  readonly action = input.required<string>();

  readonly dismissed = output<void>();

  /**
   * Leaving Anonymous is what the shell's own login link does (`shell.ts:366`),
   * and skipping it strands the login page behind a live anonymous session.
   */
  protected leaveAnonymous(): void {
    this.auth.exitAnonymous();
  }
}
