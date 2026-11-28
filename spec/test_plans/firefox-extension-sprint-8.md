# Firefox extension, sprint 8: YouTube dogfooding plan

Spec: `spec/firefox-extension.md`. Extension 0.6.0. The owner's main dogfooding
target: use it daily for a few weeks and note anything odd here. Test **signed
in without Plus** (or in a profile where Plus isn't active), so nothing reaches
YouTube through the Mawkingbird proxy.

## First run

- [ ] Videos: a note offers **Let Mawkingbird for Firefox read YouTube**. Allow
      it (window: "Let Mawkingbird read www.youtube.com?"). The note disappears
      and the page reloads its lists.
- [ ] The note never appears again on Videos, Video search, channel pages or
      Watch.

## Daily use, no Plus

- [ ] **Video search**: videos and channels both return results.
- [ ] **Channel page**: more than the 15 newest videos (Load more), channel
      details.
- [ ] **Watch**: duration, chapters (YouTube's or from the description),
      family-safe flag; **YouTube comments** load when asked, with more pages.
- [ ] **Subscribe (RSS)** to a channel from Watch, including from the popup's
      **Subscribe to this channel** on a youtube.com video.
- [ ] @handle and /c/ links in "Add a channel" resolve.
- [ ] Watch with replies to your post (sidebar on a YouTube video) still works.

## Things to watch for over the weeks

- [ ] Any "YouTube answered 403" or "YouTube could not be reached": note the
      time and what you did. YouTube changes its web client; Native would break
      the same day, which tells us it's YouTube, not the add-on.
- [ ] Your normal YouTube tabs behave normally (the add-on only changes its own
      requests).
- [ ] Remove www.youtube.com in the add-on's Options: the note comes back, and
      search falls back to Plus (if you have it) or asks again.
