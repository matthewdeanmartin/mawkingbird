import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Api } from '../../api';
import { MbCheckbox } from '../../design-system/checkbox/checkbox';
import { Preferences } from '../../models';
import { Server } from '../../server';
import { TrustedAccounts } from '../../trusted-accounts';
import { FocusedNextSteps, toolInviteLink } from '../focused-apps/focused-next-steps';
import { TranslocoPipe } from '@jsverse/transloco';

// i18n focusedTools.cw.here: In Mawkingbird
// i18n focusedTools.cw.expand: Auto-expand content warnings
// i18n focusedTools.cw.expandHint: Posts with a content warning open on their own. The warning text still shows above the post.
// i18n focusedTools.cw.media: Auto-show sensitive media
// i18n focusedTools.cw.mediaHint: Images and video marked sensitive show without the blur.
// i18n focusedTools.cw.applies: Changes apply straight away, for this account in this browser.
// i18n focusedTools.cw.restored: Your trust setting was "trust no one", which keeps every warning closed, so it is back to the default.
// i18n focusedTools.cw.server: On your Mastodon server
// i18n focusedTools.cw.serverIntro: The Mastodon website and some other apps follow your server's own preferences, which are separate from Mawkingbird's. They are currently:
// i18n focusedTools.cw.serverExpand: Always expand posts marked with content warnings:
// i18n focusedTools.cw.serverMedia: Media display:
// i18n focusedTools.cw.on: on
// i18n focusedTools.cw.off: off
// i18n focusedTools.cw.serverOnly: Mastodon doesn't let apps change these, so they can only be set on your server's own website.
// i18n focusedTools.cw.serverLink: Open your server's preferences
// i18n focusedTools.cw.trustTitle: Or only for people you trust
// i18n focusedTools.cw.trustBody: Mawkingbird can open warnings and show media for just the people you choose, and keep them closed for everyone else: trust individual people from the menu on their profile, everyone you follow, or everyone you follow and what they boost.
// i18n focusedTools.cw.trusted.one: You trust {{count}} person so far.
// i18n focusedTools.cw.trusted.other: You trust {{count}} people so far.
// i18n focusedTools.cw.choose: Choose who you trust
// i18n focusedTools.cw.display.default: hide media marked as sensitive
// i18n focusedTools.cw.display.showAll: show all
// i18n focusedTools.cw.display.hideAll: hide all

/**
 * Mastodon's `reading:expand:media` values, as its own Preferences page words
 * them: translation keys.
 */
const MEDIA_DISPLAY: Record<string, string> = {
  default: 'focusedTools.cw.display.default',
  show_all: 'focusedTools.cw.display.showAll',
  hide_all: 'focusedTools.cw.display.hideAll',
};

/**
 * The signed-in body of /turn-off-content-warnings-mastodon: Settings → Trust's two
 * account-wide switches, on their own, and the server's matching preferences.
 *
 * Mawkingbird's switches change here and now (browser-side, per account; see
 * {@link TrustedAccounts}). The server's own preferences are only readable:
 * Mastodon has no API to write them, so they are shown with a link to the
 * server's Preferences page rather than as switches that could not save.
 */
@Component({
  selector: 'app-content-warnings-workbench',
  imports: [TranslocoPipe, FocusedNextSteps, FormsModule, MbCheckbox, RouterLink],
  templateUrl: './content-warnings-workbench.html',
  styleUrl: '../focused-apps/focused-page.css',
  styles: `
    .switches {
      display: grid;
      gap: 14px;
      margin: 0 0 8px;
    }
    .server-values {
      margin: 0 0 12px;
      padding-left: 20px;
      line-height: 1.6;
    }
  `,
})
export class ContentWarningsWorkbench {
  protected readonly invite = toolInviteLink();
  private readonly api = inject(Api);
  private readonly server = inject(Server);
  protected readonly trust = inject(TrustedAccounts);

  /** The server's own reading preferences; null while loading or unavailable. */
  protected readonly serverPrefs = signal<Preferences | null>(null);
  /** Set once a switch has been changed here, so the next steps follow the task. */
  protected readonly changed = signal(false);
  /** Turning a switch on lifted "trust no one", which would otherwise silence it. */
  protected readonly restoredTrust = signal(false);

  protected readonly serverPrefsUrl = computed(() => {
    try {
      return `${new URL(this.server.baseUrl()).origin}/settings/preferences/other`;
    } catch {
      return null;
    }
  });

  constructor() {
    this.api.preferences().subscribe({
      next: (prefs) => this.serverPrefs.set(prefs),
      // Purely informational: a server that does not answer just leaves it out.
      error: () => this.serverPrefs.set(null),
    });
  }

  protected setCw(on: boolean): void {
    this.liftRevokedTrust(on);
    this.trust.setExpandAllCw(on);
    this.changed.set(true);
  }

  protected setSensitive(on: boolean): void {
    this.liftRevokedTrust(on);
    this.trust.setShowAllSensitive(on);
    this.changed.set(true);
  }

  /** A translation key for known values; an unknown value shows as itself. */
  protected mediaDisplay(value: string | undefined): string {
    return MEDIA_DISPLAY[value ?? ''] ?? value ?? 'unknown';
  }

  /**
   * At "trust no one" both switches are inert. Someone switching one on here
   * plainly wants it to work, so go back to the default level and say so.
   */
  private liftRevokedTrust(on: boolean): void {
    if (on && this.trust.level() === 'none') {
      this.trust.setLevel('individuals');
      this.restoredTrust.set(true);
    }
  }
}
