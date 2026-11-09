# Dutch Politics integration — 2026-11-09

Owner approved the reviewed draft: 19 accounts, three hashtags, Dutch (`nl`).
Integrated locally at `/nl/nederlandse-politiek-op-mastodon`, under Society, using
the existing Nederlands hub/filter and native controls. Topic data/copy stay lazy.

The page describes centre-left, centre and centre-right perspectives without claiming
equal quotas; journalism and civics form the core. Direct government policy feeds
are explicitly distinguished from independent journalism. Ordinary small private
accounts remain outside this political selection. Normal activity/privacy/prominence
rules apply, without the small-language regional exceptions.

Tag disclosure: TweedeKamer is concentrated in automated vote reports (~82% from one
account); Gemeenteraad/RaadvanState are quiet (under one post/day), each ~60% from one
account. Open streams do not inherit account-level political selection; readers can
leave tags unselected. The copy includes these limitations before following.

Approved source exported only for this topic and imported through validatePage.
All 46 prior bundled payloads/timestamps are hash-identical, including Dutch Culture.
Turkish remains unapproved and unbundled. No new model spending or pipeline job.

Minimal gate: schema/routes and seven importer specs passed. Inventory reviewed:
1727→1728 source files, all 605 candidate records unchanged; no reconciliation edits
required. All 84 focused Feed Builder tests in eight files passed. Changed-file formatting
and git diff whitespace checks passed; logs in OS artifact directory.

Not run: full application/Python suites, production/SEO build, full browser/design
verification or backend integration. No current preview verified; browser smoke not
run. This is a routine SIG integration under the minimal gate. No commit/deployment.
