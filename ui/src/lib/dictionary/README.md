# dictionary

Word lookup over sharded static dictionaries, with Japanese deinflection.

Part of Mawkingbird's in-repo libraries: see `ui/docs/libraries.md`. This folder
must not import the app or another library; `npm run check:libs` enforces it.

**API** (from `index.ts`, `languages/japanese.ts`, `languages/chinese.ts`): `lookupAt(text, offset, dictionary)`, `segmentWords(text, language)`, `ShardedDictionary`, and one lazily imported module per language (`languages/japanese.ts`, `languages/chinese.ts`) taking a `DictionaryHost` (`baseUrl`, `fetchJson`). The library never fetches by itself. Shards are built by `ui/scripts/build-dictionaries.mjs`.

**Used by the app through:** `src/app/posts/learn/dictionary-registry.ts` decides which languages the app offers and where shards are served.

**Runs on:** ES2022 plus web-platform APIs; no npm dependencies.
