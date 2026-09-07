.DEFAULT_GOAL := help
MAKEFLAGS += --no-print-directory
MOCKINGBIRD_BASE_HREF ?= /
.PHONY: help install dev mockingbird test test-integration check
help:
	@echo "make install | dev | mockingbird | test | test-integration | check"
	@echo "Override MOCKINGBIRD_BASE_HREF for subpath builds. Use Git Bash on Windows."
install:
	cd ui && npm ci
dev:
	cd ui && npm start
mockingbird: install
	cd ui && npm run build:mockingbird -- --base-href $(MOCKINGBIRD_BASE_HREF)
test:
	$(MAKE) -C ui test
test-integration:
	cd ui && npm run test:integration
check:
	$(MAKE) -C ui check
