"""Regression checks for the fast deep-link source audit."""

from __future__ import annotations

import unittest
from contextlib import redirect_stderr, redirect_stdout
from io import StringIO

import audit_deep_links as audit


class DeepLinkAuditTests(unittest.TestCase):
    def test_current_route_contracts_are_classified_and_reachable(self) -> None:
        with redirect_stdout(StringIO()), redirect_stderr(StringIO()):
            self.assertEqual(audit.main(), 0)

    def test_removing_an_anonymous_entry_reveals_a_broken_link(self) -> None:
        original = audit.GUARD
        try:
            audit.GUARD = original.replace("publicBlueskyPage ||", "")
            pack = next(link for link in audit.LINKS if link.name == "Bluesky starter pack")
            self.assertFalse(audit.anonymous_entry(pack, audit.guard_regexes()))
        finally:
            audit.GUARD = original

    def test_a_new_parameterized_route_requires_review(self) -> None:
        original = audit.ROUTES
        try:
            audit.ROUTES = original + "\n{ path: 'new/public/:id' }"
            output = StringIO()
            with redirect_stdout(output), redirect_stderr(output):
                self.assertEqual(audit.main(), 1)
            self.assertIn("new/public/:id", output.getvalue())
        finally:
            audit.ROUTES = original


if __name__ == "__main__":
    unittest.main()
