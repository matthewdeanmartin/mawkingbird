# Mawkingbird source migration

## Current publishing configuration (outage repair)

The workflows now publish production, canary, and test to this repository's
gh-pages branch with GITHUB_TOKEN and explicitly request a Pages rebuild.
Production builds with base href `/`, root OAuth metadata, the shared subpath
404 fallback, and CNAME mawkingbird.com. No workflow publishes to mastodon_mock.
The old mirror jobs were removed: they would overwrite this custom-domain site
with `/mawkingbird/` assets and break it again. Production has an enforcing
base/404/OAuth check before publication. MAWKINGBIRD_PUBLISH_ENABLED controls
activation. Production stays manually promoted; canary/test run on main pushes.

The github.io fallback is currently a redirect because the owner moved the
custom-domain binding here. An independent fallback requires a separate Pages
site and remains follow-up work. The original topology/runbook below is retained
as migration history, not the current deployment procedure.

> Hosting change reported by the owner after this plan: mawkingbird.com was
> disconnected from mastodon_mock and attached to mawkingbird, with Cloudflare
> previously in front. Production is reported down. The source-only hosting
> topology and publishing activation steps below are now historical; do not
> activate those publishers without reconciling their destinations, CNAME files,
> base hrefs, and the requirement for an independent github.io fallback. No DNS
> or certificate diagnosis has been performed as part of the legacy build fix.

Follow-up read-only checks at 2026-09-07 13:49 UTC: Google DNS, Cloudflare DNS,
and the local resolver all resolve the domain to Cloudflare. HTTPS returns 200;
GitHub reports the new repository's certificate approved and HTTPS enforced.
The served HTML still has base href `/mawkingbird/`: `/mawkingbird/boot.js`
returns 404 while `/boot.js` returns 200. This is a deployment-path mismatch,
not an unresolved public DNS record. The old github.io mirror URL now returns
301 to mawkingbird.com and no longer provides an independent fallback.

## Decisions and inventory (2026-09-07)

The owner requested a snapshot of today's UI as the frozen legacy fork and no
public URL changes. The source snapshot is all 1,567 tracked `ui/` files from
`matthewdeanmartin/mastodon_mock@4d981c458abc1d1ed7f2929f33e53a4f8fee1ca8`.
It excludes untracked files, credentials, certificates, dependencies and build
outputs. The original Git history stays in mastodon_mock; this is a snapshot
import, not a rewritten-history merge. Existing mawkingbird docs are retained.

| Responsibility | After source migration |
| --- | --- |
| Maintained client and publishing workflows | mawkingbird main, ui/ |
| Stateful mock REST server and bundled legacy UI | mastodon_mock main |
| https://mawkingbird.com/ | mastodon_mock gh-pages root |
| https://mawkingbird.com/canary/ | mastodon_mock gh-pages canary/ |
| https://mawkingbird.com/test/ | mastodon_mock gh-pages test/ |
| https://matthewdeanmartin.github.io/mawkingbird/ | mawkingbird gh-pages root |
| Mirror canary | mawkingbird gh-pages canary/ |
| Help docs | Existing docs/, mkdocs.yml and Read the Docs |

Read-only GitHub Pages API checks confirmed both sites publish from `gh-pages:/`
using branch publishing. mastodon_mock has CNAME mawkingbird.com, HTTPS enforced,
and an approved certificate expiring 2026-10-11. mawkingbird has no custom domain
and HTTPS enforced. GitHub reported production's protected_domain_state as
unverified; this is separate from the approved certificate.

## Why hosting stays where it is

The fallback must remain independently usable behind firewalls that block the
new domain. Binding mawkingbird.com to the mawkingbird repository would turn its
default github.io address into a custom-domain redirect. Keep two Pages sites.
Source can move without moving either Pages site. No DNS, Cloudflare routing,
TLS certificate, OAuth callback, browser storage key, Worker endpoint, or local
development certificate change is required for this source-only handoff.

Cloudflare dashboard state has not been audited or changed. Existing origin
allowlists and OAuth provider settings still need smoke validation at cutover,
but their URLs remain the same. Local mock-server TLS remains in mastodon_mock.

## Local changes

- Copy the tracked UI snapshot; keep mastodon_mock/ui byte-for-byte unchanged.
- Default Angular build and serve select mockingbird. Optional admin build
  writes inside this repository to ui/dist-admin, not into a Python package.
- Keep mock diagnostic sources and tests initially; removing them is a separate
  cleanup. The standalone build's leakage check prevents shipping mock tooling.
- Point bug reports and build provenance to mawkingbird. Stamp the checked-out
  commit, including manual production promotions of older refs.
- Keep the starter catalog snapshot self-contained. Updating it optionally uses
  sibling mawkingbird_starters; builds use the committed generated catalog.
- API documentation regeneration optionally uses sibling mastodon_mock's schema;
  override MASTODON_OPENAPI_SCHEMA for another path. Builds use generated output.
- Preserve docs publishing and existing repository license/ignore settings.
- Point mawkingbird_starters' parity regeneration at the maintained client.

## Publishing handoff

New publishers are inactive until repository variable
`MAWKINGBIRD_PUBLISH_ENABLED=true` is set in mawkingbird. Old publishers continue
until `MAWKINGBIRD_PUBLISH_RETIRED=true` is set in mastodon_mock. These are an
explicit deployment handoff, not a permanent dual-publisher design. GitHub
concurrency groups do not lock across repositories.

1. Review and land the source import and the retirement guards. Complete local
   test/build validation first. Keep the new activation variable unset.
2. Record both remote main SHAs and both gh-pages SHAs in the release record.
   Preserve the current production deployment until canary validation completes.
