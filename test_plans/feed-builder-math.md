# Math starter kit: manual checks

Approved editions: `/math-on-mastodon/`, `/de/mathematik-auf-mastodon/`,
`/fr/mathematiques-sur-mastodon/`. Entry point: `/communities/`.

1. Open each edition signed out. Check its heading, language, account list,
   Mathstodon server link and links to the other two editions.
2. Open Builder. Confirm NumberTheory is available; uncheck it and confirm the
   selection changes. German and French offer local tags and future tags.
3. Open Preview and shuffle the sample. Check the loading indicator, empty-source
   handling, and that no account is needed to read public posts.
4. Open Flooding. Treat any warnings as sampled author shares, not a judgement
   about Mathstodon or all future posts. Confirm optional local mutes work.
5. Sign in with a test Mastodon account and return to the same edition. Follow
   a small selected set of tags and people; check progress and already-followed
   counts. Do not bulk-follow from the test unless intentionally desired.
6. Convert selected followed people to the mathematics list. Confirm hashtags
   remain Home follows and are not described as Mastodon list members.
7. For German/French, select a future tag and check its suggestion in the composer.
8. Check desktop and narrow mobile layout. Refresh the deep link and verify
   canonical/hreflang metadata still identifies only the three approved editions.

Automated gates are recorded in `sprint/feed-builder-math.md`. These live-account
checks require the tester's own account and are not claimed as automated results.
