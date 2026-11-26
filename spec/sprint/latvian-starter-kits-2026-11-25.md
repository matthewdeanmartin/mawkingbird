# Latvian starter-kit integration — 2026-11-25

Owner approval: after the two seven-account Latvian drafts were offered for
review, the owner replied “do it. thanks.” Recorded this as approval of those
two editions, retaining all agent holds. No other language was approved.

Integrated:

- `computing-and-open-source/lv`: seven profiles, three tags, at
  `/lv/tehnologijas-un-atvertais-kods-mastodon`.
- `arts-and-culture/lv`: seven profiles, three tags, at
  `/lv/maksla-un-kultura-mastodon`.
- Latvian communities hub: `/lv/mastodon-kopienas`.

Source exports in `mawkingbird_starters` now have `status: reviewed` and explicit
owner approval notes. Only these two approved payloads were validated/imported;
other pending source drafts were not included. The previous 49 app payloads were
not refreshed and their timestamps are unchanged. The new app bundle has 51 pages.

Added native Latvian topic copy, page text, preview/follow/list controls and hub
navigation. Public pages recognize `lv`; this does not promote the app-wide
preview dictionary into production negotiation. The focused-app language menu
has the Latvian endonym for the expanded page-language type. Existing lazy loaders,
route/sitemap registries, data validation and Feed Builder widgets are reused.
No transport or Native host code changed.

Copy states that local tags may be quiet, FOSS may carry English posts, and
authors also write on other subjects. There are no invented activity claims,
new spending, source-post excerpts or private review reasons in public assets.

Validation:

- `make feedbuilder-check`: 51 bundled pages valid, seven importer tests passed.
- Feed Builder and focused-app language-version subset: all 91 tests passed
  across nine files, cumulatively. The initial run had one stale assertion
  expecting three technology topics; the category now legitimately has four.
  Corrected that exact count and reran the page spec: all 42 page tests passed.
  The other eight specs had already passed against the same implementation.
- Targeted Angular lint passed; touched files formatted.
- New DOM tests assert Latvian headings, language, seven profile cards, three
  tags, and quiet-tag guidance for both pages. Existing registry/hub tests cover
  route, loader, copy, alternates and hub completeness for all registered pages.
- Design inventory reviewed: source files 2199 → 2201, all 741 candidate files
  and finding patterns unchanged. One finding offset moved after the Latvian
  endonym. Updated consolidation/reconciliation; inventory checks passed.
- `git diff --check` passed. No tests removed.

No existing app preview answered on localhost ports 4200, 4300, 8000 or 8080.
Browser/visual smoke was unavailable. No production/SEO build, full application
suite, full-site browser loop, design-verify or integration was run; the routine
Feed Builder registration/copy gate in the source playbook applies.

Manual follow-up: [Latvian Feed Builder check plan](../../test_plans/feed-builder-lv.md).
Changes remain uncommitted. No push, release or deployment occurred.
