.DEFAULT_GOAL := help
MAKEFLAGS += --no-print-directory
MOCKINGBIRD_BASE_HREF ?= /
MOCKINGBIRD_SEO ?= false
# Scratch output (logs, reports, screenshots, Python bytecode) lives outside the
# working tree, in the folder ui/scripts/artifacts.mjs resolves (OS temp, or
# $MAWKINGBIRD_ARTIFACTS). Asking Node keeps Git Bash's /tmp out of it.
export PYTHONPYCACHEPREFIX ?= $(shell node ui/scripts/artifacts.mjs pycache)
.PHONY: help install dev mockingbird help-site help-site-test news news-check news-link test test-integration check
help:
	@echo "make install | dev | mockingbird | test | test-integration | check"
	@echo "Override MOCKINGBIRD_BASE_HREF for subpath builds. Use Git Bash on Windows."
	@echo "Set MOCKINGBIRD_SEO=true to prerender public pages for production publishing."
	@echo "make help-site | help-site-test   Static /help/ pages from docs/ (uv, wheels only)"
	@echo "make news | news-check | news-link   Static /news/ blog from news/posts (fediblog engine)"
install:
	cd ui && npm ci
dev:
	cd ui && npm start
mockingbird: install
	cd ui && MSYS_NO_PATHCONV=1 npm run $(if $(filter true,$(MOCKINGBIRD_SEO)),build:seo,build:mockingbird) -- --base-href "$(MOCKINGBIRD_BASE_HREF)"
	$(if $(filter true,$(MOCKINGBIRD_SEO)),"$(MAKE)" help-site,)
	$(if $(filter true,$(MOCKINGBIRD_SEO)),"$(MAKE)" news,)
# The help site is static HTML built from docs/ with mkdocs.yml's nav; see
# scripts/build_help.py. Production builds it into the published root.
# Previews: HELP_ARGS="--base /canary/help/ --noindex".
HELP_OUT ?= ui/dist-mockingbird/browser/help
HELP_ARGS ?=
help-site:
	uv run --locked --no-build scripts/build_help.py --out "$(HELP_OUT)" $(HELP_ARGS)
help-site-test:
	uv run --locked --no-build scripts/test_build_help.py
# News is a static blog built by fediblog (a separate MIT package, vendored as
# news/vendor/*.tgz and pinned by news/package-lock.json) from news/posts. Its
# comments are Mastodon replies. See spec/news-blog-engine.md and news/README.md.
# Previews: NEWS_ARGS="--url https://mawkingbird.com/canary/news/ --noindex".
# Before building, news-link writes each published post's toot (found on
# @mawkingbird's public timeline) into its front matter; commit those edits.
# A lookup failure only warns, so the build never depends on mastodon.social.
# NEWS_LINK=false skips it.
NEWS_OUT ?= ui/dist-mockingbird/browser/news
NEWS_ARGS ?=
NEWS_LINK ?= true
news:
	cd news && npm ci --no-audit --no-fund
	$(if $(filter true,$(NEWS_LINK)),cd news && (npm run link || echo "news: toot lookup failed; building with the links already in front matter"),)
	cd news && npm run build -- "$(abspath $(NEWS_OUT))" $(NEWS_ARGS)
news-check:
	cd news && npm ci --no-audit --no-fund && npm run check
news-link:
	cd news && npm ci --no-audit --no-fund && npm run link
test:
	$(MAKE) -C ui test
test-integration:
	cd ui && npm run test:integration
check:
	$(MAKE) -C ui check
