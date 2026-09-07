import { Directive, HostListener, inject } from '@angular/core';
import { Router } from '@angular/router';
import { accountRoutePath } from './account-route';

/**
 * The `user@host` handle behind a bare link to someone's Mastodon profile.
 *
 * ## What this is for
 *
 * A bio that says "my other account: https://mas.to/@SoNotNic", or a post that
 * links one, is not a *mention*: the server only marks up handles typed as
 * `@user@host`, so a pasted profile URL arrives as an ordinary external link.
 * Clicking it opened mas.to in a new tab, dropping the reader out of the app
 * onto a server where they are signed out and cannot follow anyone.
 *
 * ## Why no lookup is needed
 *
 * The handle is already in the URL. `/@SoNotNic` on host `mas.to` *is*
 * `SoNotNic@mas.to`, and {@link parseAccountRoute} accepts a handle-only address
 * for exactly this reason — the profile page resolves it on arrival, in the one
 * call it would have made anyway. So the rewrite costs nothing at click time and
 * there is no server-issued id to guess wrong. This is why it lives here rather
 * than in {@link StatusCard}: unlike a mention, it needs no `mentions` array, so
 * a bio can use it too.
 *
 * ## What is deliberately not matched
 *
 * Only the two canonical profile shapes, anchored end to end: `/@user` and
 * `/users/user`. A status URL is `/@user/123`, and matching that would send a
 * reader to a profile when they clicked a link to a post — so a trailing segment
 * disqualifies it. Anything carrying a query or fragment is left alone as well,
 * being most likely a deep link into something this app does not model.
 */
export function mastodonProfileHandle(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return null;
  }
  if (url.search || url.hash) {
    return null;
  }
  const username =
    url.pathname.match(/^\/@([A-Za-z0-9_.-]+)\/?$/)?.[1] ??
    url.pathname.match(/^\/users\/([A-Za-z0-9_.-]+)\/?$/)?.[1];
  if (!username) {
    return null;
  }
  return `${username}@${url.hostname.toLowerCase()}`;
}

/** The in-app route for a bare profile link, or null when it is not one. */
export function profileRouteFor(href: string): (string | number)[] | null {
  const handle = mastodonProfileHandle(href);
  return handle ? accountRoutePath({ handle }) : null;
}

/**
 * Extract a hashtag name from an anchor in server-rendered HTML, or null.
 *
 * Mastodon marks these with `class="… hashtag"` and an href ending in
 * `/tags/<name>`; the anchor's visible `#text` is the fallback for servers that
 * omit the class.
 */
export function hashtagNameFrom(anchor: HTMLAnchorElement, href: string): string | null {
  const isHashtag = anchor.classList.contains('hashtag') || /\/tags?\/[^/?#]+\/?$/i.test(href);
  if (!isHashtag) {
    return null;
  }
  const fromHref = href.match(/\/tags?\/([^/?#]+)\/?$/i)?.[1];
  const raw = fromHref ?? anchor.textContent ?? '';
  const name = decodeURIComponent(raw).replace(/^#/, '').trim();
  return name || null;
}

/**
 * Keep links inside server-rendered HTML on this site where we can.
 *
 * Server-rendered `note`/`content` HTML carries absolute URLs pointing at the
 * origin instance — a hashtag in a bio is `https://mastodon.social/tags/foo`,
 * not `/tags/foo`. Following one leaves Mawkingbird entirely and drops the
 * reader on a stranger's web UI, which is rarely what clicking a hashtag in
 * *this* app is meant to do.
 *
 * Rewriting the HTML itself would mean parsing and re-serializing every bio, so
 * this intercepts the click instead: hashtags route to the in-app tag page, and
 * anything else with an explicit origin opens in a new tab rather than
 * navigating this one away.
 *
 * Marked-up *mentions* are deliberately not handled here. Resolving one needs the
 * status's `mentions` array to map a URL onto a local account id, which a bio
 * does not carry — {@link StatusCard} keeps that logic because it is the only
 * caller that has the data.
 *
 * A bare profile *URL* is the opposite case and is handled here: the handle is
 * in the link itself, so it needs no side table and works anywhere rendered HTML
 * appears. See {@link mastodonProfileHandle}.
 */
@Directive({
  selector: '[appRenderedHtmlLinks]',
})
export class RenderedHtmlLinks {
  private router = inject(Router);

  @HostListener('click', ['$event'])
  onClick(event: MouseEvent): void {
    const anchor = (event.target as HTMLElement).closest('a');
    if (!anchor) {
      return;
    }
    const href = anchor.getAttribute('href');
    if (!href) {
      return;
    }
    const tag = hashtagNameFrom(anchor, href);
    if (tag) {
      event.preventDefault();
      event.stopPropagation();
      void this.router.navigate(['/tags', tag]);
      return;
    }
    // A pasted link to somebody's profile — common in bios, where "my other
    // account" is half the genre. See mastodonProfileHandle.
    const profile = profileRouteFor(href);
    if (profile) {
      event.preventDefault();
      event.stopPropagation();
      void this.router.navigate(profile);
      return;
    }
    if (/^https?:\/\//i.test(href)) {
      event.preventDefault();
      event.stopPropagation();
      window.open(href, '_blank', 'noopener,noreferrer');
    }
  }
}
