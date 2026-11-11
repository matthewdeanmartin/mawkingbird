# eliza

The classic 1966 ELIZA recipe: FAQ keywords, pronoun-reflecting rules, deflections.

Part of Mawkingbird's in-repo libraries: see `ui/docs/libraries.md`. This folder
must not import the app or another library; `npm run check:libs` enforces it.

**API** (from `index.ts`): `elizaReply(script, text, seed)`, `faqMatch(text, faq)`, `reflect(fragment)`. The caller supplies the whole script.

**Used by the app through:** `src/app/chat/eliza/eliza-reply.ts` binds Mawkingbird's own script (`eliza-content.ts`).

**Runs on:** plain ES2022, no DOM or Node; no npm dependencies.
