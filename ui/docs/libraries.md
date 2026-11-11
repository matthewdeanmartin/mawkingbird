# In-repo libraries (`src/lib`)

Some code in this app has nothing to do with Mawkingbird: it implements a
standard or a general technique that any app could use. That code lives in
`ui/src/lib/<name>/` as a pseudo-vendored library: kept in this repository and
built with the app, but written and checked as if it were an npm package.

| Library | What it is | The app's seam |
| --- | --- | --- |
| `language-detection` | Bounded language identification for short social prose | `app/language/language-detect.ts` |
| `rss` | RSS/Atom parsing, feed-format ranking, OPML import/export | `app/reading/rss/opml.ts` (export title and filename); the reader imports the parser |
| `dictionary` | Sharded static dictionaries, word lookup, Japanese deinflection | `app/posts/learn/dictionary-registry.ts` |
| `eliza` | The 1966 ELIZA recipe; the caller supplies the script | `app/chat/eliza/eliza-reply.ts` |
| `link-cleaning` | Tracking-parameter removal with an allowlist | `app/publishing/post-link-cleaning.ts` |
| `sentiment` | A small VADER-style rage score for social text | `app/feeds/sentiment.ts` |
| `webmention` | W3C Webmention endpoint discovery | `app/connections/hugo/webmention-send.ts` |

## The rules

Dependencies point one way only: the app may use a library, and a library uses
nothing of the app's and no other library.

- **No imports out of the folder.** A library imports only its own files and the
  npm packages listed in its `lib.json`. Never the app, the environments, or
  another library. Never Angular, Transloco or RxJS.
- **The host supplies I/O.** Network access, storage, the page's base URL and
  data loading are passed in by the app (see `DictionaryHost`). App policy is
  passed in too: Mawkingbird's ELIZA script, the link-cleaning allowlist, the
  OPML export title.
- **Declared entry points.** App code imports a library only through the files
  listed under `entries` in its `lib.json`, normally just `index.ts`. Extra
  entries exist where splitting matters: the dictionary's per-language modules
  are separate entries so each loads lazily.
- **Type-checks alone.** Each library's `tsconfig.json` sets `"types": []` and
  plain ES2022, adding the DOM library only when `lib.json` says `"web": true`.

`npm run check:libs` enforces all of this, plus that git does not ignore any
library file. (The root `.gitignore` has a Python `lib/` rule; it carries an
exception for `ui/src/lib/`.) The check runs in `make test` and `check:static`.

## Each library has

- `index.ts`: the public API.
- `lib.json`: `description`, `web` (may use web-platform APIs such as
  `DOMParser` and `URL`), `dependencies` (npm package names), `entries`.
- `tsconfig.json`: the standalone type-check described above.
- `README.md`: what it does, its API, and which app file uses it.
- Its specs, written for plain Vitest. No TestBed and no app fixtures.

## Tests

Library specs do not run in the Angular suite: `angular.json` excludes
`src/lib/**` from `ng test`. `npm run test:libs` runs them with
`vitest.libs.config.ts`, one project per library, under jsdom for `web`
libraries and Node for the rest.

A library whose files have not changed since it last passed on this machine is
skipped. Its fingerprint covers every file in its folder, the installed versions
of its dependencies and of Vitest and jsdom, and the runner's own configuration.
The cache lives in the artifact folder (`node scripts/artifacts.mjs lib-tests`).
`npm run test:libs:all` and CI (`CI=1`) always run everything.

`lib-test-manifest.json` protects the library tests the way `test-manifest.json`
protects the app's. A missing test fails the run, cached or not. Accept added
tests with `npm run test:libs:update`.

Tests that pin Mawkingbird's own choices stay in the app next to its seam, for
example "Eliza's FAQ answers boosts" or "invite links keep their campaign tags".

## Adding a library

1. Pick code that is domain-neutral: another app could use it unchanged. Code
   that needs `models.ts`, Angular, or Mawkingbird copy is not a library.
2. Move it to `src/lib/<name>/` with `git mv`, cut its app imports by passing them
   in as parameters, and add `index.ts`, `lib.json`, `tsconfig.json` and `README.md`.
3. Point the app's imports at the entry point, keeping one small adapter where
   the app needs to add policy.
4. Move its specs alongside it. Leave app-specific assertions in the app.
5. Run `npm run check:libs` and `npm run test:libs`. Then accept the moved tests:
   `npm run test:libs:update`, and remove the same IDs from `test-manifest.json`
   only after checking that each one reappears in `lib-test-manifest.json`.
