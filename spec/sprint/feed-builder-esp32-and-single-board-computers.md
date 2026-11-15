# ESP32 and Single-board Computers communities integration

Owner approved English and German on 2026-11-07, explicitly retaining relevant
tags even without posts to help create communities. Integrated reviewed English
(27 people, 20 tags) and German (5 people, 8 tags). French, Spanish, Italian and
Japanese remain withheld. Account selection retains strong recurring matches.

Scope includes ESP32/ESP8266, Raspberry Pi/Pico, Arduino, other microcontroller
and SBC boards, board companies and people building with them. General tech,
Linux or smart-home content requires a clear board-project connection.
Useful quiet tags remain selectable; existing sample cautions remain advisory.
No dedicated server is invented. Private evidence and rejected accounts stay
in the sibling data repository.

Added localized copy, lazy loaders and paths. The shared registry supplies the
communities hub, server routes and sitemap. Import used the supported staged
source argument, preserving all existing topic data and timestamps and excluding
abandoned Frugal Living drafts. Existing math and gardening changes preserved.

Validation uses Git Bash, Node 24.18.0 and locked npm ci. Final gate results are
recorded below after completion.

- Reviewed import and importer tests passed: 21 public pages.
- Targeted Feed Builder specs passed: 50 tests across six files.
- Design inventory passed: 1,674 sources and unchanged 597 candidate entries;
  no reconciliation changes needed.
- Formatting, lint, storage registry, subpath and i18n checks passed.
- Production build passed: initial bundle 912.51 kB, above the existing 900 kB
  advisory and below the unchanged 1 MB error budget. Lazy boundary check passed.
- SEO prerender checks passed, including content, canonical metadata and sitemap.
- Browser SEO checks passed with JavaScript on/off and desktop/mobile widths,
  including both new editions, quiet tags, hreflang and communities links.
- Private data repository: ruff, strict mypy (43 files) and 565 tests passed.
- Existing public topic snapshots and timestamps compared exactly with the
  pre-import staging copies; no other topic data changed.

The initial new test attempted two fixture configurations in one case. Split
English and German into independent cases. Targeted tests passed; the first full
run had already compiled the old test and failed on that same setup issue.
The complete gate was rerun against the corrected source.

Not run: shared-widget design-verify (no shared widget changed), separate PyPI
integration suite, full deployment-base matrix and signed-in manual actions.
Manual plan: test_plans/feed-builder-esp32-and-single-board-computers.md.
No commit, push or deployment.

Final full gate: cd ui && make test passed. Runtime manifest: 9,326 present,
169 added, zero missing; manifest was not rewritten. Coverage: statements
78.59%, branches 76.01%, functions 70.73%, lines 80.80%. Final git diff --check
passed in both repositories.
