# Usability feedback, September 2026

## Sprint 1 — ready for a user test

- Login transition: saved sessions go straight home; OAuth shows a progress screen during exchange, verification and home navigation. The chooser also hides its controls while redirecting. Successful sign-in replaces the callback history entry and avoids an intermediate navigation.
- Issue 1: full-access/read-only radio inputs no longer inherit text-field dimensions and margins.
- Issue 2: empty or unsupported collections point to the bundled starter packs, with copy explaining that these help find people to follow.
- Issue 4: reverted after user feedback. For signed-in users who can reply, the icon and 0/n replies count again open the inline mini composer. Anonymous readers keep the original thread-link behavior.
- Issue 9: Tweet view explicitly returns to the feed; selecting Home again exits analytics and other alternate views.

Try a fresh OAuth sign-in and a return visit, including an add-account flow. During the callback, login controls should stay absent until either home opens or an error restores the form. Network exchange and verification still take time; production sign-in latency needs a real-account check.

Open an empty Collections section and follow Browse starter packs. On a post, compare Reply with the replies count. From Home analytics, try both Tweet view and the main Home link.

Validation: 297 targeted tests and the full `make test` gate (7,476 tests, all passing, none skipped); lint and i18n checks pass. `npm run build:mockingbird` passes, including mock-leakage and lazy-data checks; initial JavaScript and CSS total 874.43 kB against the 1 MB limit. Browser checks confirmed radio alignment and the starter-pack link. Real-account OAuth timing remains for the user trial.

## Sprint 2 — ready for a user test

- Issue 3: verify current API support for removing yourself from another person's collection and expose the supported action.
- Issue 5: audit remaining browser alerts and replace them with the appropriate dialogs or inline feedback.
- Issue 6: refresh relationships, Follow/Unfollow buttons and the profile friends count after bulk following.
- Issue 7: make repeated Home clicks refresh like More and show a transient no-new-posts result.
- Issue 8: add the existing daily-frequency lawn chart to home-feed analytics, including sparse feeds.
- Issue 10: add `https://mastodon.social/@mawkingbird` with `rel="me"` alongside mistersql in index.html.

Pause at this sprint boundary for the next user trial.

The user approved sprint 2 after requesting the replies-control reversal.

- Collection removal is supported from Mastodon 4.6 / API version 10: [official revoke endpoint](https://docs.joinmastodon.org/methods/collections/#revoke). Added a removal command to each “Collections featuring me” row, with confirmation and recoverable error feedback. On the collection page, membership now comes from item metadata even when its expanded account is absent; the existing removal command also gets confirmation and feedback.
- The original alert audit was too narrow. Replaced all native confirmation calls, including unqualified `confirm()`, with a shared themed app dialog service. Bulk follow retains its account count, notification warning, Cancel and Follow actions. The service also supports alert and text-input dialogs, keyboard focus trapping/restoration, Escape cancellation and duplicate-request protection. Destructive actions and optional pre-post reminders retain their confirmations.
- Both bulk-follow runners now write returned relationships to the shared state. This preserves pending requests and immediately updates buttons. A completed or partially successful run refreshes profile counts from the server; a late response cannot overwrite another active account.
- Repeated Home clicks now perform the same refresh as More and return to Tweet view. A settled refresh with no unseen posts shows “No new posts”; a refresh containing new posts clears it. Repeated clicks during the request do not cancel and restart it.
- Feed analytics now includes a posting calendar using the existing account heatmap calculation. It spans the loaded sample, preserving quiet days between sparse posts, and updates as the sample changes.
- Added the Mawkingbird Mastodon `rel="me"` link alongside mistersql.

Try a bulk follow and cancel it first: the app-styled dialog must name the count and explain notifications without sending any requests. Then accept a small batch and check both the member buttons and profile friends count. Also try a destructive action with Cancel and Escape, and check that keyboard focus returns to its trigger. Native alert/confirm/prompt calls are absent from production TypeScript; the shared dialog service supplies all three interactions.

For Home, open Analytics, click Home, and click Home again after the refresh settles. It should show Tweet view and report when there are no new posts. In Analytics → Timing, check the posting calendar and load more posts to extend the sample. On a supporting Mastodon server, test Remove me under Collections featuring me.

Browser checks verified app dialog rendering/cancellation/focus restoration, the posting calendar, and Home returning from Analytics to Tweet view while refreshing. Production build and lazy-data checks pass; initial JavaScript and CSS total 876.53 kB against the 1 MB limit. Lint and i18n checks pass. The broad format check reports 18 unchanged files; edited files were formatted.

Final validation: full `make test` passed, with 7,489 tests passing, none failed or skipped, and the protected runtime test inventory intact.
