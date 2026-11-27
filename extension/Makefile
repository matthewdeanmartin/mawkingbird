# Mawkingbird for Firefox. Git Bash + Node 26. See README.md.
# None of these run in CI.

.PHONY: install test lint check run build sign clean harness

# Built packages go outside the tree (see ../ui/scripts/artifacts.mjs).
OUT = $(shell node ../ui/scripts/artifacts.mjs extension)

install:
	npm ci

test:
	npm test

lint:
	npm run lint

# The two cheap checks, in order.
check: test lint

# Opens a throwaway Firefox profile with the extension loaded; reloads on save.
run:
	npm start

# Unsigned .zip outside the tree: <OS temp>/mawkingbird/extension/
# (node ../ui/scripts/artifacts.mjs extension prints the folder).
build:
	npx web-ext build --source-dir src --artifacts-dir "$(OUT)" --overwrite-dest

# Signed, self-distributed .xpi (needs WEB_EXT_API_KEY and WEB_EXT_API_SECRET
# from addons.mozilla.org > Developer Hub > Manage API Keys).
sign:
	npx web-ext sign --source-dir src --artifacts-dir "$(OUT)" --channel unlisted

# The bridge's local test page (spec sprint 5): http://localhost:4300/dev/harness.html
harness:
	node dev/serve.mjs

clean:
	rm -rf node_modules
