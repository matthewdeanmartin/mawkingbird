# Topic starter kits: Builder and Preview

Written for: the Feed Builder wizard change (uncommitted at writing, 2026-11-04).
Status: not run.

Topic pages (`/communities/`, `/science-fiction-on-mastodon/`,
`/it/fantascienza-su-mastodon/`, …) are mini-apps: Home · Builder · Preview.
Signed out, the public page with sign-in; signed in, the trimmed shell with
checkboxes and follow buttons. Preview reads the ticked hashtags and people
anonymously, never Home.

## Setup

A Mastodon test account **M** that follows few people and no sci-fi hashtags
(follows from this plan are real). A fresh private window for the signed-out
steps.

## Signed out

- [ ] 1. Open `/it/fantascienza-su-mastodon/`. The header shows Mawkingbird ·
      Tutti gli starter kit, Selezione · Anteprima, the language menu and
      "Accedi con Mastodon". No checkboxes.
- [ ] 2. Click a person's name: Mawkingbird's profile view opens
      (`/accounts/@user@host`), anonymously, not their home server.
- [ ] 3. Back, then Anteprima: posts from the page's hashtags and people
      appear, newest first, in Italian chrome. "Carica altri" loads more.
- [ ] 4. Your anonymous Home (if you use anonymous mode) is unchanged: nothing
      was followed.

## Sign in returns to the page

- [ ] 5. From step 1, "Accedi con Mastodon", sign in as **M**. You land back on
      `/it/fantascienza-su-mastodon/`, inside the app, with the nav reading
      Home · Builder · Preview, not on Home.

## Builder (signed in)

- [ ] 6. Every hashtag and every person has a checkbox, all ticked. The
      "Segui i N hashtag selezionati" and "Segui le N persone selezionate"
      buttons count everything.
- [ ] 7. Untick #StarWars and two people. Both counts drop.
- [ ] 8. Click Preview: neither #StarWars posts nor the two unticked people
      appear. Back to Builder: the ticks are as you left them.
- [ ] 9. "Segui" on one hashtag: it becomes "Seguito". Check Mastodon's
      followed hashtags: it is there.
- [ ] 10. "Segui i N hashtag selezionati": the rest of the ticked tags are
      followed; #StarWars is not; the one from step 9 is not followed twice.
- [ ] 11. A person's own Follow button follows just them (it resolves the
      account on M's server first; the first click takes a moment).
- [ ] 12. "Segui le N persone selezionate": a confirmation may appear for a
      large batch; progress reads "N di M seguiti"; the two unticked people are
      not followed. Check M's following list.
- [ ] 13. Reload the page: already-followed hashtags show "Seguito".
- [ ] 14. Same at phone width (about 400 px) and in dark mode; repeat steps 6–7
      on `/ja/science-fiction-on-mastodon/` (future tags have checkboxes too).

## Findings

_None yet._
