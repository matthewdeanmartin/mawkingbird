import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Api } from '../../api';
import { MbCheckbox } from '../../design-system/checkbox/checkbox';
import { Preferences } from '../../models';
import { Server } from '../../server';
import { TrustedAccounts } from '../../trusted-accounts';
import { FocusedNextSteps } from '../focused-apps/focused-next-steps';

/** Mastodon's `reading:expand:media` values, as its own Preferences page words them. */
const MEDIA_DISPLAY: Record<string, string> = {
  default: 'hide media marked as sensitive',
  show_all: 'show all',
  hide_all: 'hide all',
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
  imports: [FocusedNextSteps, FormsModule, MbCheckbox, RouterLink],
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
