.DEFAULT_GOAL := help
MAKEFLAGS += --no-print-directory

.PHONY: starter-catalog-update starter-catalog-check
starter-catalog-update:
	npm run starter-catalog:update $(if $(CATALOG),-- "$(CATALOG)",)
	npm run starter-locales:report -- --write

starter-catalog-check:
	npm run starter-catalog:check
	node --test scripts/import-starter-catalog.test.mjs
	node --test scripts/starter-locale-coverage.test.mjs
	npm run starter-locales:report -- --check

.PHONY: help install format format-check lint storage subpaths i18n i18n-extract i18n-todo i18n-batch i18n-merge i18n-traps test test-ci build build-admin build-mockingbird security check check-ci

help:
	@echo "Angular quality gates (admin UI + Mockingbird):"
	@echo "  make install            Install locked dependencies"
	@echo "  make format             Auto-format sources"
	@echo "  make format-check       Check formatting without changes"
	@echo "  make lint               Lint TypeScript and templates"
	@echo "  make storage            Verify every localStorage key is classified"
	@echo "  make i18n               Verify UI strings are translatable + report coverage"
	@echo "  make i18n-extract       Regenerate public/i18n/en.json from source comments"
	@echo "  make i18n-todo L=de     Write a translation work order for one language"
	@echo "  make i18n-batch L=de    Print the next slice of untranslated keys (N=250, P=prefix)"
	@echo "  make i18n-merge L=de F=b.json  Validate a translation batch, then merge it"
	@echo "  make i18n-traps L=de    Grep a locale for wrong-sense translations"
	@echo "  make test               Run tests with coverage"
	@echo "  make build              Production-build admin UI and Mockingbird"
	@echo "  make build-admin        Build the packaged admin UI"
	@echo "  make build-mockingbird  Build the standalone Mockingbird site"
	@echo "  make starter-catalog-update  Bundle the sibling starter catalogue"
	@echo "  make starter-catalog-check   Validate the bundle and importer offline"
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
	npm run test:source-integrity
	npm run test:ci

test-ci: test

build: build-admin build-mockingbird

build-admin:
	npm run build -- --configuration production

build-mockingbird:
	npm run build:mockingbird

security:
	npm audit --omit=dev --audit-level=high

check: format-check lint storage subpaths i18n starter-catalog-check test build security

check-ci: check
