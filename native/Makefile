.DEFAULT_GOAL := help
.PHONY: frontend check-host test-host build-host smoke-frontend smoke-host run
frontend:
	node scripts/build-frontend.mjs
check-host:
	cargo check --locked --manifest-path src-tauri/Cargo.toml
test-host:
	cargo test --locked --manifest-path src-tauri/Cargo.toml
build-host:
	cargo build --locked --manifest-path src-tauri/Cargo.toml
smoke-frontend:
	node scripts/smoke-frontend.mjs
smoke-host:
	node scripts/smoke-host.mjs
run:
	cargo run --locked --manifest-path src-tauri/Cargo.toml
.PHONY: help preflight prepare-source deploy-source
help:
	@echo "make preflight       Verify pinned Angular source and local tool versions"
	@echo "make prepare-source  Export exact pinned source to a fresh OS-temp directory"
	@echo "Set MAWKINGBIRD_SOURCE to an existing shared Git checkout if needed."
	@echo "make frontend        Build the shared native target (explicit source override required)"
	@echo "make check-host      Type-check Rust host against prepared frontend assets"
	@echo "make test-host       Test Rust URL/navigation policy"
	@echo "make build-host      Build development executable"
	@echo "make smoke-frontend  Exercise startup/CSP/link routing in Chromium with mocked IPC"
	@echo "make smoke-host      Exercise actual Windows WebView2 with a temporary test profile"
	@echo "make run             Run the development host with the last built frontend"
	@echo "make deploy-source   Mirror native source into ../mawkingbird/native locally"
preflight:
	node scripts/shared-source.mjs check
prepare-source:
	node scripts/shared-source.mjs prepare
deploy-source:
	bash scripts/deploy-source.sh

.PHONY: test-media-adapter
test-media-adapter:
	node scripts/test-media-adapter.mjs

.PHONY: smoke-social-frontend
smoke-social-frontend:
	node scripts/smoke-social-frontend.mjs

.PHONY: smoke-connector-frontend
smoke-connector-frontend:
	node scripts/smoke-connector-frontend.mjs

.PHONY: smoke-publishing-frontend
smoke-publishing-frontend:
	node scripts/smoke-publishing-frontend.mjs

.PHONY: smoke-account-publishing-frontend
smoke-account-publishing-frontend:
	node scripts/smoke-account-publishing-frontend.mjs

.PHONY: smoke-github-hugo-frontend
smoke-github-hugo-frontend:
	node scripts/smoke-github-hugo-frontend.mjs

.PHONY: smoke-intelligence-frontend
smoke-intelligence-frontend:
	node scripts/smoke-intelligence-frontend.mjs

.PHONY: spec-build spec-serve spec-open
spec-build:
	"$(MAKE)" -C spec build
spec-serve:
	"$(MAKE)" -C spec serve
spec-open:
	"$(MAKE)" -C spec open

.PHONY: linux-ubuntu linux-fedora
linux-ubuntu:
	bash scripts/build-linux.sh ubuntu
linux-fedora:
	bash scripts/build-linux.sh fedora
