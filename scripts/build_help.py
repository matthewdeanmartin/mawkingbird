# /// script
# requires-python = ">=3.12"
# dependencies = [
#     "markdown>=3.7,<4",
#     "ruamel.yaml>=0.18.10,<0.20",
# ]
# ///
"""Build the static help site served at https://mawkingbird.com/help/.

The guides in ``docs/`` are the single source. ``mkdocs.yml`` supplies the
navigation, so Read the Docs and this site list the same pages in the same
order. Each guide becomes a plain HTML page in a three-column layout that lines
up with the app's Home screen: the topic list sits where the left rail is, and
the guide spans the centre column and right rail. No JavaScript is shipped or
needed; the pages carry a Content-Security-Policy that forbids scripts.

Usage (Git Bash, from the repository root)::

    make help-site                      # writes ui/dist-mockingbird/browser/help/
    uv run --locked --no-build scripts/build_help.py --out some/dir

The build fails, rather than warns, when a guide is missing from the nav, a nav
entry has no file, or an internal link points at a guide that does not exist.
"""

from __future__ import annotations

import argparse
import html
import re
import shutil
import sys
from dataclasses import dataclass, field
from pathlib import Path, PurePosixPath
from xml.etree import ElementTree

import markdown
from ruamel.yaml import YAML
from markdown.extensions import Extension
from markdown.treeprocessors import Treeprocessor

REPO = Path(__file__).resolve().parent.parent
DOCS = REPO / "docs"
MKDOCS = REPO / "mkdocs.yml"
STATIC = Path(__file__).resolve().parent / "help_static"
SITE_ORIGIN = "https://mawkingbird.com"
SITE_NAME = "Mawkingbird Help"
SHARE_IMAGE = f"{SITE_ORIGIN}/mockingbird_hand.png"
DESCRIPTION_LIMIT = 160

# Script-free by construction: these pages are documents, not an app.
CSP = (
    "default-src 'none'; style-src 'self'; img-src 'self' https: data:; "
    "base-uri 'none'; form-action 'none'"
)


class BuildError(Exception):
    """A content problem that must be fixed in docs/ or mkdocs.yml."""


@dataclass
class Page:
    source: PurePosixPath  # relative to docs/, e.g. start/welcome.md
    nav_title: str
    section: str | None
    title: str = ""
    description: str = ""
    body: str = ""
    links: list[str] = field(default_factory=list)

    @property
    def slug(self) -> str:
        """URL path below the help root, without slashes at either end."""
        stem = self.source.with_suffix("")
        if stem.name == "index":
            stem = stem.parent
        return "" if str(stem) == "." else stem.as_posix()


def url_for(base: str, slug: str) -> str:
    return f"{base}{slug}/" if slug else base


def _yaml() -> YAML:
    """A pure-Python reader: no native wheel is needed on any interpreter."""
    reader = YAML(typ="safe", pure=True)
    # mkdocs.yml's ``!ENV`` tags only matter to mkdocs itself.
    reader.constructor.add_constructor("!ENV", lambda loader, node: None)
    return reader


def load_nav(mkdocs_file: Path = MKDOCS) -> list[Page]:
    config = _yaml().load(mkdocs_file.read_text(encoding="utf-8"))
    pages: list[Page] = []

    def walk(entries: list, section: str | None) -> None:
        for entry in entries:
            if isinstance(entry, str):
                pages.append(Page(PurePosixPath(entry), entry, section))
                continue
            for title, value in entry.items():
                if isinstance(value, list):
                    walk(value, title)
                else:
                    pages.append(Page(PurePosixPath(value), title, section))

    walk(config.get("nav", []), None)
    return pages


class _LinkRewriter(Treeprocessor):
    """Point ``.md`` links at the published pages and record what they target."""

    def __init__(self, md: markdown.Markdown, builder: "HelpBuilder") -> None:
        super().__init__(md)
        self.builder = builder

    def run(self, root: ElementTree.Element) -> None:
        page = self.builder.current
        for anchor in root.iter("a"):
            href = anchor.get("href", "")
            if re.match(r"^[a-z][a-z0-9+.-]*:|^//|^#", href, re.IGNORECASE):
                if href.startswith(("http://", "https://")) and not href.startswith(SITE_ORIGIN):
                    anchor.set("rel", "noopener")
                continue
            target, _, fragment = href.partition("#")
            resolved = PurePosixPath(
                _normalise(page.source.parent / target) if target else page.source
            )
            page.links.append(resolved.as_posix())
            slug = self.builder.slug_for(resolved)
            anchor.set("href", url_for(self.builder.base, slug) + (f"#{fragment}" if fragment else ""))


