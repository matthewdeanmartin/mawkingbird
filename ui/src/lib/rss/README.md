# rss

RSS 2.0 / Atom parsing, feed-format ranking, and OPML import/export.

Part of Mawkingbird's in-repo libraries: see `ui/docs/libraries.md`. This folder
must not import the app or another library; `npm run check:libs` enforces it.

**API** (from `index.ts`): `parseFeed(xml)`, `rankFeeds(candidates)`, `collapseFormats(candidates)`, `parseOpml(xml)`, `buildOpml(subscriptions, now, title)`. Uses the browser `DOMParser`.

**Used by the app through:** `src/app/reading/rss/opml.ts` names Mawkingbird's export and its filename; the RSS reader imports the parser directly.

**Runs on:** ES2022 plus web-platform APIs; no npm dependencies.
