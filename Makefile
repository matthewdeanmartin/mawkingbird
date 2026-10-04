.DEFAULT_GOAL := help
MAKEFLAGS += --no-print-directory
MOCKINGBIRD_BASE_HREF ?= /
MOCKINGBIRD_SEO ?= false
.PHONY: help install dev mockingbird test test-integration check
help:
	@echo "make install | dev | mockingbird | test | test-integration | check"
	@echo "Override MOCKINGBIRD_BASE_HREF for subpath builds. Use Git Bash on Windows."
	@echo "Set MOCKINGBIRD_SEO=true to prerender public pages for production publishing."
install:
	cd ui && npm ci
dev:
	cd ui && npm start
mockingbird: install
	cd ui && MSYS_NO_PATHCONV=1 npm run $(if $(filter true,$(MOCKINGBIRD_SEO)),build:seo,build:mockingbird) -- --base-href "$(MOCKINGBIRD_BASE_HREF)"
test:
	$(MAKE) -C ui test
test-integration:
	cd ui && npm run test:integration
check:
	$(MAKE) -C ui check
