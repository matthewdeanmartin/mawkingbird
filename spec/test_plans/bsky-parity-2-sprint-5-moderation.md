# Bluesky parity 2, sprint 5: moderation services (and app-password phase-out)

Written for: spec/bsky_parity.md sprint 5 and the app-password phase-out
(2026-11-21). Status: not run.

## Setup

**Bluesky A** (Bluesky-first) and a Mastodon account with a Bluesky connector,
both in Mawkingbird; bsky.app open as A. A subscribed to one third-party
moderation service that defines its own labels.

## App-password phase-out

- [ ] 1. Bluesky sign-in page and Settings → Connections → Bluesky: no
      app-password form. Settings → Feature flags → "Bluesky app passwords
      (legacy)" on: the forms come back. Off again.
- [ ] 2. An account still linked with an app password: the connection page
      says so and offers "Switch to Bluesky sign-in". Use it: Bluesky's page,
      approve, back here; the notice is gone, everything still works, and
      the connector/identity now says "Unlinking … asks Bluesky to revoke".
- [ ] 3. Do step 2 for both a connector and a Bluesky-first identity.

## Content filters

- [ ] 4. Settings → Bluesky moderation → Content filters. Adult content off:
      Adult content / Suggestive / Graphic media read Hide and are locked.
      bsky.app agrees.
- [ ] 5. Turn adult content on, set Suggestive to Show: a suggestive image no
      longer blurs in Home. bsky.app shows the same setting.
- [ ] 6. The third-party service's labels are listed under "Labels from …";
      set one to Hide: a post it labels leaves Home after a refresh.

## Reports

- [ ] 7. Report a Bluesky post: "What's wrong?" lists grouped reasons; pick
      "Scam". With a service subscribed, "Send to" lists Bluesky and it.
- [ ] 8. Send one to Bluesky and one to the service. Both succeed.
- [ ] 9. A Mastodon report still shows the old category list.

## Your reports and age

- [ ] 10. Your reports lists the reports from step 8 (Bluesky's one at least)
      with reason, kind and date; Show more appears past 50.
- [ ] 11. If the account has a standing, it shows. Age verification links to
      bsky.app.

## Pass

All steps checked; note any report that fails with Bluesky's message.
