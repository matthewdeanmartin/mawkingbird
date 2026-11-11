# Run from anywhere: make -C spec [build|serve|open|clean]
# uv refuses source builds; Markdown is installed from a published wheel.
SHELL := bash
.DEFAULT_GOAL := build
PORT ?= 8876
PYTHON = uv run --no-project --no-build --with Markdown==3.7 python

.PHONY: build serve open clean
build:
	$(PYTHON) build.py

serve:
	$(PYTHON) build.py --serve --port $(PORT)

open:
	$(PYTHON) build.py --serve --open --port $(PORT)

clean:
	$(PYTHON) build.py --clean
