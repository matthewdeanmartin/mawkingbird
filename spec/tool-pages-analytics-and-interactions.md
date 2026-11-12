# Tool pages: Analytics for self, Find interactions

Status: v1 shipped 2026-11-12 (owner decisions 2026-11-11). Differences from the
plan below:

- **Sign-in return** already existed (`?next=` on every login door, carried
  across Mastodon and Bluesky OAuth). v1 only widened `loginDestination` to keep
  an allowlisted tool page's query string, so no new storage key was needed.
- **Analytics lookup is Mastodon-only.** Bluesky handles are not looked up yet.
- **Find interactions has no Twitter.** `TwitterApi` deliberately has no search
  until a billed response is captured as a fixture; adding one is the next step.
- **Bluesky search** runs only with a linked Bluesky account; without one the
  public author-feed scan (10 pages each) is used, and the page says so.

Both are focused tool pages (`ui/src/app/public-pages/focused-tools.json`,
public, prerendered, SEO-indexed) and follow the owner's rule for tool pages:

- **Usable anonymously.** A visitor types handles and gets a result from public
  data, with no account.
- **Always a sign-in button.** Signing in returns to the same tool page (not
  Home), with the tool's input preserved, and then offers the signed-in
  variant ("My analytics").

## Shared: sign-in that comes back

Today a focused tool page signed out is a static explainer
(`accounts/mastodon-analytics/mastodon-analytics.ts`: "Signed out, a public
page that says what you will see"). Add a return target to the login flow:

- `/login?return=/mastodon-analytics?acct=…` (and the Bluesky/Misskey doors).
  Only same-origin, path-only targets are honoured (no `//`, no scheme).
- After OAuth/app-password completes, navigate to the return target instead of
  Home. Persist it across the OAuth redirect with a registered storage key
  (`npm run check:static` storage registry).
- Anonymous already works on these pages; signing in from Anonymous uses the
  same return target.

## 1. Analytics for self (extend `/mastodon-analytics`)

There is already a signed-in `/analytics` page and the `/mastodon-analytics`
tool shell. Changes:

- **Anonymous lookup:** a handle field (`@user@host`, or a Bluesky handle).
  Read the account's public posts (anonymous public API for Mastodon; the public
  AppView for Bluesky) and show the subset of analytics that public data
  supports: posting cadence, time of day, boosts/likes/replies received per
  post, top hashtags, top conversation partners (from `in_reply_to_account_id`),
  language mix. State the sample size ("last N posts").
- **Signed in:** a "My analytics" button that fills in your own handle, plus
  the existing private analytics (follower changes etc.) where `/analytics`
  already has them. Reuse the `/analytics` panels; do not fork them.
- **Not in scope:** follower lists of other people, anything needing their
  token, notification-based metrics (see the house rule against notification
  features).

## 2. Find interactions (new tool page)

Two handles in, every visible exchange between them out, as one merged,
time-ordered list of threads.

| Network  | Method                                                                                                                                                        | Reliability                                                                        |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Bluesky  | `app.bsky.feed.searchPosts` with `from:A mentions:B` and the reverse                                                                                          | Good; search index coverage                                                        |
| Twitter  | twitterapi.io advanced search `from:A to:B` and the reverse (costs credits: show the price before running, as the thread page does)                           | Good                                                                               |
| Mastodon | **Best effort.** Scan both accounts' recent public statuses (anonymous public API, paged) for replies to (`in_reply_to_account_id`) and mentions of the other | Limited to how far back the scan goes; say so ("checked the last N posts of each") |

- Mixed networks (A on Mastodon, B on Bluesky) cannot interact natively; detect
  that and say so instead of returning an empty result.
- Results render with the ordinary status card, so Copy link, translation and
  the translated-reply warning come for free.
- Signed-in variant: "Me and…" pre-fills A with your own handle, and Mastodon
  can then also use your server's search (`from:` works for your own posts on
  servers with full-text search).
- No exit-tool framing: this is a reading tool, not a moderation report.

## Gates

New tool pages are shared implementation, not routine Feed Builder data: full
`make test`, `npm run build:mockingbird`, `make test-seo` +
`npm run test:seo:browser` (new indexable pages and sitemap entries), design
inventory check, and `check:static` for the new storage key.
