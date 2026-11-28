import { NATIVE_SOCIAL } from '../../../platform/session/platform-login';
import { MbButton } from '../../../design-system/button/button';
import { MbNotice } from '../../../design-system/notice/notice';
import { MbContentLink } from '../../../design-system/metadata/metadata';
import { MbPageHeader } from '../../../design-system/page-header/page-header';
import { MbField, MbControl } from '../../../design-system/field/field';
import { MbDisclosure } from '../../../design-system/disclosure/disclosure';
import { Component, inject, input, OnInit, signal, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { BlueskySession } from '../../../connections/bluesky/bluesky-session';
import { AnonymousCapabilities } from '../../../accounts/anonymous/anonymous-capabilities';
import { expiryLabel } from '../expiry-label';
import { CONNECTION_SCOPE_COPY } from '../connection-catalog';
import { StorageBadge } from '../storage-badge';
import { stashConnectorReturn } from '../../../platform/session/login-destination';

const BLUESKY_ENTRYWAY = 'https://bsky.social';

// i18n settings.connections.backLink: ‹ All connections
// i18n settings.connections.bluesky.title: 🦋 Bluesky
// i18n settings.connections.bluesky.intro: Your Bluesky timeline is merged into home, and replies, likes and reposts on 🦋 posts go back to Bluesky.
// i18n settings.connections.bluesky.anonymousNoteSignIn: Works while browsing anonymously; you approve access on Bluesky. Your Bluesky posts merge into Home, and you can reply, like and repost. Bluesky DMs need Chat, which anonymous sessions don't have.
// i18n settings.connections.bluesky.unlink: Unlink
// i18n settings.connections.bluesky.unlinkNote: Unlinking forgets the tokens here — you can also revoke the app password on bsky.app.
// i18n settings.connections.bluesky.unlinkNoteOAuth: Unlinking forgets this connection here and asks Bluesky to revoke Mawkingbird's access.
// i18n settings.connections.bluesky.expiresOn: This link is dropped and the tokens deleted from this browser on {{date}}.
// i18n settings.connections.bluesky.oauthHint: Approve access on Bluesky's own page. You sign in there with your usual Bluesky login, so there is no app password to make, and Mawkingbird never sees your password.
// i18n settings.connections.bluesky.continueWithBluesky: Continue with Bluesky
// i18n settings.connections.bluesky.opening: Opening Bluesky…
// i18n settings.connections.bluesky.otherServerSummary: Use a specific handle or another PDS
// i18n settings.connections.bluesky.handleContinue: Continue
// i18n settings.connections.bluesky.handleUnresolved: Couldn't find that Bluesky handle. Check the spelling, or try the full handle such as you.bsky.social.
// i18n settings.connections.bluesky.oauthStartFailed: Couldn't open Bluesky to approve access. Try again in a moment.
// i18n settings.connections.bluesky.handlePlaceholder: you.bsky.social
// i18n settings.connections.bluesky.upgradeNotice: This link uses an app password. Switch to Bluesky's own sign-in, where you approve access on Bluesky's page. The app password is then deleted here.
// i18n settings.connections.bluesky.upgrade: Switch to Bluesky sign-in
// i18n settings.connections.bluesky.upgradeFailed: Couldn't open Bluesky's sign-in. Try again in a moment.
/**
 * Settings → Connections → Bluesky: links Bluesky under a Mastodon or Anonymous
 * account. OAuth comes first; the app password is kept as a last resort for a
 * PDS that cannot do OAuth.
 */
@Component({
  selector: 'app-connection-bluesky',
  imports: [
    MbButton,
    MbNotice,
    MbContentLink,
    MbPageHeader,
    MbField,
    MbDisclosure,
    MbControl,
    FormsModule,
    RouterLink,
    StorageBadge,
    TranslocoPipe,
  ],
  templateUrl: './connection-bluesky.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['../connection-page.css', './connection-bluesky.css'],
})
export class ConnectionBluesky implements OnInit {
  /** Inside a mini-app page: no Settings back link or page header. */
  readonly embedded = input(false);
  protected capabilities = inject(AnonymousCapabilities);
  protected bsky = inject(BlueskySession);
  protected native = inject(NATIVE_SOCIAL);
  protected upgrading = signal(false);
  protected upgradeError = signal(false);
  private transloco = inject(TranslocoService);

  protected bskyLinking = signal(false);
  protected bskyError = signal<string | null>(null);
  /** Handle for OAuth against a specific account or PDS (the entryway needs none). */
  protected oauthHandle = signal('');
  private router = inject(Router);

  protected readonly expiryLabel = expiryLabel;

  /** The storage-scope sentence shown under the heading. */
  protected readonly scopeDetail = CONNECTION_SCOPE_COPY.account.detail;

  ngOnInit(): void {
    // Deep-link case: re-check against a policy shortened on the catalog page.
    this.bsky.enforceLifetime();
  }

  /** OAuth through bsky.social, which lets Bluesky ask for the account. */
  linkWithBluesky(): void {
    this.beginOAuth(BLUESKY_ENTRYWAY);
  }

  /** OAuth for a specific handle, DID or PDS. */
  linkWithHandle(): void {
    const identifier = this.oauthHandle().trim().replace(/^@/, '');
    if (identifier) this.beginOAuth(identifier);
  }

  private beginOAuth(identifier: string): void {
    if (this.bskyLinking()) {
      return;
    }
    this.bskyLinking.set(true);
    this.bskyError.set(null);
    // The callback is a fresh page load; it returns to the page that started this.
    stashConnectorReturn(this.router.url.split(/[?#]/)[0]);
    void this.bsky
      .beginOAuthConnector(identifier)
      .then(() => {
        if (this.native) this.bskyLinking.set(false);
      })
      .catch((err: unknown) => {
        // The redirect normally never resolves; rejection means discovery or PAR failed.
        this.bskyLinking.set(false);
        if (this.native && err && typeof err === 'object' && 'message' in err) {
          this.bskyError.set(String(err.message));
          return;
        }
        const message = err instanceof Error ? err.message : '';
        this.bskyError.set(
          this.transloco.translate<string>(
            /resolve|handle|did/i.test(message)
              ? 'settings.connections.bluesky.handleUnresolved'
              : 'settings.connections.bluesky.oauthStartFailed',
          ),
        );
      });
  }

  /** Re-authorise the same account with OAuth; the app password goes on return. */
  upgradeToOAuth(): void {
    if (this.upgrading()) return;
    this.upgrading.set(true);
    this.upgradeError.set(false);
    stashConnectorReturn(this.router.url.split(/[?#]/)[0]);
    void this.bsky.upgradeToOAuth().catch(() => {
      this.upgrading.set(false);
      this.upgradeError.set(true);
    });
  }

  unlinkBluesky(): void {
    this.bsky.unlink();
  }
}
