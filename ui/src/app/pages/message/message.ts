import { Component, inject, OnInit, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Auth } from '../../auth';
import { StatusCard } from '../../status-card/status-card';
import { Status } from '../../models';

// i18n message.shared: Shared message
// i18n message.subtitle: A message shared as a short link
// i18n message.unreadable: This link doesn’t carry a readable message.
// i18n message.back: ← Back to Mawkingbird
import {
  messageStatus,
  messageStatusRouteRef,
  parseMessageParams,
  parseMessageStatusRouteRef,
} from '../../providers/paste/message-payload';

/**
 * Landing page for a message shared as a short link.
 *
 * A shortener stores the redirect target, so opening a tinyurl.com/xxxx link
 * 301-redirects straight here to /message/message-status.… . Legacy
 * /message/?m=…&cw=… links remain readable. We decode either representation
 * into a Mastodon status — no network needed. (There's deliberately no expand
 * step: TinyURL has no CORS-open resolve API, and the redirect already delivers
 * the target, so a bare short code is never handed to this page.)
 *
 * By default we don't linger here: we re-encode the payload into a native
 * `/statuses/:id` segment and redirect, so the message opens in the same
 * "show a post" thread view every other status uses — for anyone, signed in or
 * not. This lite page stays as a fallback that still renders the post inline
 * (e.g. if the redirect is suppressed).
 *
 * Deliberately outside the auth shell so a shared link opens for anyone.
 */
@Component({
  selector: 'app-message',
  imports: [StatusCard, RouterLink, TranslocoPipe],
  templateUrl: './message.html',
  styleUrl: './message.css',
})
export class MessagePage implements OnInit {
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private auth = inject(Auth);

  protected status = signal<Status | null>(null);

  ngOnInit(): void {
    const params = new URLSearchParams(window.location.search);
    const routeRef = this.route.snapshot.paramMap.get('id') ?? '';
    const payload = parseMessageStatusRouteRef(routeRef) ?? parseMessageParams(params);
    if (!payload) {
      this.status.set(null);
      return;
    }
    // Show the message as a native post: hand it to the in-shell thread page via
    // an encoded status ref. `?lite=1` opts out and keeps the inline view here.
    if (params.get('lite') !== '1') {
      // The thread page lives behind the auth shell. A signed-in (or already
      // anonymous) visitor keeps their session — they're just reading a post,
      // not opting into the anonymous experience. Only a session-less stranger
      // is dropped into anonymous mode, on the default server (mastodon.social),
      // so the shell can render around the post.
      if (!this.auth.isAuthenticated) {
        this.auth.enterAnonymous();
      }
      this.router.navigate(['/statuses', messageStatusRouteRef(payload)], { replaceUrl: true });
      return;
    }
    this.status.set(messageStatus(payload, this.selfUrl(params)));
  }

  /** The canonical /message/ URL for these params, used as the post's permalink. */
  private selfUrl(params: URLSearchParams): string | null {
    if (params.get('m') === null) return null;
    try {
      return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
    } catch {
      return null;
    }
  }
}
