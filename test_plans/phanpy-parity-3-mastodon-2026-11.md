# Phanpy parity 3: profile images, collections, annual reports (Mastodon)

Written for: Phanpy parity items 18 and 25 (2026-11-10). Status: not run.
Spec: `spec/phanpy_parity.md`.

## Setup

A signed-in Mastodon account. Collections and image descriptions need a
Mastodon 4.6 server; annual reports need 4.3+ (generation 4.6+). An older
server is useful to confirm the fallbacks. Use a throwaway avatar for step 3,
and do not send a real report in step 11 unless the collection deserves one.

## Steps

### Profile images (18)

- [ ] 1. Settings → Public profile shows your current avatar and header. An
      account without a header shows no header preview and no Remove header.
- [ ] 2. (4.6) Describe your avatar, Save changes. Reload: the description is
      still there, and your profile picture's alt text uses it.
- [ ] 3. Remove avatar → confirm. Your profile shows the server default; the
      avatar description is cleared. Cancelling the confirmation removes nothing.
- [ ] 4. Upload a new avatar and save: everything else on the form still works.
- [ ] 5. (Pre-4.6 server) No description fields; Remove still works on 4.2+.

### Collections (25a, 25b)

- [ ] 6. Lists → Collections → type a name → **More options…**: the dialog has
      the name filled in. Choose a language, Mark as sensitive, Create. The new
      collection is in the list.
- [ ] 7. Open it → **Edit collection…**: the saved language and sensitivity are
      shown. The page shows a "Sensitive" badge.
- [ ] 8. Rename it and turn sensitivity off; Save. The title updates, the badge
      goes, and Mastodon's web UI agrees after a reload.
- [ ] 9. Quick Create (without More options) still works.
- [ ] 10. Someone else's collection shows **Report collection**, not Edit; your
      own shows Edit, not Report.
- [ ] 11. (Test only) Report it: the request body has `collection_ids`, and the
      forward checkbox appears for a curator on another server.

### Annual report (25c)

- [ ] 12. Own profile ••• → **Annual report from your server** opens
      `/annual-report` with your reports listed by year.
- [ ] 13. Open a year: archetype, monthly table with month names, top hashtags,
      people you interacted with (linked) and top posts (as posts).
- [ ] 14. (4.6, when eligible) **Make my <year> report** → "Your server is
      making…". **Check again** later lists it.
- [ ] 15. A server without annual reports says it doesn't offer them;
      `/annual-report/2015` says there is no report for that year.
- [ ] 16. Anonymous mode: the route is unavailable, and the menu item is absent.
