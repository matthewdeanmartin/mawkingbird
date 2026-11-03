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
