# sentiment

A tiny VADER-style "rage" score for short social text.

Part of Mawkingbird's in-repo libraries: see `ui/docs/libraries.md`. This folder
must not import the app or another library; `npm run check:libs` enforces it.

**API** (from `index.ts`): `rageScore(text)`, `stripHtml(html)`, `HEATED_THRESHOLD`.

**Used by the app through:** `src/app/feeds/sentiment.ts` applies it to posts (heated, ratioed, dunk, Calm mode).

**Runs on:** plain ES2022, no DOM or Node; npm: badwords-list.
