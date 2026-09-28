# Sprint 7 adoption audit

## Fixed inventory: five eligible controls, five migrated

| Production source                                            | Consumer                              | Preserved behavior                                                    | Result               |
| ------------------------------------------------------------ | ------------------------------------- | --------------------------------------------------------------------- | -------------------- |
| `ui/src/app/pages/settings/privacy/settings-privacy.html:13` | Require follow requests (`locked`)    | Immediate single-key PATCH, hint, busy disable, saved/error, rollback | Adopted `MbCheckbox` |
| `ui/src/app/pages/settings/privacy/settings-privacy.html:28` | Discovery (`discoverable`)            | Immediate single-key PATCH and feedback/rollback                      | Adopted `MbCheckbox` |
| `ui/src/app/pages/settings/privacy/settings-privacy.html:47` | Automated account (`bot`)             | Hint, single-key PATCH and feedback/rollback                          | Adopted `MbCheckbox` |
| `ui/src/app/pages/settings/privacy/settings-privacy.html:99` | Sensitive media (`source[sensitive]`) | Native name `sensitive`, existing payload mapping, feedback/rollback  | Adopted `MbCheckbox` |
| `ui/src/app/admin/announcements/admin-announcements.html:9`  | Publish immediately                   | ngModel choice passed into create; failed create retains draft/choice | Adopted `MbCheckbox` |

Owner for this batch: implementation author and application reviewer. All five
were eligible for the already-approved plain-text checkbox contract; no variant
approval was inferred. The morning review is for real screen composition.

## Cleanup and boundaries

Removed four repeated checkbox/label/hint/feedback blocks and the admin's local
`.publish-toggle` styling. The admin parent row now wraps and supplies an 8px gap.
No shared legacy global setting styles were deleted: other consumers still use
them. Existing `.scontrol` hint/input rules remain a broader consolidation item.

No service save logic, server URL, storage key, OAuth behavior, translation key
or dependency version changed. The existing analytics control is not counted as
a new adoption. Public registration consent, Privacy selects and other admin
forms remain explicit Sprint 8 candidates; they are not silently counted done.

## Evidence and reconciliation

New native-control integration tests exercise failure/retry for all four Privacy
flags, including input checked/disabled/invalid state and one-key payloads. The
admin test checks label click, draft submission, failed request retention and
retry. Existing specs are retained.

The Storybook fixture imports real components; its in-memory Api/AdminApi/Prefs
providers never issue network requests or write storage. First locked save fails
locally to expose the rollback UI. Destructive confirmation is disabled only in
the fixture. Production handlers are unchanged.

The fixture uses an ordinary local Error to exercise rollback; real HTTP status
handling remains covered by the app's HTTP tests. Storybook configuration and
package versions are unchanged.

The source inventory is regenerated after these five migrations. The four
Privacy checkbox candidates and admin publish-toggle candidate in Sprint 6's
opening audit are resolved by this record. The remainder of that inventory still
needs its recorded semantic review and migration work.

## Exit evidence

Five scoped controls are adopted, with no deferred controls inside this batch.
All 11 targeted tests, the full 7,585-test app gate, 158 catalogue browser checks,
lint/type/format/inventory checks and production build pass. Screenshots were
visually inspected in wide/light, narrow/dim and RTL. See the
[verification record](../REVIEW-7.md#completed-verification). Remaining forms,
legacy parent styling and other consumers are assigned to later adoption work;
the total repository inventory is not claimed complete.
