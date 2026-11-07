# Math Feed Builder integration

Owner approved the English, German and French drafts on 2026-11-06.
The source repository recorded the owner's words, `Approved!`, for those three
languages and exported reviewed data. Spanish, Italian and Japanese did not meet
the five-person floor and remain unregistered.

## Integrated pages

| Language | Route | People | Tags, including future tags |
| --- | --- | ---: | ---: |
| English | `/math-on-mastodon/` | 36 | 7 |
| German | `/de/mathematik-auf-mastodon/` | 14 | 9 |
| French | `/fr/mathematiques-sur-mastodon/` | 13 | 8 |

Added reviewed data, lazy data/copy loaders and language paths. Existing shared
routes put the pages in `/communities/`, prerendering and the sitemap. NumberTheory
remains selectable; no server-diversity cap or tag removal based on author share
was added. Raw evidence and model verdicts remain in the private repository.

Imported with the standard importer from an ignored staging directory containing
the existing bundled topics plus the approved math exports. This preserves the
other topics' content and generated dates. No existing topic data changed.

Design audit review: source count 1,671 → 1,672; all 597 candidate entries are
identical. No candidate additions/removals; reconciliation entries remain valid.
No shared design widget changed.

## Validation

- Node 24.18.0; `npm ci` with the committed lockfile: passed.
- Feed Builder offline bundle validation: passed, 16 pages.
- Targeted Feed Builder tests: 47 passed across six files.
- Design inventory and reconciliation checks: passed.
- Formatting, lint, deployment subpaths, storage registry and importer tests: passed.
- Full `make test`: passed; 9,323 runtime tests, 166 added against the existing
  protected manifest, zero missing. Manifest protection was not rewritten.
  Coverage: statements 78.57%, branches 75.99%, functions 70.73%, lines 80.78%.
- `npm run build:mockingbird`: passed. Initial bundle 912.20 kB; the 900 kB warning
  threshold is exceeded, but the unchanged 1 MB error budget passes. Existing
  shell/status-card CSS warning thresholds also report warnings. Startup boundary
  check passes; optional topic data remains lazy.
- `make test-seo`: passed, including all prerender HTML and sitemap assertions.
- `npm run test:seo:browser`: passed with JavaScript enabled/disabled and desktop/
  mobile layouts, including French math hydration, all three alternates, no
  withheld-language links, NumberTheory retention and 13 rendered people.
- Starter locale coverage report regenerated; no content diff.
- `make design-verify`: not run; no shared widget changes.
- Separate PyPI-wheel client integration suite and full deployment base matrix:
  not run locally. Root build and deployment-contract checks passed.
- Manual signed-in checks: not run; see
  `test_plans/feed-builder-math.md`.

No commit or deployment has been performed by this integration.
