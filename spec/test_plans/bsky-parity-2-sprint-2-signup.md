# Bluesky parity 2, sprint 2: sign up with Bluesky

Written for: spec/bsky_parity.md sprint 2 (2026-11-20). Status: not run.

## Setup

A browser profile with no Mawkingbird accounts, and a fresh email address
that has never had a Bluesky account. A second run uses a browser already
signed in to a Mastodon account. Production or a preview build on its real
origin (OAuth will not return to localhost).

## Steps

### Public page

- [ ] 1. Open `/create-bluesky-account/`. It reads as a complete answer:
      what happens, what you need, questions. Desktop and phone width, light
      and dark. View source: the content is in the prerendered HTML.
- [ ] 2. The "Create a Bluesky account" button goes to the Bluesky sign-in
      page and straight on to bsky.social's sign-up form, with no extra click.

### The sign-up

- [ ] 3. On bsky.social: email, password, date of birth, handle, captcha if
      asked. Approve Mawkingbird. You return to Mawkingbird **signed in as the
      new account** and land on setup ("Welcome to Bluesky", your handle shown).
- [ ] 4. If Bluesky puts the sign-up in a queue: note exactly what happened
      (did it return, error, or park?). Record it in spec/bsky_parity.md.
- [ ] 5. Cancel the sign-up on bsky.social instead: Mawkingbird says sign-in
      was cancelled and nothing was added.

### Setup

- [ ] 6. Steps read Welcome → Your profile → Fill your Home feed → Introduce
      yourself → You're all set, with Step N of 5. No Mastodon steps (server
      privacy, languages, Twitter/Bluesky movers).
- [ ] 7. Profile: set a name, bio and picture, Next. On bsky.app the profile
      shows all three. Back, change only the bio, Next: the picture survives.
- [ ] 8. Skip on the profile step changes nothing on bsky.app.
- [ ] 9. Follow: Bluesky's suggestions list with Follow buttons; following
      three updates the count; bsky.app shows the follows.
- [ ] 10. Intro: write a post with a mention and a hashtag, Post. On bsky.app
      the mention and tag are links. Pin it: bsky.app shows it pinned.
- [ ] 11. "Go to Home" ends setup; reloading Home does not return to setup.
      Exit setup midway, then reload Home: it does not trap you (setup was
      already started).

### From a signed-in browser

- [ ] 12. Signed in to Mastodon, open `/create-bluesky-account/` and sign up.
      The new Bluesky account is added (the Mastodon one is still in the
      account switcher), and Home sends it to setup.
- [ ] 13. The login page's own "Create a Bluesky account" button does the same.
- [ ] 14. Native app: the button is not offered.

## Pass

Steps 1–3 and 6–11 must pass for release; step 4's outcome must be recorded
either way.
