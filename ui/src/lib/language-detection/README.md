# language-detection

Dependency-free, bounded language identification for short social prose.

Part of Mawkingbird's in-repo libraries: see `ui/docs/libraries.md`. This folder
must not import the app or another library; `npm run check:libs` enforces it.

**API** (from `index.ts`, `corpus.json`): `detectLanguage(text)`, `confidentLanguage(text)`, script candidates and the word lists behind them. `corpus.json` is the human-reviewed outcome corpus, also read by the starters parity check.

**Used by the app through:** `src/app/language/language-detect.ts` re-exports it for the app.

**Runs on:** plain ES2022, no DOM or Node; no npm dependencies.