3. Generate a dedicated SSH deploy key. Install its public half as a writable
   deploy key on mastodon_mock, and its private half as the mawkingbird Actions
   secret `MASTODON_MOCK_PAGES_DEPLOY_KEY`. Do not put either private key in Git.
   This is the only new cross-repository credential. The existing reverse
   `MAWKINGBIRD_DEPLOY_KEY` is retained temporarily for rollback.
4. Set the old retirement variable, disable its two old deployment workflows,
   and wait for queued/running old publishers to finish. Disabling also protects
   against dispatching an older ref that predates the guard.
5. Enable the new variable, then manually dispatch mockingbird-canary.yml in
   mawkingbird. It publishes custom-domain canary and test plus mirror canary.
   Verify their commit markers and smoke checks below. Production is unchanged.
6. Dispatch mockingbird-pages.yml with the exact validated mawkingbird commit.
   Both production variants build the same ref. The root publisher preserves
   canary/test directories and redirect shims.
7. Verify the served deployment, not just a successful branch push. Mirror pushes
   use GITHUB_TOKEN and explicitly request a Pages build with pages:write because
   token pushes alone do not trigger branch Pages builds. Production pushes use
   the new SSH deploy key. Check Pages Actions/build status on both host repos.
8. After the rollback window, remove the old reverse deploy key/secret and keep
   old workflows disabled. All further client changes belong in mawkingbird.

## Release smoke checks

- Root and deep links on production, canary, test and both mirror variants.
- Bare /canary and /test redirects, refresh, query string and fragment retention.
- Expected base href, root-only CNAME on production host, no mirror CNAME.
- Matching canary/test commit markers and correct build footer repository/ref.
- Bluesky client metadata client_id and redirects match each exact public base.
- Mastodon and Bluesky login, return navigation, logout, retained saved accounts.
- /test/ selects sandbox billing/CORS; canary selects production services.
- The github.io mirror works without redirecting to mawkingbird.com; verify from
  the affected corporate network as well as an unrestricted browser.
- Read the Docs builds and serves its existing help URLs.

## Rollback

Disable the new activation variable and workflows, then drain all active runs.
If the old workflow archive has landed, restore the two YAML files from
mastodon_mock/.github_backup/ to .github/workflows/ and land that restoration.
Re-enable the old workflows and clear their retirement variable only after this.
For canary-only failure, production never changed. For a production failure,
dispatch the old production publisher at the recorded source SHA and verify both
sites. It preserves canary/test, so restore those separately if necessary.
Alternatively restore the recorded gh-pages trees through reviewed commits and
explicit Pages rebuilds. Do not reset or force-push live publishing branches.
Keep both deploy credentials until rollback is no longer needed.

## Optional later hosting separation

If the mock repository must eventually stop hosting static files, create a
dedicated production-host repository and move only the custom-domain site there.
Keep mawkingbird's github.io mirror unbound. That is a separate cutover: snapshot
DNS/Cloudflare proxy settings, verify domain ownership, prebuild every subtree,
transfer the Pages custom-domain binding, validate origin TLS and enforcement,
then smoke OAuth and fallback behavior. Do not start by deleting working DNS or
reissuing certificates. DNS may remain unchanged for the same GitHub account.

## Local validation and current handoff state

The source migration is prepared locally, not committed, pushed, or activated.
On 2026-09-07 both old publishing workflows were disabled in GitHub and
MAWKINGBIRD_PUBLISH_RETIRED was set to true. No queued or running Actions runs
were returned by the subsequent checks. Their local YAML files were moved into
mastodon_mock/.github_backup/ at the owner's request. The new activation flag
remains unset and the new production deploy secret is not yet configured.
Deploy keys, secrets, DNS, certificates, and Cloudflare settings were not changed.

Validated in Git Bash with Node 24.18.0 / npm 12.0.2 (CI uses Node 22):

- Full `cd ui && make test`: 6,240 passed, zero failed or pending; 456 spec files;
  runtime manifest has zero missing tests. Coverage: 72.12% statements.
- Standalone root, github.io mirror, and /test/ builds passed with no mock leakage.
- Optional admin build passed and wrote only to ui/dist-admin in the new repo.
- /test/ base href and stamped Bluesky client_id agree.
- Storage registry: 123 classified keys; canary/test fallback routes agree.
- Starter catalog importer test passed.
- Offline publisher integration passed: root/subtree preservation, mirror bare
  path redirect, and rejection of path traversal before publishing.
- Workflow YAML parses, shell scripts parse, changed-file whitespace checks pass.
- Source audit: 1,567 files present, eight intentional migration edits and 1,559
  identical Git blobs after line-ending normalization. Legacy UI has no Git diff.
- Sibling starter parity script syntax checked after its input-path update.

Local build logs are ignored files named migration-*.log. Full test results live
in ui/.test-results/full.json. The source importer audit is reproducible with
`node scripts/check-source-import.cjs`; the publishing integration with
`bash scripts/test-pages-publisher.sh`. The source audit intentionally describes
this import snapshot and should not gate future feature development.

Read-only observed gh-pages refs (recheck at actual cutover):

- mastodon_mock: `d322da1e9feeda1fd5f2a479b3bfeed6a4046c25`
- mawkingbird: `b38e15a4268c99b346d6a918df4da5cd5907aef2`

Live workflow execution, Pages rebuild-token behavior, OAuth/browser smoke tests,
Read the Docs rebuild, and corporate-firewall access remain cutover checks.

## Primary references

- [GitHub custom domains](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)
- [Pages publishing sources and token behavior](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [Pages build REST API](https://docs.github.com/en/rest/pages/pages#request-a-github-pages-build)
