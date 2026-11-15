# Phanpy parity 2: featuring, familiar followers, image descriptions (Mastodon)

Written for: Phanpy parity items 8, 9 and 14 (2026-11-10). Status: not run.
Spec: `spec/phanpy_parity.md`.

## Setup

A signed-in Mastodon account that follows a few people. A Mastodon 4.4+ server
if you have one, and an older one if you can (for the `/pin` fallback). For
step 9, photos with a description saved in their metadata: write one in
Lightroom/Photoshop (Caption), digiKam, macOS Preview (Tools → Show Inspector →
description), or `exiftool -ImageDescription="A heron" photo.jpg`, and one
straight off a camera whose description says "OLYMPUS DIGITAL CAMERA" or
similar, if you have one.

## Steps

### Featuring accounts on your profile (8)

- [ ] 1. Profile of someone you follow → ••• → **Feature on my profile**. Open
      your own profile: they appear under "Featured by you". Mastodon's web UI
      shows them as featured too.
- [ ] 2. Back on their profile, ••• now says **Stop featuring on my profile**;
      choose it. They disappear from your featured list after a reload.
- [ ] 3. On your own profile, **Remove** beside a featured account takes it
      off the list at once, and it stays off after a reload.
- [ ] 4. Someone you do not follow: no Feature item.
- [ ] 5. (Pre-4.4 server) Steps 1–2 still work; DevTools shows `/endorse`
      404 followed by `/pin` succeeding.

### Familiar followers (9)

- [ ] 6. A profile followed by people you follow shows "Followed by people you
      follow: …" under the counts, with up to three names and "and N more you
      follow". Each name opens that person's profile.
- [ ] 7. Your own profile, and a profile none of your follows follow, show no
      such line. Bluesky, Misskey and Anonymous profiles show none either.
- [ ] 8. A mutual (you follow each other) with no shared follows shows
      "Mutuals" on the button but no familiar-followers line.

### Image descriptions from metadata (14)

- [ ] 9. Compose → attach the described photo: the alt-text box fills in with
      its description and a note says to check it.
- [ ] 10. Edit the text: the note disappears and your edit is what gets posted.
- [ ] 11. Type a description quickly while a large photo is still uploading:
      your typing is kept, not replaced.
- [ ] 12. The camera-default photo ("OLYMPUS DIGITAL CAMERA"): the box stays
      empty.
- [ ] 13. A PNG screenshot and a WebP from a phone with descriptions (if you
      have them) fill in the same way; an iPhone HEIC does not (known gap).
- [ ] 14. Bluesky-only post with the described photo: also prefilled.
