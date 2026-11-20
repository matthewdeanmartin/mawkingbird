.DEFAULT_GOAL := help

.PHONY: help serve check

help:
	@echo "Mawkingbird copy museum"
	@echo "  make serve       Browse at http://127.0.0.1:4177"
	@echo "  make check       Validate catalogue extraction"

serve:
	node server.mjs

check:
	node --test *.test.mjs
