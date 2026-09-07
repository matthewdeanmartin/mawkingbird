import { Component, computed, inject, input } from '@angular/core';
import { Auth } from '../auth';
import { ClientPrefs } from '../client-prefs';
import { Account } from '../models';

/**
 * Follower count at which an account earns a check visible to everyone —
 * what the 10,000th most-followed account has, so the check marks the top 10k.
 */
export const VERIFIED_FOLLOWER_THRESHOLD = 9_728;

/**
 * Blue verification check, 2018-Twitter style, decided entirely client-side.
 * Who gets one is a viewer preference (ClientPrefs.verifiedMode): a fixed
 * follower bar (default), anyone with more followers than the viewer, or
 * everyone. The viewer's own account additionally always shows a private
 * self-check — only you can know that you really are you.
 */
@Component({
  selector: 'app-verified-badge',
  template: `
    @if (publicCheck()) {
      <svg class="badge" viewBox="0 0 24 24" aria-label="Verified" role="img">
        <title>{{ publicTitle() }}</title>
        <path [attr.d]="checkPath" />
      </svg>
    } @else if (selfCheck()) {
      <svg class="badge self" viewBox="0 0 24 24" aria-label="Self-verified" role="img">
        <title>Verified — only you can see this, because only you know you're really you</title>
        <path [attr.d]="checkPath" />
      </svg>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
    }
    .badge {
      width: 1.1em;
      height: 1.1em;
      fill: var(--accent);
      vertical-align: text-bottom;
    }
    .badge.self {
      opacity: 0.75;
    }
  `,
})
export class VerifiedBadge {
  private auth = inject(Auth);
  private prefs = inject(ClientPrefs);

  readonly account = input.required<Account>();

  /** Twitter-style seal-with-check glyph. */
  protected readonly checkPath =
    'M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66' +
    '-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 ' +
    '3.91c-1.31.67-2.2 1.91-2.2 3.34s.89 2.67 2.2 3.34c-.46 1.39-.21 2.9.8 3.91s2.52 1.26' +
    ' 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.68-.88 3.34-2.19c1.39.45 2.9.2 3.91-.81s1.27' +
    '-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34zm-11.71 4.2L6.8 12.46l1.41-1.42 2.26 2.26' +
    ' 4.8-5.23 1.47 1.36-6.2 6.77z';

  protected readonly publicCheck = computed(() => {
    switch (this.prefs.verifiedMode()) {
      case 'everyone':
        return true;
      case 'famous':
        return this.account().followers_count > (this.auth.account()?.followers_count ?? 0);
      default:
        return this.account().followers_count >= VERIFIED_FOLLOWER_THRESHOLD;
    }
  });

  protected readonly publicTitle = computed(() => {
    switch (this.prefs.verifiedMode()) {
      case 'everyone':
        return 'Verified — everyone deserves a blue check mark';
      case 'famous':
        return 'Verified — more followers than you; compared to you, famous';
      default:
        return 'Verified — a top-10,000 account (9,728+ followers)';
    }
  });

  protected readonly selfCheck = computed(() => this.account().id === this.auth.account()?.id);
}
