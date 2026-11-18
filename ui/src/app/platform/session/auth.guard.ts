import { inject } from '@angular/core';
import { defaultServer } from '../http/home-server';
import { CanActivateFn, CanMatchFn, Router } from '@angular/router';
import { Auth } from './auth';
import { radioAccount, radioPostRef } from '../../reading/radio-links';
import { Server } from '../http/server';
import {
  accountHandleLinkMatcher,
  isTwitterHandle,
  mastodonPostLinkMatcher,
} from '../../posts/copy-link/deep-links';

/**
 * Matches only a signed-in Mastodon account with its own token.
 *
 * For routes that have a public twin under the same path: everyone else —
 * signed out, Anonymous, Bluesky-primary — falls through to the public route
 * rather than being redirected away from the page they asked for.
 */
export const mastodonSignedInMatch: CanMatchFn = () => {
  const auth = inject(Auth);
  return !auth.lacksMastodonToken && !auth.isAnonymous;
};

/** Matches any signed-in identity, Mastodon or Bluesky; not Anonymous. Same fall-through. */
export const signedInMatch: CanMatchFn = () => {
  const auth = inject(Auth);
  return auth.isAuthenticated && !auth.isAnonymous;
};

export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(Auth);
  const router = inject(Router);
  if (auth.isAuthenticated) {
    return true;
  }
  // Public content links must also work on a fresh browser. Preserve a chosen
  // instance for legacy numeric IDs; portable public references carry their own.
  const link = new URL(state.url ?? '/', 'https://app.invalid');
  // Older /radio share links now open these pages: a shared playlist (its
  // thread's first post) and an account's recordings.
  const publicRadio =
    (link.pathname === '/radio' &&
      !!(
        radioAccount(link.searchParams.get('acct')) || radioPostRef(link.searchParams.get('post'))
      )) ||
    (link.pathname === '/playlists/shared' && !!radioPostRef(link.searchParams.get('post'))) ||
    (link.pathname === '/singles/find' && !!radioAccount(link.searchParams.get('acct')));
  // The project's pages and in-app legal hub must open for a fresh visitor.
  // Sending them to `/` would make the dispatcher land on /home instead.
  const projectPage =
    /^\/(app\/(about|funding|legal)|credits|collections\/starter(\/[\w-]+)?)\/?$/.test(
      link.pathname,
    );
  // Search works anonymously, and the /mastodon-search and /bluesky-search tool
  // pages hand their query straight to it: a front page with a sign-in question
  // in between is the distraction those pages exist to remove.
  const search = link.pathname === '/search';
  // A shared Watch link: a public post's video, or a bare YouTube video. The
  // page itself loads the post from the server the link names.
  const publicWatch =
    link.pathname === '/watch' &&
    (link.searchParams.has('post') || link.searchParams.has('youtube'));
  // A shared YouTube channel page: its uploads come from the channel's public
  // feed, so a visitor needs no account (spec/youtube-client.md, S3).
  const publicChannel = /^\/videos\/channel\/UC[\w-]{22}\/?$/.test(link.pathname);
  // The YouTuber kits: public kit pages send visitors here to follow and subscribe.
  const youtuberKits = link.pathname === '/videos/starters';
  // A starter pack and a saved Bluesky feed/list are public AppView reads.
  const publicBlueskyPage =
    /^\/bluesky\/starter-packs\/[^/]+\/[^/]+\/?$/.test(link.pathname) ||
    /^\/feeds\/bluesky\/[^/]+\/?$/.test(link.pathname);
  // Blog mode's front door, a shared blog (`/blog/@user@server`) and one of its
  // posts (`…/<id>`): read from the author's own server, so nothing here needs
  // a session. Not /blog/me.
  const publicBlog = /^\/blog(\/@[^/@]+@[^/@]+(\/[A-Za-z0-9]+)?|\/search)?\/?$/.test(link.pathname);
  // Unbird, Twitter to Mastodon (spec/sprint/unbird-2026-11.md): the archive is
  // read on the device and people are found with public searches, so a link
  // from the public Twitter pages, or a shared /unbird/, needs no account.
  // Posts and Profile ask for one themselves, after the visitor has seen results.
  const publicUnbird = /^\/unbird(\/(people|posts|archive|profile))?\/?$/.test(link.pathname);
  const segments = router.parseUrl(state.url ?? '/').root.children['primary']?.segments ?? [];
  const parts = segments.map((segment) => segment.path);
  const copiedLink =
    !!mastodonPostLinkMatcher(segments) ||
    !!accountHandleLinkMatcher(segments) ||
    (parts[0] === 'bsky' &&
      parts[1] === 'profile' &&
      !!parts[2] &&
      (parts.length === 3 || (parts.length === 5 && parts[3] === 'post' && !!parts[4]))) ||
    (parts[0] === 'twitter' &&
      isTwitterHandle(parts[1] ?? '') &&
      (parts.length === 2 ||
        (parts.length === 4 && parts[2] === 'status' && /^\d+$/.test(parts[3]))));
  if (
    publicRadio ||
    projectPage ||
    search ||
    publicWatch ||
    publicChannel ||
    youtuberKits ||
    publicBlueskyPage ||
    publicBlog ||
    publicUnbird ||
    copiedLink ||
    /^\/(read|statuses|accounts|tags)\/[^/?#]+/.test(state.url ?? '')
  ) {
    auth.enterAnonymous(inject(Server).baseUrl() || defaultServer());
    return true;
  }
  // The front page, not the login page: a stranger who has just arrived should
  // see what this app is before being asked to choose a server and grant scopes.
  // `/` offers both "log in" and "continue without logging in".
  return router.parseUrl('/');
};
