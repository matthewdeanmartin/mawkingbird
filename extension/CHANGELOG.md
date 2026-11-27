# Changelog

Mawkingbird for Firefox. Versions are the add-on's own, separate from the web app
and Native. Nothing has been published to addons.mozilla.org yet (dogfooding).

## [Unreleased]

### Added

- 0.6.0: YouTube for mawkingbird.com: search, channels, video details and
  comments, read anonymously from your computer once you allow YouTube.
- 0.6.0: "Let Mawkingbird read any public site" switch (off by default), for
  checking many sites at once such as your friends' blogs.
- 0.5.0: Mawkingbird can ask the add-on to read feeds and pages that websites
  block from browsers, one site at a time with your permission.
- 0.4.0: On YouTube, the sidebar offers Watch in Mawkingbird and Watch with
  replies to your post.
- 0.3.0: The sidebar is about the page you're on: write about it, see your
  posts about it and other people's.
- 0.2.0: Toolbar popup with the page's feeds and its author on the fediverse.
- 0.1.0: Share this page, quote a selection, Open in Mawkingbird, Posts about
  this page.

### Changed

- 0.6.1: YouTube's header fix is a declarative rule Firefox applies; the add-on
  no longer asks for `webRequest`, so it can't see any request's headers or
  cookies.
- 0.6.0: The sidebar passes the page in the address's fragment, which isn't sent
  to mawkingbird.com's host.
