# Dude, where is my design system?

Short answer: there isn't one, in the framework sense. There's a hand-rolled
CSS custom-properties system with real intent behind it, and basically zero
automated enforcement. This doc is the honest inventory.

## What we're NOT using

- No Tailwind, Bootstrap, Material, or any other CSS framework.
- No Sass/SCSS/Less — the codebase is plain `.css` (no `.scss` files exist).
- No CSS-in-JS.
- No component library (no Angular Material, no PrimeNG, etc.).
- No stylelint config anywhere in the repo.
- No visual regression testing, no Storybook, no chromatic diffing.

## What we ARE using

**Plain CSS, scoped per-component via Angular's default view encapsulation.**
Every component gets its own `.css` file next to its `.ts`/`.html`
(162 component stylesheets under `ui/src/app/`, e.g.
`ui/src/app/compose/compose.css`), plus one global stylesheet:

- `ui/src/styles.css` (~1060 lines), registered as the global style in
  `ui/angular.json:56`.

### The token system

`styles.css:1-37` defines a `:root` block of CSS custom properties. This is
the closest thing we have to a design system:

**Color tokens:** `--bg`, `--col-bg`, `--border`, `--text`, `--muted`,
`--accent`, `--accent-hover`, `--accent-soft`, `--hover`

**Layout tokens:** `--col-width`, `--rail-left-width`, `--rail-right-width`,
`--layout-gap`, `--layout-width` (derived from the others via `calc()`)

**Typography:** `--app-font-family` — a Helvetica Neue / system-font stack,
no webfont downloads.

### Theming mechanism

Runtime theming is done via attribute selectors on `<html>`, toggled by the
`ClientPrefs` service:

- `[data-theme='dark']` (`styles.css:60-70`) — dark palette overrides. Named
  after 2018 Twitter's "dim" theme per the code comment.
- `[data-accent='yellow'|'rose'|'purple'|'orange'|'green']`
  (`styles.css:74-98`) — five accent presets; dark-mode variants of each are
  derived automatically via `color-mix()` rather than hand-specified.
- `[data-feed-reader='on']` (`styles.css:141-149`) — a parallel set of
  `--reader-*` typography tokens for reader mode, applied only to
  `.status .content`.
- `.is-test-build` (`styles.css:112-120`) — shifts `--bg` only, so the
  `/test/` deployment is visually distinguishable from production at a
  glance without touching any other token.

### Documented intent (in comments, not tooling)

The one piece of real design rigor in the file is a comment, not a check:
`styles.css:6-10` explains that `--muted` is held to WCAG **AAA** (7:1)
contrast against both `--bg` and `--col-bg`, deliberately stricter than the
4.5:1 AA floor, because a prior `--muted` value technically passed AA on
white but measured 4.38:1 against the page background — i.e. "secondary
text" had quietly become unreadable. This is institutional memory living in
a code comment, referencing `docs/contributing.md`.

### Token adoption is inconsistent

Grep for `var(--` across `ui/src/app/**/*.css` shows heavy usage in some
components (`compose.css`: 34 hits, `status-card.css`: 53, `shell.css`: 47)
and **zero** hits in others (`lightbox.css`, `about.css`, `analytics.css`,
`funding.css`, several `settings/*` pages, `tag.css`, `terms.css`, etc.).
Zero hits doesn't necessarily mean a violation — some of those components may
have no themeable surface — but it does mean nothing currently checks
whether a new hardcoded `#fff` or `#333` in a component stylesheet should
have been a token reference instead.

## Enforcement inventory — what actually runs

| Mechanism | Covers CSS? | Notes |
|---|---|---|
| ESLint (`ui/eslint.config.js`) | No | Only targets `**/*.ts` (typescript-eslint + angular-eslint) and `**/*.html` (template a11y rules). Zero CSS-aware config. |
| Prettier (`format` / `format:check`) | Formatting only | Globs include `.css`/`.scss` (`ui/package.json:23-24`), and `check:static` runs `format:check` in CI-equivalent (`ui/package.json:34`). This enforces whitespace/quote-style consistency, **not** token usage, color values, specificity, or naming. |
| stylelint | N/A | Does not exist in this repo. |
| Visual regression / Storybook / Chromatic | N/A | Does not exist. |
| Manual code review + code comments | Partially | The only substantive rule (AAA contrast for `--muted`) is enforced by a human reading a comment, not a CI gate. |

So: **Prettier is the only automated check that touches CSS files at all**,
and it only cares about formatting, not design correctness.

## Practical implications

- Nothing stops a new component from hardcoding `#1da1f2` instead of using
  `var(--accent)`. It'll pass `lint`, `format:check`, and `test:ci` either
  way.
- Nothing stops a new color from breaking the WCAG AAA contrast rule the
  `--muted` comment describes.
- Nothing verifies dark mode / accent-preset / reader-mode combinations
  actually render correctly — that's manual QA territory.
- The five accent presets and dark-mode `color-mix()` derivations are only
  as consistent as the person writing new component CSS remembers to check
  `styles.css` first.

## If we wanted to close this gap

Roughly in order of effort/payoff, not a commitment to do any of it:

1. **stylelint + `stylelint-declaration-strict-value`** (or similar) to flag
   raw color literals in component CSS instead of `var(--...)` references.
   Cheapest lever, biggest signal-to-noise win.
2. Wire that into `check:static` alongside `format:check` so it's part of
   the existing `npm run check` gate (`ui/package.json:36`), not a
   side-channel.
3. A small automated contrast check (script, not full a11y suite) that reads
   the token values out of `styles.css` and asserts the AAA-against-both-
   backgrounds rule the comment already documents, so it stops being
   tribal knowledge.
4. Optional, larger lift: a documented component/token reference
   (e.g. a `docs/design-tokens.md`) listing every `--token`, what it means,
   and which components are exempt and why — closer to what
   `ui/docs/starter-catalog.md` does for starter kits, but for CSS tokens.

None of this exists today. This document is the map of the gap, not a plan
to fill it.
