.DEFAULT_GOAL := help
MAKEFLAGS += --no-print-directory

.PHONY: design design-build design-check design-test design-verify
design:
	npm run design:dev

design-build:
	npm run design:build

design-check:
	npm run design:check
	npm run design:lint

design-test:
	npm run design:test

design-verify:
	npm run design:verify

.PHONY: starter-catalog-update starter-catalog-check
starter-catalog-update:
	npm run starter-catalog:update $(if $(CATALOG),-- "$(CATALOG)",)
	npm run starter-locales:report -- --write

starter-catalog-check:
	npm run starter-catalog:check
	node --test scripts/import-starter-catalog.test.mjs
	node --test scripts/starter-locale-coverage.test.mjs
	npm run starter-locales:report -- --check

.PHONY: feedbuilder-update feedbuilder-check
feedbuilder-update:
	npm run feedbuilder:update $(if $(FEEDBUILDER),-- "$(FEEDBUILDER)",)

feedbuilder-check:
	npm run feedbuilder:check
	node --test scripts/import-feed-builder.test.mjs

.PHONY: help install format format-check lint storage subpaths i18n i18n-extract i18n-todo i18n-batch i18n-merge i18n-traps test test-ci test-quick test-changed build build-admin build-mockingbird security check check-ci

help:
	@echo "Angular quality gates (admin UI + Mockingbird):"
	@echo "  make install            Install locked dependencies"
	@echo "  make format             Auto-format sources"
	@echo "  make format-check       Check formatting without changes"
	@echo "  make lint               Lint TypeScript and templates"
	@echo "  make storage            Verify every localStorage key is classified"
	@echo "  make dead-code-check    Fail on unused files or undeclared dependencies (knip)"
	@echo "  make dead-code          Full knip report incl. unused exports (advisory)"
	@echo "  make i18n               Verify UI strings are translatable + report coverage"
	@echo "  make i18n-extract       Regenerate public/i18n/en.json from source comments"
	@echo "  make i18n-todo L=de     Write a translation work order for one language"
	@echo "  make i18n-batch L=de    Print the next slice of untranslated keys (N=250, P=prefix)"
	@echo "  make i18n-merge L=de F=b.json  Validate a translation batch, then merge it"
	@echo "  make i18n-traps L=de    Grep a locale for wrong-sense translations"
	@echo "  make test               Run tests with coverage (the gate)"
	@echo "  make test-quick         The same suite and checks without coverage"
	@echo "  make test-changed       Only specs affected by uncommitted changes (BASE=ref, WATCH=1)"
	@echo "  make build              Production-build admin UI and Mockingbird"
	@echo "  make build-admin        Build the packaged admin UI"
	@echo "  make build-mockingbird  Build the standalone Mockingbird site"
	@echo "  make test-seo           Prerender and verify the public SEO pages on demand"
	@echo "  make starter-catalog-update  Bundle the sibling starter catalogue"
	@echo "  make starter-catalog-check   Validate the bundle and importer offline"
	@echo "  make feedbuilder-update      Bundle the reviewed Feed Builder topic pages"
	@echo "  make feedbuilder-check       Validate the Feed Builder bundle and importer offline"
	@echo "  make security           Audit production dependencies"
	@echo "  make check              Full read-only quality gate"

install:
	npm ci

format:
	npm run format

format-check:
	npm run format:check

lint:
	npm run lint

# Guards settings export: an unclassified storage key must never reach a file
# the user publishes. See src/app/storage-registry.ts.
storage:
	npm run check:storage

# Guards deep links on subpath deployments: a subpath the 404 shim does not know
# about silently boots the production app instead of the one that owns the link.
subpaths:
	npm run check:subpaths

# Dead code (knip, configured in knip.json). The check fails on unused files and
# missing or undeclared dependencies, which are cheap to keep at zero. The full
# report also lists unused exports and types: a known backlog, so it is advisory.
.PHONY: dead-code-check dead-code
dead-code-check:
	npm run check:dead-code

