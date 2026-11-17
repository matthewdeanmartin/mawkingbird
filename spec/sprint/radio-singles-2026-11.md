# Radio rethink: Singles, Playlists, Studio (November 2026)

Status: planned · 2026-11-16. Supersedes the UX shape of
[radio-roadmap-2026-10.md](radio-roadmap-2026-10.md). That roadmap's verified
facts still hold (API probes, which providers are controllable, CSP notes,
catalogue resolvers). Its screen structure does not: Build Playlist / Publish /
Saved / My Playlists tabs, the overloaded Audio source dropdown, and the
catalogue panel duplicated in two places.

## Owner decisions (2026-11-16)

| Topic                 | Decision                                                                                                                                                                                                                                                                                                               |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Radio                 | Not a destination. "Radio" is the verb _play (something)_: the dock plus a Now Playing view.                                                                                                                                                                                                                           |
| Navigation            | **Singles · Playlists · Studio**. Settings leave the mode menu; each page has a settings gear shortcut.                                                                                                                                                                                                                |
| Singles               | A Single is one playable thing: native audio, a catalogue recording, a SoundCloud track, a YouTube music video, a Spotify/Bandcamp embed, a 90-minute mix. Its page is like a video site's `/watch` page: one item plus the widgets around it.                                                                         |
| Saved singles         | Stored in this browser (account-scoped). Not Mastodon bookmarks. Working name "Saved" (not "crate").                                                                                                                                                                                                                   |
| Playing a Single      | Hijacks the queue as a one-song playlist. The interrupted playlist is not resumed.                                                                                                                                                                                                                                     |
| Non-advancing Singles | Spotify, Bandcamp, Apple, Deezer, Tidal, Amazon: play on their Single page only. They never join a playlist meant for listening.                                                                                                                                                                                       |
| Find                  | Subordinate to Singles and Playlists, never top level. You always find _for_ something.                                                                                                                                                                                                                                |
| Two kinds of playlist | **Listening playlist**: music I found and queue up to play (local, continuous tracks only), under Playlists. **Authored playlist**: something I publish for others, either n links in one post or a thread of posts, under **Studio**. An authored playlist may contain anything, including tracks that can't advance. |
| State                 | Proposal B: Queue (what's playing), Single, Playlist (document), Results (one Find session). Results never become the queue by side effect.                                                                                                                                                                            |
| Studio                | Kept. It was the least problematic part. It gains playlist authoring.                                                                                                                                                                                                                                                  |

## Diagnosis being fixed

- `RadioPlayer.queue` was simultaneously scan results (`playlist() === null`),
  the playlist being edited, and what's playing. Every screen edited it, so
  every screen grew every workflow.
- Seven navigation targets for three jobs. "Publish" was really the editor.
  "Saved" and "My Playlists" were one concept kept in two lists. "Saved"
  rendered a double title and no empty state.
- The bulk URL textarea led Build Playlist.
- The source dropdown mixed feeds, a hashtag, catalogues (which swapped in a
  different form) and saved searches (not filtered to music unless "native
  only" was ticked).
- YouTube is classified `video` with no embed, and the scan keeps only
  `type !== 'video'`, so most music on Mastodon never reached Radio.
- Opening `?acct=` silently added every scan result to the queue (`buildScan`).

## Playability tiers

- **Continuous**: native audio, linked files, LoC, Internet Archive,
  SoundCloud, Mixcloud (`controllable`). Can be queued and advance on their
  own.
- **Single-only**: every other recognized music embed. Plays on its Single page.
- Candidates to promote to continuous: YouTube (postMessage API with
  `enablejsapi=1`, an ended state, no YouTube JavaScript in our document),
  PeerTube, Vimeo. Spotify's iFrame API is unverified. Each needs a spike and
  a CSP `frame-src` entry.

## Sprint 1: separate the state (B)

- New `PlaylistDraft` service: the playlist being built (tracks, name,
  description, active saved id). All editing goes here: add, move, rename,
  remove, replace.
- `RadioPlayer.queue` becomes an explicit list. It is set only by play actions:
  - `playTracks(tracks, start)`: play a playlist.
  - `playSingle(track, at)`: hijack the queue as a one-track playlist.
  - `playResults(index)`: an explicit "Play all", which keeps extending from
    the running scan, the old feed-radio behavior made opt-in.
- Remove `editPlaylist`, the nullable `playlist`, `alternatives` and the
  `buildScan` auto-add.
- Shared `#playlist=` links and `?post=…&add=1` load into the draft; they never
  autoplay (unchanged).
- Cheap fixes in touched files: empty state for Saved, no double title.
- Exit: specs updated; `make test-changed` green. Full gates deferred to the end
  of Sprint 2 (two-sprint cadence).

## Sprint 2: Singles

- `/singles`: the Saved list (browser storage, account-scoped, registered in
  the storage registry) plus **Find singles**:
  - One search box with scope chips (Everywhere · Account · Hashtag ·
    My feeds · Catalogues). Pasting URLs into the box resolves them; the
    separate textarea goes.
  - Saved searches are offered only when they make sense for music, and always
    run with the audio/link filter.
  - Results are track rows with a tier badge. Actions: Play (hijack), Save,
    Add to playlist (continuous only).
- `/listen` becomes the Single page (the `/watch` analogue): Play, Save, Add to
  playlist (continuous only), Share (Studio), replies, more from this account.
  Single-only embeds play here.
- YouTube music detection: music.youtube, music hashtags, "Official
  Audio/Video", "- Topic" channels. These become Singles (single-only tier
  until the spike promotes them).
- Settings gear component on Singles, Playlists, Studio and Now Playing.
- Mode nav: Singles · Playlists · Studio. Old `/radio?view=…` URLs redirect.
- Full gates once, at the end of this sprint.

## Sprint 3: Playlists (listening)

- `/playlists`: library of local listening playlists with empty-state starts
  ("Find singles", "Open a playlist link").
- Playlist page: name, tracks, Play, Shuffle, reorder, remove, **Add tracks**.
  Add tracks opens a picker: Saved singles first, then Find singles targeted at
  this playlist.
- **Find playlists**: other people's playlist posts (n links in one post) and
  threads, opened read-only, playable tracks only, with a skipped count. Play,
  or Save a copy.
- Now Playing view (from the dock) replaces the `/radio?view=radio` tab.

## Sprint 4: Studio authors playlists

- Studio → **Publish a playlist**: one post with n links, or a thread. Any link
  is allowed, including single-only embeds.
- My published playlists: found automatically (no "Find my threads" button),
  with update diff and append, using the existing `PlaylistPublisher`.
- "Find Shareable" folds into Find singles' Share action.
- Radio's Publish / My Playlists tabs are deleted.

## Sprint 5: supply

- YouTube postMessage spike; promote to continuous if it holds. Then PeerTube,
  Vimeo, and a Spotify check.
- Catalogues in Find singles. Probed 2026-11-16 with curl and an `Origin`
  header: Openverse `/v1/audio/` (200, ACAO `*`, direct Jamendo/Freesound/
  Wikimedia URLs and licences; some results have a null `url`), Audius
  `/v1/tracks/search` (200, ACAO `*`, needs `app_name`), Wikimedia Commons search
  (200, ACAO `*`), SepiaSearch PeerTube (200, ACAO `*`). Funkwhale is unverified.

## Compatibility

Keep `mockingbird_radio_playlists`, `mockingbird_radio_positions` and
`mockingbird_radio_settings` key names, `#playlist=` fragments, and
`?post=`/`?acct=` share links working. Rerun the deep-link audit after route
changes.

## Progress

### Sprint 1 (2026-11-16): done, focused checks only

- `playlist-draft.ts` (new) owns the playlist being built. Radio's editor,
  catalogue "Add"/"Make a playlist", Listen "Add to playlist" and track actions
  write to it, never to the player.
- `RadioPlayer`: the queue is an explicit list. `playTracks`, `playSingle`
  (hijack) and `playResults` (opt-in "Play all", follows the scan) are the only
  ways in. `playNext` freezes a followed scan. Removed: `playlist`,
  `editPlaylist`, `addTracks`, `replacePlaylist`, `moveTrack`, `renameTrack`,
  `removeTrack`, `playNow`, `alternatives`. `chooseExternal` plays that player
  as a Single.
- Radio page: no `buildScan` auto-add on `?acct=`; Open in Radio plays the post
  as a Single and leaves the draft alone; shared post/fragment links load into
  the draft. New "Play all results" toolbar button. Saved: no double heading,
  and an empty state with a Build a playlist button.
- Specs: new `playlist-draft.spec.ts`; player and page specs rewritten for the
  new model. The page spec now stubs the audio element: the old Open in Radio
  test passed only because jsdom's `play()` threw inside `loadPost`'s
  try/catch.
- Checks run: `tsc -p tsconfig.spec.json`, the reading + status-card + shell
  subset (133 files, 1656 tests), `make test-changed`, prettier, `ng lint` on
  touched files, `check:i18n`, and `design:inventory-check` after a reviewed
  regeneration. Deferred to the end of Sprint 2: `make test`, the production
  build, `design-verify`, and the deep-link audit.

### Sprints 2 and 3 (2026-11-17): built, ready for owner testing

Owner decisions this round: the list is called **Saved singles**; Singles that
can't advance never join a playlist (they play on their own page); playing a
Single replaces the queue with no resume; settings are a gear on each page.

- Navigation: Singles · Playlists · Studio. The Radio mode opens `/singles`.
  `RadioHeader` puts the settings shortcut on every Radio page.
- `/singles` (`singles-page`): Saved singles, browser storage
  `mockingbird_radio_singles` (account-scoped, in the storage registry, capped at
  500). Rows: Play (a one-track queue, or the Listen page for Singles that can't
  advance), Open, Remove, add to a playlist or start one. `?save=<post url>` keeps
  a post handed over by a card.
- `/singles/find` (`find-singles-page`): the old Build Playlist search, rehomed.
  A "Where to look" radio group replaces the overloaded dropdown; saved searches
  are their own choice; pasted links are a choice instead of the lead textarea.
  Results: Save single (any recording, including Spotify-style players), Play,
  Save all results, Play all results. With `?playlist=<id>` it adds to that
  playlist instead, continuous recordings only. Kept alive as a reading route.
- `/playlists` (`playlists-page`): library with empty state and New playlist.
  `/playlists/find`: open a playlist link, scan an account's recent posts with
  `playlistThreads` (posts with several recordings or self-reply threads), and
  your own playlist threads (signed in).
- `/playlists/:id` (`playlist-page`): edits save immediately (no Save button).
  Play, Shuffle, reorder, rename, remove, Add tracks from saved singles (then
  Find more), share link, delete, and Publish as thread (moves to Studio in
  Sprint 4). `/playlists/shared` previews a post/thread or `#playlist=` links
  read-only, with Play and Save a copy. `PlaylistDraft` now only holds that
  preview.
- `/radio` is Now Playing (empty state points to Singles and Playlists) plus
  settings. Older links forward: `?acct=` → Find singles, `?post=` → shared
  playlist, `?post&add=1&view=playlist` → save single, `#playlist=` → shared
  playlist, old tabs → Playlists or Find singles. "Play in Radio" on a post that
  can't advance opens its Listen page.
- Cards: "Save single" for any public post with a recording; "Open in Radio" is
  now "Play in Radio". Profile: "Find their music" → Find singles.
- Listen: Save single, an add-to-playlist menu, Back falls back to Singles.
- Guard: `/playlists/shared` (post or fragment) and `/singles/find?acct=` open
  for signed-out visitors, like the older `/radio` links.
- `TrackActions.keep` is the one "save as Single, or add to this playlist" path
  (Find singles, catalogue panel, Listen). `RadioPlaylists.create` makes empty
  playlists. `RadioPlayer.singlesOf`/`singleTracks`/`isContinuous` describe
  Singles that can't advance.

Specs: new `saved-singles`, `singles-page`, `find-singles-page` (the old Radio
page search tests moved here), `playlists-page` and `playlist-page` specs;
`radio-page.spec` rewritten for Now Playing and link forwarding; nav, shell,
profile, status card, catalogue panel, guard and app-mode specs updated.

Known gaps: "Saved 1 singles." has no plural handling. YouTube music detection
and the catalogue additions remain Sprint 5.

### Owner follow-ups (2026-11-17)

- Plurals: counted strings use the app's `.one`/`.other` key pairs through
  `countKey` (`count-key.ts`): saved singles, track counts, recordings, skipped
  links.
- Internal routes that no longer made sense were removed. "Play in Radio" is now
  `/radio?play=<post>` (was `?post=&add=1&view=radio`); settings moved to
  `/radio/settings`; the dock links plain `/radio`. Retired tab addresses
  (`?view=search|publish|saved|mine|playlist`) and the old card "Add to
  playlist" address are no longer forwarded. Shared content links still are:
  `/radio?acct=`, `/radio?post=`, `/radio#playlist=`. The unused `radioLink`
  builder is gone.

### Sprint 4 (2026-11-17): Studio authors playlists

- `SavedRadioPlaylist.authored`: made in Studio to publish. Any published
  playlist reads as authored (older published rows migrate on read). Authored
  playlists keep page-only players (Spotify, Bandcamp…); listening playlists
  never do.
- Studio's Find Shareable tab is replaced by **Playlists**
  (`studio-playlists`): authored playlists with Published / changed / not
  published state, New playlist to publish, and threads already posted found
  on arrival with Keep in Studio (adopt). Find Shareable's job lives in Find
  singles (catalogue Share stays).
- `/radio/studio/playlists/:id` opens an authored playlist on the same playlist
  page. There: a Studio lead, Publish as thread, Draft playlist post/thread
  (handed to Studio's composer, not Home), page-only tracks marked and not
  playable here. A listening playlist shows no publishing; its menu offers
  "Publish from Studio", which copies it into Studio.
- `/playlists` lists listening playlists only; "My playlist threads" moved to
  Studio. Adding to an authored playlist (Find singles target, Saved singles,
  Listen) accepts any recording via `TrackActions.keep`.
- `RadioPlayer.playTracks` starts at the next track that plays here, so an
  authored playlist opening with a Spotify link still plays.

### Sprint 5 (2026-11-17): more music that plays

- **YouTube, verified.** A live youtube-nocookie embed, driven only by
  postMessage from our page (no YouTube script in our document), reported
  ready, title, duration and time, played, seeked and signalled ended (spike
  script, 2026-11-17). `widget-api.ts` gains `connectYouTube`.
  - YouTube Music links are now controllable (embed with `enablejsapi` and our
    origin).
  - Plain YouTube links play in Radio only on music posts (`youtube-music.ts`):
    a music hashtag, a "- Topic" or "Official Audio"-style card, or "now
    playing"-style words. Elsewhere YouTube stays video; Watch and Video mode
    are unaffected. Cards offer Play in Radio and Save single for these posts.
  - Owner-refused embeds (error 150/101) report an error and stop at that
    track.
- **Catalogues.** Openverse (openly licensed, direct files, licence link),
  Audius (independent artists, stream URL named for the app, unstreamable
  tracks skipped) and Wikimedia Commons (file, licence and plain-text artist in
  one request) join LoC and the Internet Archive. Find singles offers one
  "Public music catalogues" choice; the panel picks the catalogue.
- Not done: PeerTube/Vimeo bridges and a Spotify control check; error 150
  skipping to the next track automatically.

### Owner feedback round (2026-11-17), done

- Find singles results are compact `track-result` rows: title, poster, where it
  plays, then Play, Save single (or Add to playlist) and Open thread. No
  reply/like/boost row; the thread is one tap away.
- "Where to look" is one row of tabs, each tab holding its own short form and a
  one-line hint. A scan shows "Scanned N posts in K API calls · M with music"
  while it runs, with Cancel, and the page scrolls to results when a search
  starts. `MediaFeedScan.requests` counts the calls.
- Saving all results (or one) says where they went, with a link to Saved
  singles or the target playlist.
- Saved singles: Clear all (confirmed). Singles and Playlists use Saved/Find and
  My playlists/Find playlists tabs instead of buttons that read as toggles. The
  playlist page's Add tracks is an always-shown section, not a toggle.
- "They stay in this browser" copy removed.

## Proposal: Share, its own place (owner idea, 2026-11-17)

Studio should be only "I have media and I want to showcase it": upload a
recording, post it, my audio, an album of my own uploads. Like `/write` for
writers, it never searches for other people's work.

Amplifying someone else's music ("I enjoy this and you should too", often
hosted elsewhere) is a third job, neither a Single (a found thing to play) nor a
listening playlist. It gets a **Share** page:

- Opened from any Single, result row, Listen page or playlist, prefilled: the
  title, credit (poster or catalogue and licence), the links (every service the
  post offers), suggested hashtags (`#nowplaying`, `#fedimusic`, genre).
- Share to Mastodon (one post, or a thread for a playlist: one reply per track,
  the existing publisher), and to other connected networks the app already
  cross-posts to.
- A playlist share is the publish flow moved out of Studio: name, description,
  one post with every link or a thread, publish/update plan, published state.

What would move: Studio's Playlists tab and `/radio/studio/playlists/:id`
become Share's playlist publishing; `TrackActions.share` (today it opens
Studio's composer) opens Share; "Publish from Studio" becomes "Share this
playlist". Studio keeps New audio post and My audio, and could add an album
(several of my own uploads as a thread).
