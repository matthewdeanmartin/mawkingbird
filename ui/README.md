# Mawkingbird UI

This is the maintained standalone client. Use `npm ci`, then `npm start`.
The default build is standalone Mawkingbird in `dist-mockingbird/browser`.
`make build-admin` explicitly builds optional diagnostics to `dist-admin`.
The frozen Python-packaged client remains in the sibling mastodon_mock repo.
See [the deployment runbook](../ops/DEPLOY.md) before changing deployment settings.

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 21.2.7.

## Development server

To start a local development server, run:

```bash
npm start
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
npm run build:mockingbird
```

This compiles the standalone client into `dist-mockingbird/browser`. By default,
the production build optimizes the application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
npm test
```

Spec files share a single jsdom realm, so a global mutated in one file leaks into
the next. If a whole spec file fails intermittently but passes when run on its
own, read
[docs/shared-jsdom-realm-in-tests.md](docs/shared-jsdom-realm-in-tests.md) before
writing it off as flaky.

## Running integration tests

To exercise the real Angular API client against an isolated PyPI installation
of `mastodon-mock`, install uv and Python 3.13 or newer, then run in Git Bash:

```bash
npm run test:integration
```

The runner starts and stops an in-memory server on a free local port. It does
not use the sibling mock-server checkout. These are HTTP integration tests,
not browser click-through tests. See [Contributing](../docs/contributing.md).

### Checking mastodon.social's public API

Run `npm run test:api:live` from `ui/` to exercise Mawkingbird's Angular
`Api` service and its server and authorization interceptors. This opt-in
command sends credential-free GETs and runs without Playwright or an account.
Each invocation reads instance metadata. A new base software release or
Mastodon API level triggers three additional reads covering instance rules,
custom emoji and trending statuses. The assertions allow additional fields
and empty lists.

A network failure, eight-second timeout, HTTP 408, 429 or 5xx ends live traffic
for the run and reports the affected checks as skipped. Invalid JSON in a
successful response, changed field types, and unexpected HTTP errors fail
the command. Only a complete pass saves the release and API level under
`~/.cache/mawkingbird/live-api/`, or `$MAWKINGBIRD_ARTIFACTS/live-api/`
when configured. Reusing that directory preserves the version gate across
runs. The offline integration suite remains independent.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
