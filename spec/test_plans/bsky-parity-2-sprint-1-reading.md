# Bluesky parity 2, sprint 1: read everything bsky.app shows

Written for: spec/bsky_parity.md sprint 1 (2026-11-20). Status: not run.

## Setup

**Bluesky A** signed in to Mawkingbird as a Bluesky-first account, and the
same account open on bsky.app in another tab to compare. **Bluesky B** to
post test content. Repeat the starred (★) steps with A as a Bluesky connector
under a Mastodon account.

## Steps

### Galleries

- [ ] 1. ★ On bsky.app as B, post 6 to 10 images in one post (a gallery), with
      alt text on the first. In Mawkingbird as A, the post shows every image,
      in order, at their own shapes; the first has its alt text.
- [ ] 2. As B, quote any post and attach a gallery. A sees the quote card and
      every image.

### Labels and your Bluesky moderation settings

- [ ] 3. ★ On bsky.app as A, Settings → Moderation: leave adult content
      **off**. As B, post an image and self-label it "Adult" (porn). It does
      not appear in A's Home or B's profile in Mawkingbird; opened from a link
      or thread, it sits behind "Hidden by your Bluesky moderation settings".
- [ ] 4. On bsky.app, turn adult content **on** and set "Sexually suggestive"
      to Show. Reload Mawkingbird: a post self-labelled Suggestive by B shows
      its image without a blur. Set it to Warn: the image blurs, with a click
      to reveal.
- [ ] 5. "Graphic media" set to Warn: B's graphic-media post blurs its image
      only; the text stays readable.
- [ ] 6. Subscribe A to a third-party labeler with its own labels on bsky.app
      (one that blurs content). A post it labels collapses in Mawkingbird with
      the label's English name in the "Filtered:" stub, and Show anyway works.
      Set that label to Hide on bsky.app: the post leaves Home after a reload.
- [ ] 7. A's own labelled posts are never hidden or collapsed for A.
- [ ] 8. Nothing on bsky.app's settings changed because of Mawkingbird (this
      sprint only reads them).

### Verification, bots and profiles

- [ ] 9. ★ A verified account (for example bsky.app's own) shows the Bluesky
      check, titled "Verified on Bluesky", next to its name in posts and on its
      profile, whatever Settings → check-mark mode says, and still shows with
      Wellness hiding counts. A trusted verifier shows "Trusted verifier on
      Bluesky".
- [ ] 10. An account that marked itself automated on bsky.app shows the bot
      marker.
- [ ] 11. A profile with pronouns, a website and profile links shows them as
      profile fields, links opening in a new tab. A plain http:// link shows as
      text.
- [ ] 12. A profile that is live on Bluesky shows "🔴 Live now" with the stream
      link; after the live status ends, it is gone on reload.

### Notifications

- [ ] 13. If A has notifications on for B in bsky.app (the bell), B's new post
      appears in A's notifications as "posted", with the post.
- [ ] 14. Verification changes (if one can be arranged) read "verified your
      account" / "removed your verification", not a raw word.

## Pass

All steps checked, or failures noted with the post or profile link.
