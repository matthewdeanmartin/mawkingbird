# Malaysia regional kit — 2026-11-09

Integrated the owner-approved 25-account, accounts-only kit under International
Regions. Page: `/ms/malaysia-di-mastodon/`; hub: `/ms/komuniti-mastodon/`.
Native Malay page copy explicitly describes English/Malay/mixed posts, quiet
accounts and unofficial news feeds. The 36–50 aspiration was not met; the owner
approved the smaller set. General starter packs and app-wide UI locales are
unchanged. Relaxed small-community criteria remain confined to the private topic.

Malay public pages now have their own controls. Tool-language types derive from
the actual tool registry, independently of starter-kit languages. The Malay hub
links to the existing English tools index. Hub fallback badges name the actual
language when a topic has no English edition. SEO checks compare every rendered
account and tag against the approved payload, supporting zero-tag regional kits
while catching omitted content. All 43 older topic snapshots are unchanged.

Validation: 75 focused tests passed; after the hub badge change, all 35 page
specs passed again. Seven importer tests, exact export/import comparison,
changed-file formatting/lint, i18n and design inventory/reconciliation passed.
Locale coverage regenerated unchanged. Production build and initial-bundle checks
passed (927.57 kB). SEO rendering passed; after replacing the obsolete three-tag
minimum, the standalone SEO HTML/canonical/sitemap check passed. Targeted browser
checks passed for the page and both hubs at desktop/mobile sizes with JS on/off.

Not run: full unit suite, full-site SEO browser suite, design-verify, backend
integration or signed-in mutations. No commit, push or deployment performed.
Manual plan: `test_plans/feed-builder-malaysia.md`.
