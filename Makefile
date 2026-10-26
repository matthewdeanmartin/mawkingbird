.DEFAULT_GOAL := help
MAKEFLAGS += --no-print-directory
MOCKINGBIRD_BASE_HREF ?= /
MOCKINGBIRD_SEO ?= false
.PHONY: help install dev mockingbird help-site help-site-test test test-integration check
help:
	@echo "make install | dev | mockingbird | test | test-integration | check"
	@echo "Override MOCKINGBIRD_BASE_HREF for subpath builds. Use Git Bash on Windows."
	@echo "Set MOCKINGBIRD_SEO=true to prerender public pages for production publishing."
	@echo "make help-site | help-site-test   Static /help/ pages from docs/ (uv, wheels only)"
install:
	cd ui && npm ci
dev:
	cd ui && npm start
mockingbird: install
	cd ui && MSYS_NO_PATHCONV=1 npm run $(if $(filter true,$(MOCKINGBIRD_SEO)),build:seo,build:mockingbird) -- --base-href "$(MOCKINGBIRD_BASE_HREF)"
	$(if $(filter true,$(MOCKINGBIRD_SEO)),"$(MAKE)" help-site,)
# The help site is static HTML built from docs/ with mkdocs.yml's nav; see
# scripts/build_help.py. Production builds it into the published root.
HELP_OUT ?= ui/dist-mockingbird/browser/help
help-site:
	uv run --locked --no-build scripts/build_help.py --out "$(HELP_OUT)"
help-site-test:
	uv run --locked --no-build scripts/test_build_help.py
test:
	$(MAKE) -C ui test
test-integration:
	cd ui && npm run test:integration
check:
	$(MAKE) -C ui check