class _LinkExtension(Extension):
    def __init__(self, builder: "HelpBuilder") -> None:
        super().__init__()
        self.builder = builder

    def extendMarkdown(self, md: markdown.Markdown) -> None:  # noqa: N802 (Markdown API)
        md.treeprocessors.register(_LinkRewriter(md, self.builder), "help_links", 1)


def _normalise(path: PurePosixPath) -> str:
    parts: list[str] = []
    for part in path.parts:
        if part == "..":
            if not parts:
                raise BuildError(f"link escapes docs/: {path}")
            parts.pop()
        elif part != ".":
            parts.append(part)
    return "/".join(parts)


def _plain(fragment: str) -> str:
    return html.unescape(re.sub(r"<[^>]+>", "", fragment)).strip()


def _describe(body: str) -> str:
    match = re.search(r"<p>(.*?)</p>", body, re.DOTALL)
    text = re.sub(r"\s+", " ", _plain(match.group(1))) if match else ""
    if len(text) <= DESCRIPTION_LIMIT:
        return text
    cut = text[: DESCRIPTION_LIMIT - 1].rsplit(" ", 1)[0].rstrip(",;:")
    return cut + "…"


class HelpBuilder:
    def __init__(self, docs: Path, pages: list[Page], base: str, noindex: bool) -> None:
        self.docs = docs
        self.pages = pages
        self.base = base
        self.noindex = noindex
        self.by_source = {page.source.as_posix(): page for page in pages}
        # The app this help belongs to: /help/ -> /, /canary/help/ -> /canary/.
        parent = PurePosixPath(base).parent.as_posix()
        self.app_base = parent if parent.endswith("/") else parent + "/"
        self.current: Page = pages[0]

    def slug_for(self, source: PurePosixPath) -> str:
        page = self.by_source.get(source.as_posix())
        if page is None:
            raise BuildError(f"{self.current.source}: link to missing guide {source}")
        return page.slug

    def validate_sources(self) -> None:
        listed = set(self.by_source)
        on_disk = {p.relative_to(self.docs).as_posix() for p in self.docs.rglob("*.md")}
        if missing := sorted(listed - on_disk):
            raise BuildError(f"mkdocs.yml lists guides that do not exist: {missing}")
        if unlisted := sorted(on_disk - listed):
            raise BuildError(
                f"guides missing from the mkdocs.yml nav (add them, or move internal notes to spec/): {unlisted}"
            )
        if len(self.pages) != len(listed):
            raise BuildError("mkdocs.yml lists a guide more than once")

    def render_markdown(self) -> None:
        for page in self.pages:
            self.current = page
            md = markdown.Markdown(
                extensions=["attr_list", "tables", "toc", _LinkExtension(self)],
                extension_configs={"toc": {"permalink": "#", "permalink_title": "Link to this section"}},
                output_format="html",
            )
            body = md.convert((self.docs / page.source).read_text(encoding="utf-8"))
            heading = re.search(r"<h1[^>]*>(.*?)</h1>", body, re.DOTALL)
            if not heading:
                raise BuildError(f"{page.source} needs a level-one heading")
            page.title = _plain(re.sub(r'<a class="headerlink".*?</a>', "", heading.group(1)))
            page.body = body
            page.description = _describe(body)
            if not page.description:
                raise BuildError(f"{page.source} needs an opening paragraph to describe it")

    # -- HTML -------------------------------------------------------------------

    def _nav(self, current: Page) -> str:
        out: list[str] = []
        section: object = object()
        for page in self.pages:
            if page.section != section:
                if out:
                    out.append("</ul>")
                section = page.section
                if section:
                    out.append(f"<h2>{html.escape(section)}</h2>")
                out.append("<ul>")
            mark = ' aria-current="page"' if page is current else ""
            out.append(
                f'<li><a href="{url_for(self.base, page.slug)}"{mark}>{html.escape(page.nav_title)}</a></li>'
            )
        out.append("</ul>")
        return "\n".join(out)

    def _pager(self, index: int) -> str:
        links = []
        if index > 0:
            prev = self.pages[index - 1]
            links.append(
                f'<a rel="prev" href="{url_for(self.base, prev.slug)}"><span>Previous</span>{html.escape(prev.nav_title)}</a>'
            )
        if index < len(self.pages) - 1:
            nxt = self.pages[index + 1]
            links.append(
                f'<a rel="next" href="{url_for(self.base, nxt.slug)}"><span>Next</span>{html.escape(nxt.nav_title)}</a>'
            )
        return f'<nav class="pager" aria-label="More guides">{"".join(links)}</nav>'

    def render_page(self, index: int) -> str:
        page = self.pages[index]
        canonical = SITE_ORIGIN + url_for(self.base, page.slug)
        title = SITE_NAME if not page.slug else f"{page.title} · {SITE_NAME}"
        robots = "noindex, follow" if self.noindex else "index, follow"
        e = html.escape
        crumb = f'<p class="eyebrow">{e(page.section)}</p>' if page.section else ""
        nav = self._nav(page)
        app = self.app_base
        return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="{CSP}">
