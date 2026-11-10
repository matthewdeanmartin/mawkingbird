# Owner tasks

Things only you can do, newest first. Tick them off or delete them as you go.

## Now

- [ ] **Push** the fixes from 2026-11-10 (visitor switch-back, design
      formatting). The last push failed "Validate client builds" only because
      `design_system/audits/06-consolidation.md` had two stray blank lines
      (from the Ukrainian topic notes); that is fixed in the working tree.
- [ ] **Close every tab on the site root (mawkingbird.com, not /canary/)**
      and other /canary/ tabs before trying the Misskey visitor again, or
      deploy production too. Most likely cause of the switch-back (not proven
      on your browser; the flow works on the live canary in a clean one):
      tabs share the "which Misskey account is active" pointer, and the code
      deployed until now rewrote it to your misskey.design account whenever it
      did not recognise the value, so another open tab could undo the switch
      the moment you made it. The fix stops that, once deployed everywhere.
- [ ] Then retry: Sign in with Misskey → misskey.io → **Look around without an
      account**. Tested working on the live canary in a clean browser.

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
- [ ] Protected test baseline: `make test` lists two tests removed in earlier
      commits (command-bar "authenticated Fedi control…", bookmarks "Native
      bookmarks 20 at a time…"). If removing them was intended,
      `npm run test:audit:update`; otherwise restore them.

## Decisions waiting on you

- [ ] Next sprint: **M4 Misskey chat** or **L2 word bank and flashcards**.
- [ ] Korean dictionary source (needed for Korean tap-a-word).
