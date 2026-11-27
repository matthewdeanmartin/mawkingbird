# Bluesky connector OAuth

Written for: commit `649a34d4a` and later. Status: not run.

Settings → Connections → Bluesky used to accept only an app password. It now
leads with OAuth; the app password is the last resort.

## Setup

Sign in to Mawkingbird with **Mastodon M**. Make sure no Bluesky connection is
linked (Unlink if one is).

## Steps

- [ ] 1. Open Settings → Connections → Bluesky. The first button is
      **Continue with Bluesky**. "Use a specific handle or another PDS" and
      "Use an app password instead" are closed sections below it.
- [ ] 2. Choose **Continue with Bluesky**. Bluesky's own page opens. Sign in as
      **Bluesky A** with your normal password and approve.
- [ ] 3. You return to the Bluesky connection page (not Home, not the sign-in
      page), linked as Bluesky A. You are still signed in as Mastodon M.
- [ ] 4. Home shows Bluesky A's timeline merged in. Like and reply to a Bluesky
      post; both appear on bsky.app.
- [ ] 5. Open Chat. Bluesky A's direct messages appear (OAuth includes DM
      access; no checkbox needed).
- [ ] 6. Reload the page. The connection is still linked.
- [ ] 7. Unlink. The note says Mawkingbird asks Bluesky to revoke access. On
      bsky.app → Settings → Privacy and security, Mawkingbird's access is gone.
- [ ] 8. Open "Use a specific handle or another PDS", enter Bluesky A's handle,
      choose **Continue**. Same result as step 3.
- [ ] 9. Cancel on Bluesky's page instead of approving. The callback page says
      it was cancelled and its button reads **Back to the Bluesky connection**,
      returning to the connection page.
- [ ] 10. Last resort: unlink, open "Use an app password instead", link with an
      app password. It still works.
- [ ] 11. Start from the Crosspost page's embedded connector (signed in with
      Mastodon M). After approving, you return to the Crosspost page.

## Also check

- [ ] Crosspost page step 2 says to approve access on Bluesky, in English and
      one other language (for example `/de/`).
- [ ] Sign out → "remove everything" dialog for a Bluesky-first account no
      longer says you need an app password to return.

## Findings

_None yet._


## Cross-deployment session loss (2026-11-26)

Production report: build 421d7da0e91278e15c260721df925c2315184497,
repeated `The session was deleted by another process` on preferences, profile,
and notifications. Operator regularly rotates between `/`, `/canary/`, `/test/`.
The log establishes missing storage, not which earlier operation deleted it.
Cloudflare beacon CSP rejection is unrelated to the OAuth storage path.

Confirmed in installed oauth-client-browser 0.5.9: BrowserOAuthClient hardcodes
`@atproto-oauth-client`, keyed only by DID. Our deployments have distinct client
IDs, so their callbacks overwrite each other's credentials. Refresh with another
client's grant can fail and delete that shared row. Upstream source inspected:
https://github.com/bluesky-social/atproto/blob/main/packages/oauth/oauth-client-browser/src/browser-oauth-client.ts

Local fix: use the SDK public OAuthClient with IndexedDB and Web Locks scoped by
full client ID. Keep one shared session per DID *within* a client. PKCE, DPoP,
refresh and protocol validation remain SDK-owned. Removing an identity or one
connector preserves the grant when another connector/identity owns it.
`revoke:requested` now distinguishes explicit app revocation from SDK failures.

Migration deliberately does not copy ambiguous old rows (they have no client-ID
provenance). Expect one new authorization per DID per deployment after release.
Reload old tabs; old builds still collide with each other in the old store, but
cannot delete new storage. No OAuth client IDs or callback URLs changed. No
production deployment or real-account authorization was performed in this fix.

Regression: `cd ui && npm run test:bluesky-oauth:browser` uses real Chromium
IndexedDB and CryptoKeys across three paths, same-DID isolation, deletion isolation,
same-client tab sharing, and concurrent real SDK refresh with a fixture issuer.
The normal client-build workflow runs it in Chromium and Firefox
(`OAUTH_TEST_BROWSER=firefox`); both passed locally. The test also reproduces
the overwrite/deletion using the installed old browser wrapper before checking
the replacement. Unit tests cover identity removal while
a connector remains, connector removal while an identity remains, and two
connectors sharing a DID. No existing tests removed.

Release smoke test: sign into the same DID on all three deployments, use it as
primary and as a Mastodon connector, rotate tabs and load notifications/profile.
Repeat after access-token expiry and after unlinking only one role. Verify the
other role remains usable and no unexpected `revoke:requested` occurs. These
real-PDS checks remain necessary; fixture refresh does not certify external
provider behavior or prove the exact historical deletion event.
