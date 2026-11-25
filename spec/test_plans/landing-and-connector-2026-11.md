# Landing pages and the Mastodon connector (2026-11-25)

Needs a Bluesky account, a Mastodon account, and a private window per section.
Faked OAuth passed in a browser; nothing here has met a real server.

## Connector, web

- [ ] Signed in with Bluesky only, open `/twitter-to-mastodon/`, press the header
      button. The page says you stay signed in as your Bluesky handle.
- [ ] Sign in on your server. You come back to the tool, still your Bluesky account
      in the header menu, and no Mastodon account was added to the switcher.
- [ ] Reload. Still connected. Home shows both networks.
- [ ] `/turn-off-boosts-mastodon/`, `/mastodon-friends-rss-feeds/` and
      `/mastodon-analytics/` work on your Mastodon follows (they used the Bluesky
      id before).
- [ ] Settings, Connections, Mastodon: Sign out, then "Sign in with Mastodon" again;
      you return to that page. Disconnect works.
- [ ] `/crosspost/` under Bluesky: "Sign in with Mastodon" returns to `/crosspost/`.
      Under Mastodon, connecting Bluesky returns to `/crosspost/` too (it used to
      land in Settings).
- [ ] Press Deny on your server: "Sign-in was cancelled", and signing in again still
      returns to the tool.
- [ ] "Use Mastodon as a separate account instead" signs in and switches.
- [ ] Account menu, Add account, Mastodon, from a Bluesky and from a Misskey account.
      (Both were refused by the app before this change.)

## Connector, Native

- [ ] The same first three steps. Quit and reopen: still connected.
- [ ] Posting and following through the connector.
- [ ] Disconnect, then connect again.

## Visitors

- [ ] New window: `/mastodon-search/`, search, then open mawkingbird.com. The preview
      and the welcome box appear, with "Back to".
- [ ] "Continue without logging in", then mawkingbird.com again: your Home, no box.
- [ ] As that reader, a tool's "Open the app" opens the app, and Analytics in the menu
      offers to sign in and come back.

## Findings
