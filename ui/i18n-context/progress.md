# UI translation execution checkpoint

Ukrainian (`uk`) is complete: all 5,866 eligible keys accepted and reviewed.
Taiwan Traditional Chinese (`zh-Hant`) is also complete: all 5,866 eligible keys
accepted and reviewed. All translation agents are stopped. Do not start another
language or a benchmark without new user direction. The proposed speedup plan
is `sprint/ui-i18n-speedup-plan.md`; it has not been executed.
German, French, Indonesian and Japanese remain outside this execution.

The locale ledgers are authoritative for accepted/reviewed source revisions;
dictionary presence alone is not completion. The source inventory currently has
5,866 eligible keys. Shared fixed assignments are 001–011 at 500 keys and 012
at 366 after the author-count, Twitter summary and adoption-dialog repairs; existing batch memberships
were preserved.

Taiwan final: 5,866 accepted/reviewed keys, zero missing/stale/unreviewed. Final
i18n validation passed. Known English vocabulary injections are absent in both
completed locales. The timed Taiwan finish took 28m 29s including failed attempts;
token counters and model/effort records are saved in `usage-2026-09-05.json`.

Taiwan resume baseline: 4,501 dictionary entries, 4,200 reviewed, 301 unreviewed,
1,365 missing. Saved draft 020 provides 300 missing keys. Sol reviews a 699-key
combined saved-draft and targeted vocabulary-repair assignment; Luna translates
disjoint remaining assignments of 500 and 565. Resume plan and timing are durable
in `zh-Hant-resume-plan.json` and `timing-2026-09-05.json`.

Ukrainian checkpoint: all twelve batches plus bounded source repairs are merged.
The exact source/translation ledger audit reports 5,866 reviewed and no missing,
stale or unreviewed keys. Review counts and categories are in
`review-uk-2026-09-05.md`.

Current workflow: Sol directly authors context-rich slices of fixed batches.
There is no linguistic reviewer stage. The coordinator serializes dictionary and
accepted-ledger merges and runs mechanical source, coverage, placeholder, markup,
length, terminology and trap checks. All disposable work stays in ignored
`.i18n-work/<locale>/`; no scratch files should be staged or committed.

No browser or overflow checks by user instruction. Full UI gate passed once
with 6,209 tests for the Taiwan shared-code changes. Subsequent bounded Ukrainian
locale/count changes used only the affected specs (29 locale, 17 feed-analytics,
9 adoption-dialog)
and fast tooling checks. Do not run full UI tests per batch or per language.

Use `scripts/i18n-fixed-batches.mjs` for the common work inventory. Preserve
accepted dictionaries, locale glossaries, ledgers, fixed inventory and reusable
scripts. Temporary drafts/source snapshots/review subsets are not source assets.
