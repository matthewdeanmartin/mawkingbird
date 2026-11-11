# link-cleaning

Remove known tracking parameters from links, byte-for-byte safe, with an allowlist.

Part of Mawkingbird's in-repo libraries: see `ui/docs/libraries.md`. This folder
must not import the app or another library; `npm run check:libs` enforces it.

**API** (from `index.ts`): `cleanUrl(url, options)`, `cleanLinks(text, options)` returning the text and each edit. Options: `keepHosts` (with subdomains), `keepParams`, and a `keep(url)` predicate.

**Used by the app through:** `src/app/publishing/post-link-cleaning.ts` protects Mawkingbird's short links and invite campaign tags, and shifts Bluesky facet offsets.

**Runs on:** ES2022 plus web-platform APIs; no npm dependencies.
