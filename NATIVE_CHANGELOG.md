# Mawkingbird Native changelog

This changelog covers the desktop application. The continuously deployed website
has its own release cadence.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The maintainer writes and reviews the user-facing notes before each public
release.

## [Unreleased]
### Added
- Explore: a new app-switcher mode brings Feed checkup, starter kits, people search and hashtags together. The checkup points out a thin Home feed, missing followed hashtags and a high share of automated posts.
- Explore > Tags: find hashtags from your posts, tags similar to those you follow, server trends and the featured hashtags of your mutuals. Follow them without leaving the page.
- Your drafts: a sidebar card in Fedi and Explore shows recent unfinished posts and lets you pick one up where you left off.
- Watch: go back to the previous video in your queue, add or remove the current video, and like its source post from beside the player. Going Back leaves Watch instead of retracing the playlist.
- More starter kits and Feed Builder topics, including Latvian arts and computing, computing in Greek, Hungarian and Lithuanian, and new reading, cooking, photography and hobby topics.
- Screen share mode in Settings > Content or Even more: hide followers-only posts, messages, the Inbox, draft pages and draft previews, and hide pseudonymous accounts from account switchers. A header badge turns it off.
- Save exports through the desktop save dialog: Unbird files, CSV lists, settings backups, RSS subscriptions, bookmark HTML and code files. Generated files up to 32 MiB are supported.

### Changed
- Inbox opens on Conversations, with separate Stats, Who and Stream views. Likes and boosts have their own view with faces; they no longer normally light the inbox dot.
- Home > Profiles: posts refresh gradually while the app is open, with mutuals checked more often. Update posts shows progress and can be stopped; Rescan who you follow picks up follows made in other apps.
- Mastodon profiles fetch current posts and pinned posts when opened, instead of starting with only the posts saved on this computer.
- When your server is unavailable or limiting requests, saved pages can keep you reading. A banner says when a saved copy is being shown and offers Try again.
- The Even more menu gathers less-used tools and shortcuts. Explore keeps its navigation when you open a starter kit or hashtag, and older starter-kit links open their replacement collections.

### Fixed
- Opening a Mastodon profile or several public reads together no longer immediately refuses requests beyond the connection limit; they wait briefly for a turn.
- Home > Profiles follows changes made in this app: newly followed people are added and their recent posts collected, while unfollowed or blocked people leave the following list.
- Feed Doctor now unfollows a signed-in Mastodon account on the server, instead of only changing the anonymous follow list.
- Shared Watch links can find a public Mastodon post when you are signed in on a different server, instead of asking you to switch servers.
- Delete & repost preserves existing attachments, their descriptions and focal points, and replaces the deleted post in the view. Replies you send inline appear beneath the post you answered.
- Public Mastodon reads can show who boosted or liked a post on its original server, and open profiles and posts whose server uses letters as well as digits in their IDs.

## [0.2.0] - 2026-11-23
### Added
- Blog: read any Mastodon account as a blog. Long posts and threads become articles, replies become comments, and Roll collects the articles of everyone you follow. Give your own post a title and see whether it will appear as an article before you publish it.
- Unbird: open your Twitter archive, find the people you followed who are now on Mastodon, follow them, and search your old tweets and likes. You can also repost your best tweets a few a day, as text. The archive is read on your computer.
- Radio: save recordings you find in posts as Singles, put them in playlists that play straight through, and share either one. Podcast starter kits help you find shows by subject.
- YouTube: channel pages, chapters, video details and comments, and skipping of sponsor segments. Subscribe to a channel without a YouTube account, and follow its creator on Mastodon when they have an account there. Kits of YouTubers on Mastodon, by language and subject, get you started.
- Home > Profiles: read one person at a time, with unread counts, from posts saved on your computer. Scrolling past a post marks it read.
- Relationships: read posts by group, such as mutuals, people who boost you, or people who have gone quiet.
- Catch-up: everything the people you follow posted since last time, grouped by person, with an end.
- Pick up where you left off: Home opens at the last post you read, even if you read it in another app.
- On a profile, filter posts by type (articles, discussions, long posts, polls, links, media) and find words in them.
- Analytics for your account: how many people a post probably reached, when your audience is around, when a post is done getting reactions, who boosts you most, and which posts bring in new people. Single posts have analytics too, under More tools. Your history builds up on your computer.
- See who follows you: the servers, account ages and sizes behind your followers, and recent followers worth a look. Accounts that post like a bot are labelled, with the reason.
- Wellness settings: hide counts, take breaks, go grayscale, close Explore and trends outside times you choose, and quiet your notifications. All of it is optional.
- Adult content filter in search and the directory: hide it, or see only it. Each hidden item says why.
- Find people who post in your language, with a picker that covers every language a post can be tagged with.
- Fetch from the original server (off until you turn it on): see replies and followers your own server never received.
- Works on a bad connection: pages you have opened stay readable offline, posts you write offline wait in an Outbox, data saver holds back pictures, and Mawkingbird Lite loads only the essentials. The Connection page shows whether the problem is you or your server.
- Local AI: use a model running on your own computer, such as Ollama or LM Studio, for translations, suggestions and image descriptions.
- Save or copy a picture from a post, translate its description, and on Windows read the text out of a picture to describe it.
- Proxy settings, including SOCKS5 and Tor. If the proxy is down, connections fail; the app never goes around it.
- Bluesky: see verification checks, posts with up to ten pictures, and the For You feed. The content label choices you made in Bluesky are respected.
- You are told when your server's moderators act on your account, or when a block between servers costs you followers, and can go to the appeal.
- Reporting a post shows you the server's rules first, and offers mute, block and hide for things you only want to stop seeing.
- Feedback: report a bug or suggest a feature by email, GitHub or Mastodon. Settings > About checks for a new version when you ask it to; it never installs anything by itself.
- The interface in Malay and Simplified Chinese.

### Changed
- Replies from people you do not follow are marked, and wait behind one click under your own posts and in notifications. Settings > Wellness turns that off.
- Notifications are shorter: likes and boosts fold into one row and new followers into another, with the number since you last looked.

### Fixed
- Posting, replying, boosting, bookmarking, following, muting, editing and deleting now work with a Mastodon account. In 0.1.0 only likes went through and everything else failed. Attaching pictures, video or audio is not supported yet.
- YouTube search works in the desktop app. In 0.1.0 it asked for a subscription.
- A search that fails says why and offers to try again, instead of looking like no results.
- On Windows, the right-click menu no longer offers Save image as and other choices that did nothing.

## [0.1.0] - 2026-11-15
### Added
- Install app to your PC. Supports PC, Mac, Linux.
- Features that can't be provided for free on web can be provided for free on you machine
- RSS Feeds for all websites
- Discover RSS feeds of all your friends
- Fetch article for a readable version, although many news sites block this sort of feature
- All 3rd party connectors work
    - Youtube search
    - Mataroa blog service
    - Link shortening services (Dub, Short.io, Rebrandly)
