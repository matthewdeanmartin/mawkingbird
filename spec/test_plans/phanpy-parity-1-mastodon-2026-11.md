# Phanpy parity 1: notes, reports, lists, QR, embed (Mastodon)

Written for: Phanpy parity items 7, 20, 21, 23 and 24 (2026-11-10). Status: not run.
Spec: `spec/phanpy_parity.md`.

## Setup

A signed-in Mastodon account. A second account on a **different** server you
can look at (for forwarding), one on the same server, and a phone with a
camera (or a laptop webcam). Do not send real reports to accounts that have
done nothing wrong: use a test account you control, or stop at the
confirmation step.

## Steps

### Private account notes (7)

- [ ] 1. Open another person's profile → ••• → **Add private note**. Type two
      lines, Save. The note shows under their @handle with "Your private note".
- [ ] 2. Reload the page: the note is still there (it came from the server).
- [ ] 3. Open the same profile in Mastodon's own web UI: the same note is in
      its note field.
- [ ] 4. ••• → **Edit private note** → Delete note: the note box disappears.
- [ ] 5. Your own profile, a Bluesky profile and Anonymous mode show no note item.

### Report rules and forwarding (24)

- [ ] 6. On a post by a remote account → ••• → Report post. Choose
      `violation`: your server's rules appear as checkboxes.
- [ ] 7. Confirm with no rule ticked: "Choose at least one rule…" and nothing
      is sent (DevTools → Network: no `/api/v1/reports`).
- [ ] 8. The "Also send an anonymous copy to <their server>" box is unticked by
      default; it does not appear when reporting someone on your own server.
- [ ] 9. (Test account only) Tick a rule and forwarding, Confirm. The request
      body has `rule_ids` and `forward: true`; your server's moderation queue
      shows the rule.

### List rename and replies (23)

- [ ] 10. Lists → type a name, choose "No replies" in the new dropdown, Create.
      In Mastodon's web UI the list's reply setting is "No one".
- [ ] 11. Open a list → Members → **Rename / replies…**. Rename it and choose
      "Replies to anyone you follow". Save: the page title changes and the
      posts reload.
- [ ] 12. A list that was "List only" (hidden from Home) is still List only
      after the rename. Members are unchanged.

### Profile QR (21)

- [ ] 13. Your profile → ••• → **QR code**. Scan the code with the phone's
      camera app: it opens your profile URL.
- [ ] 14. Copy link copies the same URL.
- [ ] 15. **Scan a code** asks for the camera, then shows the preview. Point it
      at someone's Mastodon profile QR (e.g. one from Phanpy or Mastodon's
      share): "Found …", then **Open profile** opens them in Mawkingbird.
- [ ] 16. Scan a QR code that is a post link or Wi-Fi code: "That code is not a
      profile link". Open profile stays disabled.
- [ ] 17. Close the dialog while scanning: the camera light turns off.
- [ ] 18. Firefox or Safari (no native BarcodeDetector): scanning still works.

### Embed post (20)

- [ ] 19. A public post → ••• → **Embed post…**. The preview shows the text,
      author, date link and media. Copy HTML and paste it into a blank `.html`
      file: it renders the same with no scripts.
- [ ] 20. A post with a content warning: the HTML wraps it in `<details>`.
- [ ] 21. A post with images: each `<img>` keeps its alt text.
- [ ] 22. A followers-only post and a Bluesky post have no Embed item.
