# Usability feedback, September 2026

## Sprint 1 — ready for a user test

- Login transition: saved sessions go straight home; OAuth shows a progress screen during exchange, verification and home navigation. The chooser also hides its controls while redirecting. Successful sign-in replaces the callback history entry and avoids an intermediate navigation.
- Issue 1: full-access/read-only radio inputs no longer inherit text-field dimensions and margins.
- Issue 2: empty or unsupported collections point to the bundled starter packs, with copy explaining that these help find people to follow.
- Issue 4: the reply composer has its own Reply button; the reply count opens the thread for signed-in and anonymous readers where supported.
- Issue 9: Tweet view explicitly returns to the feed; selecting Home again exits analytics and other alternate views.

Try a fresh OAuth sign-in and a return visit, including an add-account flow. During the callback, login controls should stay absent until either home opens or an error restores the form. Network exchange and verification still take time; production sign-in latency needs a real-account check.

Open an empty Collections section and follow Browse starter packs. On a post, compare Reply with the replies count. From Home analytics, try both Tweet view and the main Home link.

Validation: 297 targeted tests and the full `make test` gate (7,476 tests, all passing, none skipped); lint and i18n checks pass. `npm run build:mockingbird` passes, including mock-leakage and lazy-data checks; initial JavaScript and CSS total 874.43 kB against the 1 MB limit. Browser checks confirmed radio alignment and the starter-pack link. Real-account OAuth timing remains for the user trial.

## Sprint 2 — wait for feedback before implementing

- Issue 3: verify current API support for removing yourself from another person's collection and expose the supported action.
- Issue 5: audit remaining browser alerts and replace them with the appropriate dialogs or inline feedback.
- Issue 6: refresh relationships, Follow/Unfollow buttons and the profile friends count after bulk following.
- Issue 7: make repeated Home clicks refresh like More and show a transient no-new-posts result.
- Issue 8: add the existing daily-frequency lawn chart to home-feed analytics, including sparse feeds.
- Issue 10: add `https://mastodon.social/@mawkingbird` with `rel="me"` alongside mistersql in index.html.

Keep this sprint boundary so the user can test the first batch before the second.
