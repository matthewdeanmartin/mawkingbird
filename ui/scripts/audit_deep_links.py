"""Fast source audit of URLs a signed-in reader can copy or share.

No Angular build, TypeScript compilation, browser, or network call. Runtime
behavior is covered by shared-deep-link-journeys.spec.ts; this catches route
and anonymous-entry drift before paying that compile cost.
"""

from __future__ import annotations

import re
import sys
from dataclasses import dataclass
from pathlib import Path


UI = Path(__file__).resolve().parents[1]
ROUTES = (UI / "src/app/app.routes.ts").read_text(encoding="utf-8")
GUARD = (UI / "src/app/platform/session/auth.guard.ts").read_text(encoding="utf-8")


@dataclass(frozen=True)
class Link:
    name: str
    route: str
    example: str
    producer: str
    producer_marker: str
    access: str


# A URL is here only when the app produces it or visibly offers it as a link.
# The route and producer are checked against the source; examples are probes of
# the guard's source regexes, not a second implementation of the Angular app.
LINKS = (
    Link("Mastodon post", "matcher:mastodonPostLinkMatcher", "/far.example/@alice@far.example/42", "src/app/posts/copy-link/deep-links.ts", "postDeepLink", "copied"),
    Link("Mastodon account", "matcher:accountHandleLinkMatcher", "/@alice@far.example", "src/app/posts/copy-link/deep-links.ts", "accountDeepLink", "copied"),
    Link("Bluesky post", "bsky/profile/:actor/post/:rkey", "/bsky/profile/did:plc:alice/post/3kxyz", "src/app/posts/copy-link/deep-links.ts", "bsky/profile/", "copied"),
    Link("Bluesky account", "bsky/profile/:actor", "/bsky/profile/did:plc:alice", "src/app/posts/copy-link/deep-links.ts", "bsky/profile/", "copied"),
    Link("Twitter post", "twitter/:user/status/:id", "/twitter/alice/status/99", "src/app/posts/copy-link/deep-links.ts", "/twitter/", "copied"),
    Link("Twitter account", "twitter/:user", "/twitter/alice", "src/app/posts/copy-link/deep-links.ts", "/twitter/", "copied"),
    Link("Watch video", "watch", "/watch?post=bsky%3Aat%3A%2F%2Fdid%3Aplc%3Aalice%2Fapp.bsky.feed.post%2F3kxyz&attachment=v1", "src/app/reading/video-player/media-source.ts", "watchParams", "watch"),
    Link("Mastodon thread", "statuses/:id", "/statuses/123", "src/app/posts/status-card/status-card.ts", "'/statuses'", "regex"),
    Link("Mastodon reader", "read/:id", "/read/123", "src/app/reading/thread/thread.html", "['/read'", "regex"),
    Link("Mastodon profile", "accounts/:id", "/accounts/123", "src/app/posts/status-card/status-card.ts", "'/accounts'", "regex"),
    Link("Qualified profile", "accounts/:id/:handle", "/accounts/123/@alice@far.example", "src/app/accounts/account-route.ts", "accountProfilePath", "regex"),
    Link("Hashtag", "tags/:tag", "/tags/birds", "src/app/posts/status-card/status-card.ts", "'/tags'", "regex"),
    Link("Shared message", "message/:id", "/message/message-status.abc", "src/app/connections/paste/message-payload.ts", "/message/", "top-level"),
    Link("Bundled starter collection", "collections/starter/:slug", "/collections/starter/birds", "src/app/public-pages/features/follow-kit.html", "'/collections/starter'", "regex"),
    Link("Bluesky starter pack", "bluesky/starter-packs/:actor/:rkey", "/bluesky/starter-packs/did:plc:alice/3pack", "src/app/connections/bluesky/bluesky-starter-packs.ts", "starterPackPath", "regex"),
    Link("Bluesky feed or list", "feeds/bluesky/:ref", "/feeds/bluesky/feed:at:%2F%2Fdid:plc:alice%2Fapp.bsky.feed.generator%2Fbirds", "src/app/accounts/bluesky-links.ts", "'/feeds/bluesky'", "regex"),
)


