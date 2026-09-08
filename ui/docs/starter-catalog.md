# Bundled starter catalogue

The UI ships a snapshot from `mawkingbird_starters/catalog/`. No catalogue requests
go to GitHub Pages at runtime. Existing hand-picked kits and native collection
snapshots remain visible; endorsements and live collection tools keep their existing
flows. Catalogue kits use the same ImportFollows machinery as the hand-picked kits:
anonymous follows use home-instance IDs, signed-in follows resolve each handle on
the reader's server.

From `mawkingbird/ui`, in Git Bash:

```bash
make starter-catalog-update
make starter-catalog-check
# Or import another checked-out catalogue:
make starter-catalog-update CATALOG=/path/to/mawkingbird_starters/catalog
```

Refresh the source repository's published catalogue first. The default command
reads the sibling checkout, including its uncommitted catalogue changes. It does
not crawl accounts or fetch a remote branch. Review the generated JSON diff,
commit it with the UI, and publish through the normal Mawkingbird release process.
No scheduler or automatic publication is configured.

The importer checks the version, identities, member counts, profile fields and
URLs before writing. Profiles absent from the current display cache are omitted;
empty packs disappear. Each import replaces the whole snapshot so old members are
not carried forward. It does not reinterpret the source catalogue's consent policy.
Builds validate the checked-in snapshot offline and do not require the sibling repo.

The catalogue date appears in People to follow. “My languages” uses the existing
browser, UI and explicit known-language signals. A separate browsing selector offers
every catalogue language and “All languages”; it never writes language preferences.
Legacy sets have no declared content language and remain visible under every filter.
Each catalogue pack displays its title and description in its own content language,
including on mixed-language lists and in search. Selecting Russian changes the
starter-pack browser's controls to Russian; opening a Russian pack uses Russian
controls even through a direct link. The surrounding app keeps its interface language.
Mixed-language views use the app language for shared controls and each pack's language
on its card. Legacy unlabelled sets and curator-authored titles retain their own copy.
Kit routes include language and slug, so a refresh preserves links; removed kits show
an unavailable message in the language encoded in the link.

## Translation ownership

- **Pack names and descriptions:** edit locale maps in
  `mawkingbird_starters/data/taxonomy.json`. This is hand-maintained source data;
  `starters.packs.write_catalog` copies it into the regenerated pack files. Do not
  translate `catalog/packs/` or `starter-catalog.generated.json` by hand.
- **Pack controls:** `src/app/starter-pack-ui.json` is a small, hand-maintained
  dictionary shared by every pack. It is independent of global UI dictionaries and
  is never rewritten by catalogue refreshes. `StarterPackTextPipe` reads it without
  switching Transloco's active language, fetching dictionaries, or changing preferences.
- Current pack languages have complete title, description and control coverage.
  Missing future translations fall back to English; the catalogue coverage test
  identifies the language/key that needs a one-time addition. Membership refreshes
  require no translation work. Existing translations are reused across all packs
  in the same category or language.

## Required refresh and reconciliation workflow

Use Git Bash on Windows. Import the source checkout's current catalogue, including
intentional uncommitted changes; do not reset it or recrawl just to update UI data.

1. In `mawkingbird/ui`, run `make starter-catalog-update`. This replaces the bundle
   and regenerates [the locale coverage report](starter-locale-coverage.md).
2. Review both directions in that report: packs without an app-wide UI dictionary,
   and production/in-progress UI locales without packs. Also review missing pack
   copy and controls. A pack language is independent of the interface language.
3. Fill missing pack titles/descriptions in the sibling
   `mawkingbird_starters/data/taxonomy.json`. For copy-only changes, run
   `python scripts/refresh_catalog_copy.py` from that repository root, then import
   again. This refreshes generated pack copy offline while preserving the snapshot
   date, membership, ranks and profiles. `--check` detects stale copy without writing.
   For membership changes use the source repository's normal catalogue assembly.
4. Fill missing starter controls in `src/app/starter-pack-ui.json`, preserving all
   `{{placeholders}}`. Existing global UI translations can be copied once when
   applicable; subsequent catalogue updates do not overwrite this dictionary.
   Preserve `zh-Hant` throughout import, copy lookup, filtering and removed links.
5. Run `npm run starter-locales:report -- --write` after any translation or locale
   registration changes, then `make starter-catalog-check`, targeted starter specs,
   `make i18n`, and the required full `make test` gate. Build the UI before release.
   The catalogue check is offline and rejects stale reports, missing content-language
   copy, missing controls, placeholder drift and registered locales without files.
6. Review and commit taxonomy/generated copy changes in the source repository,
   and the generated bundle, controls, report and code changes in Mawkingbird.
   Publishing follows the normal release process; importing does not deploy.

App-wide UI gaps are a translation backlog, not a reason to hide valid packs or
advertise an untranslated interface. To add one, follow the existing UI i18n work
orders and merge validation, add its dictionary under `public/i18n/`, register it
in `IN_PROGRESS_LOCALES` with an endonym in `src/app/i18n/locale.ts`, and review it
on test/canary before production promotion. Do not create an English-filled locale
file just to clear the report. Locales without packs need consent-checked source
curation; never relabel another language's pack to fill the row.

For example, the September 2026 refresh supplies Catalan (`ca`) pack titles,
descriptions and controls, while Catalan remains an app-wide UI localization gap.
The report keeps Simplified/generic Chinese (`zh`) distinct from Traditional
Chinese (`zh-Hant`), and separates preview languages from production languages.