dead-code:
	npm run dead-code

# Guards the retrofit in sprint/ui-i18n-*.md: a migrated directory must not
# hardcode user-visible text, and every key must exist in en.json. Non-English
# coverage is reported but never fatal, so a feature ships in English on day one.
i18n:
	npm run check:i18n

# en.json is GENERATED from `// i18n <key>: <English>` comments beside each key.
# Edit the comment, never the JSON.
i18n-extract:
	npm run i18n:extract

# Emits i18n-context/todo-$(L).md: the missing/stale keys with their context and
# glossary. A Claude Code agent translates it with the translate-ui skill — there
# is no API-calling script, by design. See sprint/ui-i18n-2-extraction.md.
#
# The variable is `L`, not `LANG`: every POSIX shell already exports LANG
# (en_US.UTF-8 here), so `make i18n-todo` with no argument would silently
# generate a work order for a locale named "en_US.UTF-8" instead of failing.
i18n-todo:
	@test -n "$(L)" || (echo "Usage: make i18n-todo L=de" && exit 2)
	node scripts/i18n-todo.mjs $(L)

# The work order is the specification; it does not fit in one agent's context at
# 5,700 keys. This prints the next slice of *missing* keys as TSV, largest area
# first, so a batch can be translated and merged. The locale file is the ledger:
# re-run after a merge and the next slice appears with no bookkeeping.
#   N=250 caps the slice, P=settings.rss restricts to a prefix, --areas counts only.
i18n-batch:
	@test -n "$(L)" || (echo "Usage: make i18n-batch L=de [N=250] [P=settings]" && exit 2)
	@node scripts/i18n-batch.mjs $(L) $(ARGS)

# The gate translations must pass to land. Rejects the batch WHOLE on placeholder
# or markup drift, an unknown key, a `max` overflow, or any rule the locale
# declares in scripts/i18n-locale-rules.mjs. German shipped a split du/Sie
# register and a button reading "block the amnesty" because this check ran after
# the fact instead of at the door; French, gated this way, shipped neither.
i18n-merge:
	@test -n "$(L)" || (echo "Usage: make i18n-merge L=de F=batch.json" && exit 2)
	@test -n "$(F)" || (echo "Usage: make i18n-merge L=de F=batch.json" && exit 2)
	node scripts/i18n-merge.mjs $(L) $(F) $(ARGS)

# Advisory sweep for the *wrong sense* of this app's vocabulary — the defect
# class coverage cannot see. Never fatal: a hit is evidence, not a verdict.
i18n-traps:
	@test -n "$(L)" || (echo "Usage: make i18n-traps L=de" && exit 2)
	@node scripts/i18n-traps.mjs $(L) $(P)

test:
	npm run design:inventory-check
	npm run test:source-integrity
	npm run check:libs
	npm run check:dead-code
	npm run test:libs
	npm run test:ci

test-ci: test

# Inner loop, not the gate: everything make test runs except coverage, which
# costs about two minutes. The runtime test manifest is still checked.
test-quick:
	npm run design:inventory-check
	npm run test:source-integrity
	npm run check:libs
	npm run check:dead-code
	npm run test:libs
	npm run test:audit

# Inner loop, not the gate: specs that import (directly or transitively) a file
# changed since HEAD, compiled as a narrowed program. BASE=origin/main widens
# the change set to a branch; WATCH=1 keeps it running. See
# docs/test-performance.md.
test-changed:
	node scripts/test-changed.mjs $(if $(BASE),--base=$(BASE),) $(if $(WATCH),--watch,)

build: build-admin build-mockingbird

build-admin:
	npm run build -- --configuration production

build-mockingbird:
	npm run build:mockingbird

.PHONY: build-seo test-seo
build-seo:
	npm run build:seo

test-seo: build-seo

security:
	npm audit --omit=dev --audit-level=high

check: format-check lint design-check storage subpaths i18n starter-catalog-check feedbuilder-check test build security

check-ci: check
