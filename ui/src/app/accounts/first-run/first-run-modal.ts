import { Component, inject, input, output, signal, ChangeDetectionStrategy } from '@angular/core';
import { FeatureFlags } from '../../platform/build/feature-flags';
import { MbButton } from '../../design-system/button/button';
import { TranslocoPipe } from '@jsverse/transloco';

// i18n firstRun.welcomeTitle: Welcome to Mawkingbird
// i18n firstRun.pitch: A social media client for Mastodon, Bluesky and more.
// i18n firstRun.sampleNote: The posts behind this box are a small sample, so you can see what the app looks like before you decide anything.
// i18n firstRun.logIn: Log in
// i18n firstRun.continueAnonymous: Continue without logging in
// i18n firstRun.accountQuestion: Which account do you have?
// i18n firstRun.pickNetwork: Pick the network you already use.
// i18n firstRun.blueskyHintApprove: Sign in on Bluesky and approve access.
// i18n firstRun.mastodonHint: Sign in on your own server.
// i18n firstRun.bluesky: Bluesky
// i18n firstRun.mastodon: Mastodon
// i18n firstRun.misskey: Misskey
// i18n firstRun.misskeyHint: Sign in on your Misskey server.
// i18n firstRun.back: Back
// i18n firstRun.backTo: Back to “{{page}}”
// i18n firstRun.featuresLink: What can it do? ↗
// i18n firstRun.helpLink: Read the guides ↗

/**
 * Which network a visitor picked, that they declined to sign in at all, or that
 * they are going back to the page that brought them.
 */
export type FirstRunChoice = 'anonymous' | 'mastodon' | 'bluesky' | 'misskey' | 'back';

/**
 * The first-run question, asked over a running app.
 *
 * This modal is the whole point of the front door: the timeline behind it is
 * real and already rendering, so the visitor can see what they are being asked
 * to join before deciding. Its predecessor was a standalone landing page, which
 * showed a stranger a page *about* the app instead of the app.
 *
 * It **blocks**. There is no dismiss, no click-outside and no escape key: the
 * choices are the only exits, because "clicked the backdrop" has no honest
 * interpretation as either an answer or a refusal. Step two asks which network,
 * and stays in the modal rather than navigating — leaving the page would throw
 * away the very thing being shown.
 */
@Component({
  selector: 'app-first-run-modal',
  templateUrl: './first-run-modal.html',
  styleUrl: './first-run-modal.css',
  imports: [TranslocoPipe, MbButton],
  changeDetection: ChangeDetectionStrategy.Eager,
  host: {
    role: 'dialog',
    'aria-modal': 'true',
    'aria-labelledby': 'first-run-title',
  },
})
export class FirstRunModal {
  /** The title of the page the visitor came from, offered as a way back. */
  readonly from = input<string | null>(null);

  /** Emitted once, when the visitor answers. The host then clears the seed. */
  readonly choose = output<FirstRunChoice>();

  /** The Misskey door follows its rollout flag, as on the `/login` page. */
  protected readonly misskeyEnabled = inject(FeatureFlags).enabled('misskey');

  /** `network` is step two: which one. */
  protected step = signal<'welcome' | 'network'>('welcome');

  protected toNetwork(): void {
    this.step.set('network');
  }

  protected back(): void {
    this.step.set('welcome');
  }

  protected pick(choice: FirstRunChoice): void {
    this.choose.emit(choice);
  }
}
