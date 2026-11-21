# Thread text

Recognizes HTTP(S) URLs with `findUrls`, measures Unicode code points and weighted URLs with `postLength`, and splits prose with `autoSplit`. The caller supplies the URL weight and the splitting budget. An individual URL can exceed the budget and stays intact.

Compose supplies its instance defaults in `app/publishing/compose/post-length.ts`. Write selects editor modes in `app/publishing/write/split-modes.ts`.