<meta name="referrer" content="strict-origin-when-cross-origin">
<title>{e(title)}</title>
<meta name="description" content="{e(page.description)}">
<meta name="robots" content="{robots}">
<link rel="canonical" href="{canonical}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Mawkingbird">
<meta property="og:title" content="{e(title)}">
<meta property="og:description" content="{e(page.description)}">
<meta property="og:url" content="{canonical}">
<meta property="og:image" content="{SHARE_IMAGE}">
<meta property="og:image:alt" content="The hand-drawn Mawkingbird">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/png" sizes="32x32" href="{app}favicon-32x32.png">
<link rel="stylesheet" href="{self.base}help.css">
</head>
<body>
<a class="skip" href="#guide">Skip to guide</a>
<header class="topbar"><div class="topbar-inner">
<a class="brand" href="{app}"><img class="brand-mark" src="{app}mockingbird_hand_104.png" width="36" height="36" alt="">Mawkingbird</a>
<a class="section-name" href="{self.base}">Help</a>
<a class="open-app" href="{app}">Open the app</a>
</div></header>
<div class="layout">
<nav class="rail" aria-label="Help topics">
{nav}
</nav>
<main class="column" id="guide">
<details class="topics"><summary>All help topics</summary>
<nav aria-label="Help topics (compact)">
{nav}
</nav>
</details>
<article>
{crumb}
{page.body}
</article>
{self._pager(index)}
</main>
</div>
<footer class="site-footer">
<a href="{app}features/">Features</a>
<a href="{app}blog/">Blog</a>
<a href="{app}about/">About</a>
<a href="https://github.com/matthewdeanmartin/mawkingbird" rel="noopener">Source code</a>
</footer>
</body>
</html>
"""

    def sitemap(self) -> str:
        urls = "\n".join(
            f"  <url><loc>{SITE_ORIGIN}{url_for(self.base, page.slug)}</loc></url>" for page in self.pages
        )
        return (
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
            f"{urls}\n</urlset>\n"
        )

    def write(self, out: Path) -> None:
        if out.exists():
            shutil.rmtree(out)
        out.mkdir(parents=True)
        for index, page in enumerate(self.pages):
            target = out / page.slug / "index.html" if page.slug else out / "index.html"
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(self.render_page(index), encoding="utf-8", newline="\n")
        shutil.copyfile(STATIC / "help.css", out / "help.css")
        if not self.noindex:
            (out / "sitemap.xml").write_text(self.sitemap(), encoding="utf-8", newline="\n")


def build(out: Path, base: str = "/help/", noindex: bool = False, docs: Path = DOCS,
          mkdocs_file: Path = MKDOCS) -> list[Page]:
    if not (base.startswith("/") and base.endswith("/")):
        raise BuildError(f"--base must start and end with '/': {base}")
    builder = HelpBuilder(docs, load_nav(mkdocs_file), base, noindex)
    builder.validate_sources()
    builder.render_markdown()
    titles = [page.title for page in builder.pages]
    if duplicates := sorted({t for t in titles if titles.count(t) > 1}):
        raise BuildError(f"guides must have distinct titles: {duplicates}")
    builder.write(out)
    return builder.pages


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--out", type=Path, required=True, help="output directory (replaced)")
    parser.add_argument("--base", default="/help/", help="public path of the help root")
    parser.add_argument("--noindex", action="store_true", help="for preview deployments")
    args = parser.parse_args(argv)
    try:
        pages = build(args.out, args.base, args.noindex)
    except BuildError as error:
        print(f"help site: {error}", file=sys.stderr)
        return 1
    print(f"help site: wrote {len(pages)} guides to {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
