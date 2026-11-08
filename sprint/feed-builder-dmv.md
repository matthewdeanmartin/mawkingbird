# DMV communities integration

Owner approved the English-only draft and requested classification on the new
communities hub. Imported reviewed English data: 13 people, 20 tags. Added
/dc-maryland-virginia-on-mastodon/ and lazy data/copy loaders. DMV is filed under
the existing Society category, activating that category in the hub. Other hub
language filters show it as an English fallback; no translated DMV editions.

Copy states the requirement for recurring substantive regional posts. Residence,
profile location or membership of a local server does not qualify on its own.
Useful quiet local tags remain selectable; sample cautions remain advisory.
The verified dmv.community link is included. Existing public snapshots and
timestamps match the pre-import staging copies. No unapproved topic imported.

Design inventory reviewed against the working tree before DMV: 1,691 sources,
up one; identical 601 candidate entries. No reconciliation changes necessary.
Preserved concurrent hub/category, media, profile and server-status edits.

Validation uses Git Bash, Node 24.18.0 and locked npm ci. Final gate results
follow below. No commit, push or deployment. Account-writing actions remain
manual in test_plans/feed-builder-dmv.md.
