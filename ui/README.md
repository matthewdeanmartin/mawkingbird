# Mawkingbird UI

This is the maintained standalone client. Use `npm ci`, then `npm start`.
The default build is standalone Mawkingbird in `dist-mockingbird/browser`.
`make build-admin` explicitly builds optional diagnostics to `dist-admin`.
The frozen Python-packaged client remains in the sibling mastodon_mock repo.
See [the migration runbook](../MIGRATION.md) before changing deployment settings.

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

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
