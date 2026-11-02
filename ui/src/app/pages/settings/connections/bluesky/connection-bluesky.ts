import { MbButton } from '../../../../design-system/button/button';
import { MbNotice } from '../../../../design-system/notice/notice';
import { MbContentLink } from '../../../../design-system/metadata/metadata';
import { MbPageHeader } from '../../../../design-system/page-header/page-header';
import { MbField, MbControl } from '../../../../design-system/field/field';
import { MbDisclosure } from '../../../../design-system/disclosure/disclosure';
import { Component, inject, input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { BlueskySession } from '../../../../providers/bluesky/bluesky-session';
import { AnonymousCapabilities } from '../../../../providers/anonymous/anonymous-capabilities';
import { expiryLabel } from '../expiry-label';
import { CONNECTION_SCOPE_COPY } from '../connection-catalog';
import { StorageBadge } from '../storage-badge';
import { stashConnectorReturn } from '../../../../login-destination';

const BLUESKY_ENTRYWAY = 'https://bsky.social';

// i18n settings.connections.backLink: ‹ All connections
// i18n settings.connections.bluesky.title: 🦋 Bluesky
// i18n settings.connections.bluesky.intro: Your Bluesky timeline is merged into home, and replies, likes and reposts on 🦋 posts go back to Bluesky.
// i18n settings.connections.bluesky.anonymousNoteSignIn: This works while you're browsing anonymously — you approve access on Bluesky itself, which doesn't involve a Mastodon account. Your Bluesky posts merge into home, and you can reply, like and repost them. Bluesky DMs are the exception: those live in Chat, which anonymous sessions don't have.
// i18n settings.connections.bluesky.unlink: Unlink
// i18n settings.connections.bluesky.unlinkNote: Unlinking forgets the tokens here — you can also revoke the app password on bsky.app.
// i18n settings.connections.bluesky.unlinkNoteOAuth: Unlinking forgets this connection here and asks Bluesky to revoke Mawkingbird's access.
// i18n settings.connections.bluesky.expiresOn: This link is dropped and the tokens deleted from this browser on {{date}}.
// i18n settings.connections.bluesky.oauthHint: Approve access on Bluesky's own page. You sign in there with your usual Bluesky login, so there is no app password to make, and Mawkingbird never sees your password.
// i18n settings.connections.bluesky.continueWithBluesky: Continue with Bluesky
// i18n settings.connections.bluesky.opening: Opening Bluesky…
// i18n settings.connections.bluesky.otherServerSummary: Use a specific handle or another PDS
// i18n settings.connections.bluesky.handleContinue: Continue
// i18n settings.connections.bluesky.appPasswordSummary: Use an app password instead (only if the steps above fail)
// i18n settings.connections.bluesky.handleUnresolved: Couldn't find that Bluesky handle. Check the spelling, or try the full handle such as you.bsky.social.
// i18n settings.connections.bluesky.oauthStartFailed: Couldn't open Bluesky to approve access. Try again in a moment.
// i18n settings.connections.bluesky.linkHint.a: Link with an
// i18n settings.connections.bluesky.linkHint.appPassword: app password
// i18n settings.connections.bluesky.linkHint.b: — made at bsky.app → Settings → Privacy and security → App Passwords. It's revocable and is never your real password. Check
// i18n settings.connections.bluesky.linkHint.allowDms: "Allow access to your direct messages"
// i18n settings.connections.bluesky.linkHint.c: when creating it if you want your Bluesky DMs in Chat.
// i18n settings.connections.bluesky.handlePlaceholder: you.bsky.social
// i18n settings.connections.bluesky.passwordPlaceholder: app password
// i18n settings.connections.bluesky.linking: Linking…
// i18n settings.connections.bluesky.link: Link Bluesky
// i18n settings.connections.bluesky.rejected: Bluesky rejected that handle/app password combination.
// i18n settings.connections.bluesky.unreachable: Couldn't reach bsky.social — network problem?
// i18n settings.connections.bluesky.linkFailed: Linking failed — check the handle and app password.
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
  styleUrls: ['../connection-page.css', './connection-bluesky.css'],
})
export class ConnectionBluesky implements OnInit {
  /** Inside a mini-app page: no Settings back link or page header. */
  readonly embedded = input(false);
  protected capabilities = inject(AnonymousCapabilities);
  protected bsky = inject(BlueskySession);
  private transloco = inject(TranslocoService);

  protected bskyHandle = signal('');
  protected bskyPassword = signal('');
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
    void this.bsky.beginOAuthConnector(identifier).catch((err: unknown) => {
      // The redirect normally never resolves; rejection means discovery or PAR failed.
      this.bskyLinking.set(false);
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

  /** Last resort: an app password, for a PDS that does not support OAuth. */
  linkBluesky(): void {
    const handle = this.bskyHandle().trim().replace(/^@/, '');
    const password = this.bskyPassword();
    if (!handle || !password || this.bskyLinking()) {
      return;
    }
    this.bskyLinking.set(true);
    this.bskyError.set(null);
    this.bsky.login(handle, password).subscribe({
      next: () => {
        this.bskyLinking.set(false);
        this.bskyHandle.set('');
        this.bskyPassword.set('');
      },
      error: (err: unknown) => {
        this.bskyLinking.set(false);
        this.bskyError.set(this.describeBskyError(err));
      },
    });
  }

  unlinkBluesky(): void {
    this.bsky.unlink();
  }

  private describeBskyError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 401) {
        return this.transloco.translate<string>('settings.connections.bluesky.rejected');
      }
      const message = (err.error as { message?: string } | null)?.message;
      if (message) {
        return message;
      }
      if (err.status === 0) {
        return this.transloco.translate<string>('settings.connections.bluesky.unreachable');
      }
    }
    return this.transloco.translate<string>('settings.connections.bluesky.linkFailed');
  }
}
