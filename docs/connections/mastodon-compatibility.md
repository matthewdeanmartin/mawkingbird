# Mastodon server compatibility

Mawkingbird works with almost all Mastodon servers. It uses the server's Mastodon API to read, sign in, and post. Servers can differ in software version, configuration, and which API features they offer, so a feature that works on one server may be unavailable on another.

| What you want to do | What the server needs to allow |
| --- | --- |
| Read public posts without signing in | Public API access from your browser. A server may restrict this. |
| Sign in and use your account | Mastodon-compatible sign-in and API access. |
| Post, follow, or change settings | The relevant API feature and permission for your account. |

If your server uses Mastodon-compatible software rather than Mastodon itself, basic reading may work while some account or posting features differ. Mawkingbird checks for a feature when it can, but this page is not a list of tested servers or a guarantee about a particular server.

## Check your server

1. Open your server's website to make sure it is reachable.
2. [Sign in with Mastodon](../start/sign-in-mastodon.md) using that server's address. If you only want to read public posts, [connect it for anonymous reading](mastodon.md) instead.
3. Try the feature you need. If it is unavailable, check whether your server has disabled it or requires a different permission.

If you cannot tell whether the problem is your browser, network, or server, run [Connection Doctor](connection-doctor.md). A successful connection check does not by itself confirm that every Mastodon feature is available.

If a feature still fails, [send feedback](../contributing.md) with the server software and version, the action you tried, and the error shown. Do not include an access token.
