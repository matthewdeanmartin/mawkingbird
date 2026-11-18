# YouTube client S5–S6: YouTubers on Mastodon

Build: mawkingbird.com and Native from the 2026-11-18 tree, with
`public/youtubers/` imported from `mawkingbird_starters` (59 kits, 7 languages).
Spec: [YouTube client](../youtube-client.md), S5–S6.

You need: a Mastodon account; an Anonymous session; ideally a German-language
browser profile too.

## Finding the kits

- [ ] Video mode, wide screen: the right rail shows **YouTubers on Mastodon** with up
      to five kits for your language and **All creator kits**.
- [ ] On a phone width: **Find YouTubers on Mastodon** at the top of the subscriptions
      panel on `/videos` opens the kits.
- [ ] `/videos/starters` lists kits with icon, name, creator count and faces. With the
      app in German, German kits show first; the language select switches.

## A kit

- [ ] Open English **Technology**: creators with display name, handle, channel name,
      last video date; bots marked **Video feed**. Technology Connections is there.
- [ ] A channel name opens its channel page.
- [ ] **Subscribe** on a row adds the channel to Videos; again unsubscribes.
- [ ] **Subscribe to all**: "Subscribed to N channels." Pressing again adds none.
- [ ] **Follow** on a row follows from your server.
- [ ] **Follow all**: asks before a large batch, shows "Following: x of N", **Stop** works,
      ends with "Followed x of N."
- [ ] **Do both** subscribes and follows.
- [ ] Bluesky-only session: Subscribe works; Follow all is absent with a note.

## Public pages (search)

- [ ] Private window, no account: `https://mawkingbird.com/youtubers-on-mastodon/` shows the
      English hub; `/de/youtuber-auf-mastodon/` the German one, all text in German.
- [ ] Open a kit (for example `/de/youtuber-auf-mastodon/technologie/`): German heading
      with a count, bios, channel names with "Neuestes Video", up to three video titles.
- [ ] "Auch auf: English · Italiano" switches to the same kit in that language.
- [ ] **In Mawkingbird folgen und abonnieren** opens the app on that kit without asking to
      sign in; subscribing works; following uses Anonymous.
- [ ] View source: `<html lang="de">`, canonical, `hreflang` links, JSON-LD CollectionPage.
- [ ] After deploy: submit the sitemap in Search Console and check a German and a Japanese
      kit URL with URL inspection.
- [ ] Read the French, Spanish, Italian, Dutch and Japanese copy once for tone.

## Content spot-check (review quality)

- [ ] Skim German **Civic life** and English **Civic life**: mainstream parties,
      governments and civic groups only; nothing revolutionary or extremist.
- [ ] Skim three other kits for anything adult, spammy or the wrong person.
- [ ] Note any creator in the wrong language or category.

## Findings

_Date, build, what went wrong. Wrong inclusions: add `acct out <reason>` to a
`batch-*.answers.txt` in mawkingbird_starters, then `make yt-apply yt-export` and
`npm run youtubers:update` here._
