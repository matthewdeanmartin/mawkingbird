---
name: server-data
description: Design how a Mawkingbird screen gets data from Mastodon, Bluesky, Misskey or another server - live calls versus the local archive/cache, failure states, links between servers, and what to do when the web can't reach something. Use when building or changing a screen or feature that fetches from a server.
---

# Getting data from servers

## Live by default

- An action that costs about one API call (open a profile, a thread, Home, pick one
  person) calls the server live.
- The local archive (Native) is only for jobs that take hundreds or thousands of
  calls and risk 429s or a ban. Those read the cache and refresh from a button or a
  slow trickle (mutuals who interact first, then mutuals, then recently active, then
  the rest).
- Count the API calls before making anything cache-first. Never make a screen
  offline-first with "Fetch" buttons. A developer once turned "support occasional low
  bandwidth" into "treat everyone as offline", and Native profiles showed only saved
  posts.

## When a call fails

No answer, a 429 or a 5xx, with a saved copy available: show the copy with a short
note and Try again. Data saver and held-back pictures happen only when the user asks
(a setting or OS data saver), never from measurement.

## Links across servers

A link carries enough to resolve anywhere: id, issuing server, and acct. "Switch to
another server" is never an acceptable error.

## When the web can't do it

When CORS or a missing API blocks a feature on the web, the notice points to
**Install Mawkingbird Native** (`routerLink="/settings/app"`), not Mawkingbird Plus.
Plus is a distant-future product. Keep existing Plus code paths working. Use new i18n
keys rather than rewording old ones. Audio and video bytes never go through the Plus
proxy; play them from the origin.

Anything new on the network also needs the native-transport skill.

## Moderation controls

A mute, block or hide-author control goes through `AuthorModeration.route()`.
Browser-local mutes exist only for the Anonymous account.
