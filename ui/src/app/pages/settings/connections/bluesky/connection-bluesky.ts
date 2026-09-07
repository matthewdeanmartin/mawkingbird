import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { BlueskySession } from '../../../../providers/bluesky/bluesky-session';
import { AnonymousCapabilities } from '../../../../providers/anonymous/anonymous-capabilities';
import { expiryLabel } from '../expiry-label';
import { CONNECTION_SCOPE_COPY } from '../connection-catalog';
import { StorageBadge } from '../storage-badge';

// i18n settings.connections.backLink: ‹ All connections
// i18n settings.connections.bluesky.title: 🦋 Bluesky
// i18n settings.connections.bluesky.intro: Your Bluesky timeline is merged into home, and replies, likes and reposts on 🦋 posts go back to Bluesky.
// i18n settings.connections.bluesky.anonymousNote: This works while you're browsing anonymously — the app password goes straight to Bluesky and doesn't involve a Mastodon account. Your Bluesky posts merge into home, and you can reply, like and repost them. Bluesky DMs are the exception: those live in Chat, which anonymous sessions don't have.
// i18n settings.connections.bluesky.unlink: Unlink
// i18n settings.connections.bluesky.unlinkNote: Unlinking forgets the tokens here — you can also revoke the app password on bsky.app.
// i18n settings.connections.bluesky.expiresOn: This link is dropped and the tokens deleted from this browser on {{date}}.
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
/** Settings → Connections → Bluesky. App-password link; the only read/write connector. */
@Component({
  selector: 'app-connection-bluesky',
  imports: [FormsModule, RouterLink, StorageBadge, TranslocoPipe],
  templateUrl: './connection-bluesky.html',
  styleUrls: ['../connection-page.css', './connection-bluesky.css'],
})
export class ConnectionBluesky implements OnInit {
  protected capabilities = inject(AnonymousCapabilities);
  protected bsky = inject(BlueskySession);
  private transloco = inject(TranslocoService);

  protected bskyHandle = signal('');
  protected bskyPassword = signal('');
  protected bskyLinking = signal(false);
  protected bskyError = signal<string | null>(null);

  protected readonly expiryLabel = expiryLabel;

  /** The storage-scope sentence shown under the heading. */
  protected readonly scopeDetail = CONNECTION_SCOPE_COPY.account.detail;

  ngOnInit(): void {
    // Deep-link case: re-check against a policy shortened on the catalog page.
    this.bsky.enforceLifetime();
  }

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
