# Bundled starter catalogue

The UI ships a snapshot from `mawkingbird_starters/catalog/`. No catalogue requests
go to GitHub Pages at runtime. Existing hand-picked kits and native collection
snapshots remain visible; endorsements and live collection tools keep their existing
flows. Catalogue kits use the same ImportFollows machinery as the hand-picked kits:
anonymous follows use home-instance IDs, signed-in follows resolve each handle on
the reader's server.

From `mastodon_mock/ui`, in Git Bash:

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
