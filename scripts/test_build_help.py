# /// script
# requires-python = ">=3.12"
# dependencies = [
#     "markdown>=3.7,<4",
#     "ruamel.yaml>=0.18.10,<0.20",
# ]
# ///
"""Tests for build_help.py. Run: make help-site-test (from the repository root)."""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import build_help  # noqa: E402

MKDOCS = """\
site_url: !ENV [READTHEDOCS_CANONICAL_URL, "https://example.invalid/"]
nav:
  - Help home: index.md
  - Start here:
      - Welcome: start/welcome.md
"""

GUIDES = {
    "index.md": "# Mawkingbird Help\n\nShort guides.\n\n[Welcome](start/welcome.md)\n\n[Open](https://mawkingbird.com/){ .btn }\n",
    "start/welcome.md": "# Welcome to Mawkingbird\n\nRead social media in one place, " + "very " * 40
    + "calmly.\n\n## Next\n\nSee [home](../index.md#top) or [Mastodon](https://joinmastodon.org/).\n",
}


class BuildHelpTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp())
        self.docs = self.tmp / "docs"
        self.mkdocs = self.tmp / "mkdocs.yml"
        self.out = self.tmp / "out"
        self.mkdocs.write_text(MKDOCS, encoding="utf-8")
        for name, text in GUIDES.items():
            path = self.docs / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text, encoding="utf-8")

    def build(self, **kwargs: object) -> list[build_help.Page]:
        return build_help.build(self.out, docs=self.docs, mkdocs_file=self.mkdocs, **kwargs)

    def read(self, relative: str) -> str:
        return (self.out / relative).read_text(encoding="utf-8")

    def test_pretty_urls_and_rewritten_links(self) -> None:
        self.build()
        home = self.read("index.html")
        welcome = self.read("start/welcome/index.html")
        self.assertIn('href="/help/start/welcome/"', home)
        self.assertIn('href="/help/#top"', welcome)
        self.assertIn('href="https://joinmastodon.org/" rel="noopener"', welcome)
        self.assertIn('class="btn"', home)
        self.assertIn('<link rel="canonical" href="https://mawkingbird.com/help/start/welcome/">', welcome)
        self.assertIn("<title>Welcome to Mawkingbird · Mawkingbird Help</title>", welcome)
        self.assertIn('aria-current="page">Welcome</a>', welcome)

    def test_description_is_first_paragraph_trimmed(self) -> None:
        pages = self.build()
        welcome = pages[1]
        self.assertTrue(welcome.description.startswith("Read social media in one place"))
        self.assertLessEqual(len(welcome.description), build_help.DESCRIPTION_LIMIT)
        self.assertTrue(welcome.description.endswith("…"))

    def test_pages_ship_no_scripts(self) -> None:
        self.build()
        for page in self.out.rglob("*.html"):
            text = page.read_text(encoding="utf-8")
            self.assertNotIn("<script", text, page)
            self.assertIn("default-src 'none'", text)

    def test_sitemap_lists_every_guide(self) -> None:
        self.build()
        sitemap = self.read("sitemap.xml")
        self.assertIn("<loc>https://mawkingbird.com/help/</loc>", sitemap)
        self.assertIn("<loc>https://mawkingbird.com/help/start/welcome/</loc>", sitemap)

    def test_preview_builds_are_noindex_without_sitemap(self) -> None:
        self.build(base="/canary/help/", noindex=True)
        self.assertIn('content="noindex, follow"', self.read("index.html"))
        self.assertIn('href="/canary/help/start/welcome/"', self.read("index.html"))
        self.assertFalse((self.out / "sitemap.xml").exists())
        home = self.read("index.html")
        self.assertIn('<a class="open-app" href="/canary/">', home)
        self.assertIn('href="/canary/features/"', home)
        self.assertNotIn('href="/features/"', home)

    def test_guide_missing_from_nav_fails(self) -> None:
        (self.docs / "planning.md").write_text("# Internal\n\nNotes.\n", encoding="utf-8")
        with self.assertRaisesRegex(build_help.BuildError, "planning.md"):
            self.build()

    def test_broken_internal_link_fails(self) -> None:
        (self.docs / "start/welcome.md").write_text(
            "# Welcome\n\nSee [gone](gone.md).\n", encoding="utf-8"
        )
        with self.assertRaisesRegex(build_help.BuildError, "missing guide start/gone.md"):
            self.build()

    def test_nav_entry_without_file_fails(self) -> None:
        (self.docs / "start/welcome.md").unlink()
        with self.assertRaisesRegex(build_help.BuildError, "do not exist"):
            self.build()

    def test_real_docs_build(self) -> None:
        pages = build_help.build(self.out)
        self.assertGreater(len(pages), 40)
        self.assertEqual(len({page.slug for page in pages}), len(pages))


if __name__ == "__main__":
    unittest.main()
