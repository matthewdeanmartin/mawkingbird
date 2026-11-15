# Community hub navigation and Plant Based Living removal — 2026-11-08

Removed the account requested by the owner from the English Plant Based Living
public snapshot and private source export; 12 people remain. The private review
file records a durable rejection, and the private export index count is updated.
No replacement candidates were imported and other editions were left alone.

Every topic mini-app now offers Home, Communities, Builder, Preview, Flooding.
The grid icon returns to the page language's existing hub. Angular Router keeps
the deployment base, including /canary/. English, German, French, Spanish,
Italian and Japanese labels are supplied. Public signed-out pages already have
a hub link in their own header. No shared design widget or route changed.

Validation:
- Targeted shell/navigation specs: 65 passed across two files.
- Feed Builder bundle check and six importer tests passed.
- Production build passed: 917.79 kB initial, above the existing 900 kB advisory
  and below the unchanged 1 MB error budget; lazy startup boundary passed.
- Focused Playwright smoke passed at 1280px and 390px under /canary/, with a
  synthetic local session and intercepted API calls. Verified icon/link order
  and clicked through to /canary/communities/. Mobile screenshot reviewed.
- Translation checks, changed-source formatting, design inventory and diff
  checks passed. The menu data adds no control-inventory candidates.

Full make test ran 9,426 tests: 9,425 passed and one existing Feed Builder wizard
expectation still listed the old three-tab menu. Updated that expectation for
Communities and checked its Italian hub destination. The affected wizard spec
passed on its targeted rerun. The full gate was not repeated after this test-only
correction; its original result remains recorded as failed.

No shared-widget design-verify,
PyPI integration, complete SEO suite or deployment matrix run. No commit, push
or deployment performed. Logs and screenshots are in the OS artifact folder.