# These are not promised as portable public URLs. They still appear in the
# report so a developer sees the question when adding or changing a route.
SERVER_OR_LOCAL = {
    "annual-report/:year": "account-specific report",
    "client-lists/:id": "browser-local list id",
    "collections/:id": "server-local collection; anonymousCollectionGuard decides",
    "collections/preview/:id": "server-local collection preview",
    "endorsed/:accountId": "server-local account id",
    "feeds/:feed": "saved feed selected in this browser",
    "feeds/servers/:server": "server feed; review whether public entry is useful",
    "feeds/servers/:server/:feed": "server feed; review whether public entry is useful",
    "filters/:id": "private account filter",
    "forum/d/:id": "Forum explicitly requires an account",
    "lists/:id": "server-local list id",
    "misskey/:kind/:id": "active Misskey identity required",
    "tag-bundles/:id": "saved account bundle",
}


def route_regex(pattern: str) -> re.Pattern[str]:
    pieces = [r"[^/]+" if part.startswith(":") else re.escape(part) for part in pattern.split("/")]
    return re.compile(r"^/" + "/".join(pieces) + r"/?$")


def guard_regexes() -> list[re.Pattern[str]]:
    """Extract anchored JS regex literals used by authGuard, without executing TS."""
    found = []
    final_if = GUARD.split("  if (\n", 1)[1].split("  ) {", 1)[0]
    owner = None
    for line in GUARD.splitlines():
        declared = re.search(r"\bconst (\w+)\s*=", line)
        if declared:
            owner = declared.group(1)
        start = line.find("/^")
        active = (owner and f"{owner} ||" in final_if) or line.strip() in final_if
        if start < 0 or ".test(" not in line or not active:
            if ";" in line:
                owner = None
            continue
        escaped = False
        in_class = False
        for pos in range(start + 1, len(line)):
            char = line[pos]
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == "[":
                in_class = True
            elif char == "]":
                in_class = False
            elif char == "/" and not in_class:
                found.append(re.compile(line[start + 1 : pos].replace(r"\/", "/")))
                break
        if ";" in line:
            owner = None
    return found


def anonymous_entry(link: Link, patterns: list[re.Pattern[str]]) -> bool:
    path = link.example.split("?", 1)[0]
    if link.access == "regex":
        return any(pattern.search(path) for pattern in patterns)
    if link.access == "copied":
        return "copiedLink ||" in GUARD and all(
            marker in GUARD
            for marker in (
                "mastodonPostLinkMatcher(segments)",
                "accountHandleLinkMatcher(segments)",
                "parts[0] === 'bsky'",
                "parts[0] === 'twitter'",
            )
        )
    if link.access == "watch":
        return "publicWatch ||" in GUARD and "link.pathname === '/watch'" in GUARD
    if link.access == "top-level":
        return ROUTES.index("path: 'message/:id'") < ROUTES.index("canActivate: [authGuard]")
    return False


def main() -> int:
    declared = set(re.findall(r"\bpath:\s*'([^']*)'", ROUTES))
    parameterized = {route for route in declared if ":" in route}
    classified = {link.route for link in LINKS if not link.route.startswith("matcher:")}
    unclassified = sorted(parameterized - classified - SERVER_OR_LOCAL.keys())
    errors = []
    patterns = guard_regexes()

    for link in LINKS:
        if link.route.startswith("matcher:"):
            route_ok = f"matcher: {link.route.split(':', 1)[1]}" in ROUTES
        else:
            route_ok = link.route in declared and bool(route_regex(link.route).match(link.example.split("?", 1)[0]))
        producer = (UI / link.producer).read_text(encoding="utf-8")
        producer_ok = link.producer_marker in producer
        entry_ok = anonymous_entry(link, patterns)
        if not (route_ok and producer_ok and entry_ok):
            errors.append(f"{link.name}: route={route_ok}, producer={producer_ok}, anonymous entry={entry_ok} ({link.example})")

    if unclassified:
        errors.append("New parameterized routes need a shareability decision: " + ", ".join(unclassified))
    print(f"Deep links: {len(declared)} route patterns, {len(parameterized)} parameterized; {len(LINKS)} produced-link contracts.")
    for route, reason in sorted(SERVER_OR_LOCAL.items()):
        print(f"  REVIEW /{route} — {reason}")
    for error in errors:
        print(f"  BROKEN {error}", file=sys.stderr)
    print(f"Result: {len(errors)} broken or unclassified contract(s).")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
