# Default Home view per account, and Video focus

Status: proposal with owner-confirmed scope · 2026-10-07. No runtime changes.

Related: [video playback/Watch](video-player.md), [Watch Parties](watch-party.md).

## Owner decisions

Use the existing Home toolbar behavior. Add a dropdown labelled **Default Home
to…** with **All / Text / Media / Video**, saved separately for each signed-in
account. When switching to a photography account, Home should open in Media
every time. The selected toolbar view is currently temporary; this change
supplies a saved starting view without making every toolbar click persistent.

Defaults are personal Mawkingbird preferences. They are not a public account
type, profile metadata, or a server-side setting. A possible later profile menu
action is **Always open this profile in Media**: for example, visiting Ansel
Adams should start in the existing Instagram-like media grid.

Do not introduce a separate focus-versus-filter control system. Keep the
existing views, add Video alongside them, and remember the user's chosen
starting view per account.

## Starting views

| Saved Home default | Home on account switch or fresh entry |
| --- | --- |
| All | Existing regular feed with normal post/media presentation |
| Text | Existing regular feed with text-focus presentation: media descriptions/icons and explicit open/play actions |
| Media | Existing Media grid and viewer |
| Video | A new video gallery/list with posters, duration where known, author context, and Open Watch |

Media retains its current semantics, including photos, video, and animations.
This proposal does not turn it into a new photos-only filter. Video includes
uploaded `video` and validated supported video links; soundless `gifv`, audio,
and ordinary article-card images are excluded. Use the shared classifier from
the player. YouTube links with blocked embedding still appear with a provider
fallback. A mode selection never starts playback.

Keep Feed/Media/Articles/Members/Analytics functionality and the existing
text-focus control. Add Video to `FeedView` and the toolbar without removing
the other views. The default dropdown belongs on Home; reusable command bars
on other surfaces should not misleadingly offer a default for that page.

## Persistence and override behavior

- Choosing a value in Default Home to saves it for the active account and
  applies it immediately to the current Home. Show the saved value clearly.
- Clicking the ordinary toolbar changes only the current visit. It does not
  change the dropdown or silently replace the saved default.
- Apply the saved default on account switch and fresh Home entry, including
  reload. Browser Back from Watch/profile should restore that Home visit's
  chosen view and scroll position, rather than reset the visit to its default.
- Accounts without a saved value keep current behavior until the user chooses
  one; rollout must not alter existing text/image preferences unexpectedly.
- Anonymous can have a separate local default using the established anonymous
  scope. Signed-in accounts do not inherit it.
- Visiting Watch or a party does not rewrite the Home default. A video-focused
  account's party conversation still includes text posts.

Examples: photography account → Media; reading account → Text; video account →
Video. Switching between them restores the corresponding starting view and
stops playback belonging to the old account.

Persist through the existing stable account identity and storage registry.
Preserve public origins and current storage key names. New defaults must not
go into the global `mockingbird_client_prefs` blob. Follow established
export/import, teardown, and config-sync rules. Token refresh must not reset
the preference. Missing/corrupt values and denied storage degrade gracefully.

## Text-focus interaction with existing settings

Today, `CommandBar` derives text-focus from global `showImages`/`feedReader`,
while `Home.view` is a visit-local signal. A per-account Home default cannot be
implemented just by repeatedly writing those global preferences: that would
change other accounts and other pages.

Use a Home presentation override layered over the existing settings. Text
default suppresses visuals within that Home visit without changing the global
preferences. Other defaults choose the corresponding layout; explicit global
reader/media restrictions continue to apply. The All option means regular
Home, not silently overriding every global restriction. When restrictions
prevent a visual mode, explain the active restriction and retain descriptive
media rows/explicit opening. Decide the exact override plumbing during
implementation, with regression coverage for the existing toolbar controls.

Content warnings, sensitive-media reveals, block/mute, server filters, and
provider capabilities remain effective in every view. Existing `?photo=`
viewer links continue to work. Viewer navigation and account switching do not
accidentally start or leave behind active video.

## Filling the Video view

Reuse the loaded Home timeline, provider merging, and cursors. Classify boosted
underlying posts while retaining booster attribution. Link-based video can
lack attachments, so `only_media` cannot be the only source: it would exclude
YouTube posts. Mastodon's parameter means attached media, not video alone.
[Mastodon timelines API](https://docs.joinmastodon.org/methods/timelines/).

Avoid scanning the entire history to fill the view. Proposed cap: three
source-page requests per explicit load action, then show matches and Load
more. Advance raw cursors through nonmatching pages; zero video matches is
not exhaustion. Use the same classifier for streaming updates; handle edits,
deletes, and deduplication. State “No videos in the posts loaded so far” when
appropriate. Reuse existing media extraction where suitable, but never treat
a card's thumbnail alone as proof that its link is a playable video.

## Optional later: a personal default for a viewed profile

Profile menu action: **Always open this profile in Media**, with a reset action.
This remembers a preference for the viewer, not a preference published by the
profile owner. Existing profile Media renders as the Instagram-like view.

Key it by the active viewer identity plus canonical target profile identity,
not a server-local ID alone. A selected tab lasts for the visit; explicit
deep links and browser Back take precedence over the saved starting tab.
Reset falls back to the existing profile entry behavior. This is optional
later scope, not required for the Home-default feature. No public focus-hint
fields or automatic inference from bios are proposed.

## Implementation acceptance

Cover account isolation, stable identity across re-login, immediate dropdown
application, temporary toolbar changes, fresh-entry versus Back behavior, and
unchanged legacy/global preferences. Cover video classification for uploads,
YouTube, mixed attachments, boosts, unsupported links, and `gifv`; cursor
advancement through nonmatching pages; stream edits/deletes; and warnings and
filters in every view. Manually check narrow layouts, accessible labels,
keyboard access, and that view changes never autoplay.

Run contributor tests and the production-build gate described in the player
spec; inspect bundle size. No tests/build were run for this document change.
