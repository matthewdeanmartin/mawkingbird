# Mawkingbird maintenance reviews

The highest priorities are a weekly dependency and security review and a monthly
full-app browser smoke test. Unit tests, lint and build contracts already cover
many source changes. Periodic reviews should catch changes outside the repository
and failures in complete user journeys that those checks do not represent.

These are proposed chores, not newly configured schedules. The repository review
on October 7, 2026 found the checks below. GitHub account-level security settings
and external monitoring are outside this repository inventory.

## Existing checks

- Local `make test` runs coverage, source integrity and protected test inventory.
- `client-build.yml` builds multiple deployment layouts and checks storage keys,
  subpaths and the starter importer. Production builds enforce bundle budgets
  and lazy data boundaries.
- CI runs lint and the design-system static and Chromium browser checks.
- `client-integration.yml` exercises the real Angular HTTP client against a
  released, pinned PyPI mock wheel. It does not exercise real OAuth providers.
- Local `make check` also validates translations, starter data and production
  dependency vulnerabilities. Several language and translation audits are
  available as standalone scripts.
- Starter-kit indexing consent is already revalidated by a scheduled workflow.
- [Dead-code reviews](dead-code-report.md) now have a reproducible tool and
  preserved inventories.

## Proposed cadence

| Cadence | Chore | Gap it addresses | Evidence to keep |
| --- | --- | --- | --- |
| Weekly | Review vulnerable and outdated npm packages, the integration wheel pin, Python documentation dependencies and pinned GitHub Actions. Audit development dependencies too. | `make security` currently audits production dependencies; there is no repository Dependabot configuration or scheduled security audit. Build tools can also affect shipped code. | Dependency report, disposition of each relevant advisory, tested update PRs. |
| Monthly and before release | Exercise the built application in Chromium, Firefox and WebKit: anonymous reading, reader pagination, composer draft recovery, navigation and settings. Include mobile layout. | Browser CI currently targets Chromium catalogue stories, rather than the full deployed application across engines. | Small repeatable journey suite, screenshots or traces on failure, engine versions. |
| Monthly and after provider changes | Check real-provider sign-in and reconnection using dedicated test accounts; check representative Mastodon, Bluesky, RSS and configured connector responses. Keep public writes out of unattended probes. | The pinned mock cannot detect external API, OAuth, CORS, quota or provider-policy changes. | Provider/version matrix, read-only probe results, manual OAuth results. |
| Monthly | Review keyboard-only use, a screen reader, 200% zoom, narrow screens and long translated labels on the actual app. Add an automated accessibility scan to representative journeys. | Keyboard assertions and the Storybook accessibility addon cover useful cases, but do not replace evaluation of complete pages and interactions. | Concrete accessibility issues with reproduction steps, then regressions for fixes. |
| Monthly and after deployment | Check public root and deep links, redirects, OAuth metadata, asset loads, displayed build identity, documentation links, HTTPS and certificate expiry. | Build-layout checks do not prove that the intended files are being served successfully on the public origins. | Deployment smoke report with URLs, build identity and failures. |
| Quarterly | Restore exported drafts and settings into a fresh browser profile; test upgrades from older storage formats and deliberate quota/offline failures. | Storage-key classification and unit tests do not prove an end-to-end recovery drill works for a user's accumulated data. | Restore results and a tested recovery procedure; use disposable data. |
| Quarterly | Review cold-load performance, long-feed scrolling, reader memory use and subscription growth on a modest device. Compare bundle reports and retained memory. | The 1 MB startup budget controls size, not runtime responsiveness or memory accumulation. | Comparable timing and memory measurements, data volume and device/browser details. |
| Quarterly | Recheck data freshness, language accuracy and documentation: server snapshot, starter catalogue and locale coverage, language corpus, provider setup instructions and broken links. | Structural validation can pass while data, translations and external instructions become stale. | Dated refreshes, new corpus examples from reported mistakes, resolved broken links. |
| Annually and after major architecture changes | Review the credential/security model, CSP, CORS/proxy boundaries, vendored scripts, third-party licenses and retirement of obsolete feature paths. | Dead-code scans cannot judge security boundaries, ownership or abandoned product behavior. | Updated security and license inventory, decisions on retained or retired features. |

Start with dependency review and five representative app journeys. Extend the
journeys across browser engines before adding a large new test suite. Keep the
monthly reviews short and record findings so repeated failures become targeted
regressions rather than recurring manual discoveries.

## Implementation notes

[Dependabot version updates](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/secure-your-dependencies/configure-version-updates)
can propose scheduled dependency updates; group routine updates to keep the
review workload manageable. Confirm the repository's existing security-alert,
secret-scanning and code-scanning settings before proposing duplicate tooling.

[Playwright browser projects](https://playwright.dev/docs/browsers) support
Chromium, Firefox and WebKit. WebKit automation is useful coverage; add occasional
checks on real mobile Safari for the browser and device behavior that emulation
cannot establish.

[W3C accessibility evaluation guidance](https://www.w3.org/WAI/test-evaluate/)
calls for evaluation during development and combines tools with human judgment.
Use automated findings as one input to the manual app review.

Separate runtime and development dependency audits and avoid unattended
`npm audit fix --force`. Reproduce proposed updates with Node 22 or a supported
newer Node, `npm ci`, the full test gate and the production build. Integration
checks must keep using the released PyPI wheel, never the sibling source checkout.
