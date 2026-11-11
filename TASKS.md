# Owner tasks

Things only you can do, newest first. Tick them off or delete them as you go.

## Now

- [ ] **Push** (second round of visitor fixes, 2026-11-10 afternoon). Then wait
      for "Deploy Mawkingbird Canary" (~6 minutes).
- [ ] **Retry the Misskey visitor on /canary/** with only one mawkingbird.com
      tab open. Two causes fixed so far:
      1. Opening "Sign in with Misskey" from the sign-in page while already
         signed in bounced you straight back to Home as matt. It now stays,
         so you can pick a server and press **Look around without an
         account**.
      2. Tabs no longer overwrite each other's choice of Misskey account.
      Both the sign-in path and the account-menu path work on the live canary
      in a clean browser (matt → Misskey visitor → "Visiting misskey.io").
- [ ] **If it still goes back to matt**: open DevTools → Console, reload, and
      send me the lines starting `misskey-startup` and `enter-misskey` (they
      show which account the page chose and why; no tokens). Settings →
      Local storage → the `mockingbird_misskey_*` rows help too (copy the key
      names and the `_visitor` / `_active_identity` values, not the
      credentials).

## Manual test plans (test_plans/)

- [ ] `misskey-ma-visitor.md` (the visitor)
- [ ] `misskey-m3-search.md` (search, hashtags, mentions)
- [ ] `misskey-m3-feeds.md` (Feeds by network, antennas/lists/channels/clips,
      live updates). On a channel page, approve "Allow following channels" once.
- [ ] `learn-l1-tap-a-word.md` (tap a word). Add Japanese to Settings →
      Languages → learning first.
- [ ] Older ones still open: `misskey-m2-writing.md`, `misskey-t2-ai-translation.md`.

## Data and licences

- [ ] **Monthly: refresh JMdict** (the EDRDG licence requires regular updates):
      `cd ui && npm run dict:jmdict`, then commit `ui/public/dict/jmdict/`.
- [ ] **Chinese dictionary**: download `cedict_1_0_ts_utf-8_mdbg.txt.gz` by hand
      from https://www.mdbg.net/chinese/dictionary?page=cc-cedict (MDBG forbids
      scripted downloads), then `cd ui && npm run dict:cedict -- --file <path>`
      and commit `ui/public/dict/cc-cedict/`.

## Housekeeping

- [ ] `npm run check:static` fails on formatting in 26 files committed earlier
      (account-tab-guard, bookmarks, home.spec, …), none from the Misskey or
      L1 work. `cd ui && npm run format` fixes them; review the diff first.

## Decisions waiting on you

- [ ] Next sprint: **M4 Misskey chat** or **L2 word bank and flashcards**.
- [ ] Korean dictionary source (needed for Korean tap-a-word).
