.DEFAULT_GOAL := help
MAKEFLAGS += --no-print-directory
MOCKINGBIRD_BASE_HREF ?= /
MOCKINGBIRD_SEO ?= false
# A self-hosted Mastodon instance this build belongs to (ops/MASTODON_INSTANCE.md).
MOCKINGBIRD_HOME_SERVER ?=
# Gate logs go in the ignored log/ folder. Reports, screenshots and Python
# bytecode use ui/scripts/artifacts.mjs (OS temp or $MAWKINGBIRD_ARTIFACTS).
export PYTHONPYCACHEPREFIX ?= $(shell node ui/scripts/artifacts.mjs pycache)
.PHONY: help install dev mockingbird help-site help-site-test news news-check news-link test test-integration check
help:
	@echo "make install | dev | mockingbird | test | test-integration | check"
	@echo "Override MOCKINGBIRD_BASE_HREF for subpath builds. Use Git Bash on Windows."
	@echo "Set MOCKINGBIRD_SEO=true to prerender public pages for production publishing."
	@echo "Set MOCKINGBIRD_HOME_SERVER=https://your.instance to build for one Mastodon server."
	@echo "make help-site | help-site-test   Static /help/ pages from docs/ (uv, wheels only)"
	@echo "make native-changelog | native-changelog-check   Copy NATIVE_CHANGELOG.md to the private Native repo"
	@echo "make news | news-check | news-link   Static /news/ blog from news/posts (fediblog engine)"
install:
	cd ui && npm ci
dev:
	cd ui && npm start
mockingbird: install
	cd ui && MSYS_NO_PATHCONV=1 npm run $(if $(filter true,$(MOCKINGBIRD_SEO)),build:seo,build:mockingbird) -- --base-href "$(MOCKINGBIRD_BASE_HREF)"
	node ui/scripts/set-home-server.mjs ui/dist-mockingbird/browser "$(MOCKINGBIRD_HOME_SERVER)"
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
# NATIVE_CHANGELOG.md is the source of truth; the private repo keeps a copy
# (ops/NATIVE_CHANGELOG_RUNBOOK.md).
.PHONY: native-changelog native-changelog-check
NATIVE_REPO ?= ../mawkingbird_native
native-changelog:
	uvx --no-build --from keepachangelog-manager-fork==6.10.1 kaclm --component native validate
	test -f "$(NATIVE_REPO)/src-tauri/tauri.conf.json"
	cp NATIVE_CHANGELOG.md "$(NATIVE_REPO)/CHANGELOG.md"
native-changelog-check:
	cmp NATIVE_CHANGELOG.md "$(NATIVE_REPO)/CHANGELOG.md"
test:
	$(MAKE) -C ui test
test-integration:
	cd ui && npm run test:integration
check:
	$(MAKE) -C ui check
