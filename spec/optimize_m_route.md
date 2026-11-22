# Make the next hour on a weak connection cheap

**Keep Lite on Angular and keep the shared post card and editor. Spend the next round on reusing posts, profiles, and
media the phone already has.** In a local browser run, entering Lite from an already-open full Home fetched just **10.6
kB of additional compressed JavaScript**. Returning to a visited Lite thread in the same session made **zero requests**.
Those are the properties to build around.

The target journey starts on good Wi-Fi. Someone opens Mawkingbird, gets on a train or walks into a store, and the
connection deteriorates. A visit to family on an unfamiliar or metered network adds another constraint: the user may
care about bytes even when requests happen to be fast. In all three cases, a modern screen, local storage, and CPU are
available. A saved thread should be comfortable to read, a draft should survive a tunnel, and a refresh should buy
something the reader can see.

## What the first round actually achieved

I exercised the existing local production bundle in Chromium with a 393 × 851 viewport and fixture Mastodon accounts. I
also inspected the **working tree**, which already puts compact Compose on Lite Home and the full writer at `/m/write`.
Some earlier plans describe a thinner product. Recommending a new full editor would duplicate work already
done. [Lite Home](../ui/src/app/lite/lite-pages.ts) · [Routes](../ui/src/app/lite/lite.routes.ts) · [Original test plan](test_plans/low-bandwidth-s6-s7-lite-and-native-2026-11.md)

| Journey                                                    | What I observed                                                                                                                                                                                                                                                   |
|------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Full Home on a good connection → Lite Home in the same tab | Four additional JS requests totaling **10,556 bytes**. No locale fetch. Lite requested the Home timeline and account relationships. The full page had already requested Home.                                                                                     |
| First direct visit to an empty Home                        | Lite fetched **611 kB of JS** and **192 kB of English translations**. Full Home fetched **786 kB of JS** and the same translations. Lite made one API request in the sample window. Full Home also requested trends, tags, announcements, markers, and streaming. |
| Read a feed without touching it                            | A fresh Lite visit with 20 different authors and ten photo posts requested **20 avatars and all ten previews** before any scroll or tap. They were fixture images, so the request count is meaningful and their byte sizes are not representative.                |
| Home → thread → profile → Home → thread                    | Opening the thread fetched the focus post, context, and relationships. Opening the profile fetched the account and its timeline. Both return visits produced **zero server requests** in the observation window.                                                  |
| Reload a visited thread                                    | Online, the fixture server sent the whole English locale again, plus the thread reads. In a separate run with the service worker controlling the page, I cut connectivity and reloaded. **The visited thread text remained readable with zero transfers.**        |

These are local gzip response-body counts from the existing build, with synthetic data and external hosts blocked. The
server gave hashed assets long-lived caching and gave other assets `no-cache` without validators. Production may serve a
304 or a fresh HTTP-cache hit for an unchanged locale. The online reload result identifies something to verify on the
deployed site. It does not establish a recurring 192 kB production charge. As a timing cross-check, at 1 Mbit/s down,
256 kbit/s up and 300 ms emulated latency, the first fixture post appeared in **16.0 s cold and 0.46 s on reload** in
one run. That is a lab comparison, not a Pixel 5 field measurement or a one-hour endurance
test. [Chrome network measurement reference](https://developer.chrome.com/docs/devtools/network/reference/)

## Where the next bytes should go

### 1. Make previously visited threads and profiles the best screens in Lite

The important gap is **weak but still online**. Fully offline already worked in the thread test. In a fresh tab on a
struggling connection, the general read interceptor normally waits for a response or a network failure before falling
back to disk. Lite has a faster saved-first-page path for some lists, but that path immediately reloads even a fresh
copy. A thread joins its focus and context requests, so one slow context response can hold up text the reader already
saw on Home. A profile waits for account details before displaying its
timeline. [Read interceptor](../ui/src/app/platform/offline/read-cache.interceptor.ts) · [Lite store](../ui/src/app/lite/lite-store.ts) · [Thread and profile loaders](../ui/src/app/lite/lite-pages.ts)

**First change I would fund:** entering a thread immediately paints the focus post from the feed or saved record. Show
saved replies if available. Fetch missing context independently. A profile can likewise paint the author information
from the tapped post while its saved timeline opens. Use the existing account-scoped IndexedDB cache across full and
Lite views. Give a fresh snapshot zero automatic reads, show a saved-at time for stale content, and coalesce background
checks. Your preference was to show saved content immediately and check when stale. A reasonable starting experiment is
five minutes for an active thread and thirty minutes for profile details, with explicit Refresh always available. Those
numbers are tuning choices.

Preserve the reader’s position when an update arrives. Today a successful list refresh replaces all held items with page
one, and the persistent read cache excludes paginated requests. A person who has loaded three pages can lose the part
they were reading. Keep a bounded reading window and a post-ID scroll anchor across navigation or tab eviction. On
refresh, merge newer IDs and offer “3 new posts” above the current position. Reconcile changed or removed posts when
online. Cache private material by account, respect removal on this device, and keep eviction under the existing storage
budget. [List refresh](../ui/src/app/lite/lite-store.ts) · [Cache scope, paths, and 25 MiB cap](../ui/src/app/platform/offline/read-cache.ts)

### 2. Spend media bytes where the reader is looking

The ten unrequested previews are a stronger case for change than the editor toolbar. The shared post card takes its
data-saver decision when it is created. Automatic mode depends on recent connection evidence or a browser hint. Someone
who deliberately enters Lite can therefore receive a whole feed of image requests before the meter has evidence. Keep
the screen’s sharp text, layout, author names, content warnings, alt text, and tap targets. Those are already local or
present in the feed
response. [Card media policy](../ui/src/app/posts/status-card/status-card.ts) · [Data saver](../ui/src/app/platform/network/data-saver.ts)

Start Lite with cached pictures available immediately. For missing pictures, show author initials or a small placeholder
and the attachment description. Fetch visible avatars on a modest shared budget and let the reader explicitly open a
preview or original. Respect an explicit user media preference. Selecting a photo should still open a good full-screen
viewer. Keep the existing Play gesture for radio and video, and avoid contacting the player origin before it. I would
accept a slightly larger cached renderer to eliminate recurring off-screen media
transfers. [Lite media players](../ui/src/app/lite/lite-media.ts)

### 3. Restore useful features by what they cost per use

| Feature                     | What the phone already has                                                         | Where I would spend network bytes                                                                                                                                                                                      |
|-----------------------------|------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Recent threads and profiles | Visited records, names, post text, and timestamps                                  | Add a “Recently read” list and search within saved text locally. Label its coverage. Offer server search separately. This makes a dropped connection useful even after the tab is reclaimed.                           |
| Reader controls             | Text, content warnings, attachment descriptions, a capable display                 | Restore font size, line width, contrast, and local filtering wherever the shared preferences can serve them. These should generate zero API requests.                                                                  |
| Replies and longer posts    | Compact Compose, the full writer, local drafts and a Mastodon outbox               | Keep rich editing and preview. Spend bytes on media upload or publication when requested. Make the queued/draft/sent distinction visible from Lite so a lost acknowledgement does not encourage a second post.         |
| Profiles and conversations  | An author record and often a post are already embedded in the feed or notification | Keep identity, bio, links and reply context useful immediately. Load older posts or richer profile sections on demand. Keep optional analytics, full-history scans, and third-party embeds off the ordinary read path. |

**Current posting default:** after an eligible unscheduled Mastodon Compose send gets no response and the device appears
offline, the app queues it with the original operation identity. The outbox automatically retries on reconnection within
30 minutes and holds older entries for review. Scheduled and cross-post operations fall outside that path. I would
preserve that behavior, expose the outbox from Lite, and consider one shared Settings choice for “send on reconnect”
versus “keep for review.” Full Write and individual reply paths need their own disconnect tests before promising the
same guarantee
everywhere. [Compose eligibility](../ui/src/app/publishing/compose/compose.ts) · [Outbox policy](../ui/src/app/publishing/outbox/outbox.ts)

### 4. Keep the one-time download a one-time download

The bundle report lists **975 kB** of raw initial JS/CSS and **901 kB** for its Lite calculation beyond startup, against
a **950 kB** Lite budget. These are uncompressed build-graph totals. The checker starts from outputs containing Lite
source and follows static imports. That can undercount a dynamically imported destination such as Write, while its union
of Lite pages can overstate what a single visit downloads. Keep it as a guard against accidental imports. Use browser
journeys to decide whether a feature earns its
cost. [Bundle checker](../ui/scripts/report-bundle.mjs) · [Dynamic Write route](../ui/src/app/lite/lite.routes.ts)

Prioritize stable shared chunks and a versioned, reusable dictionary for the selected language. Check the deployed
response for a same-build reload before splitting translations. If the dictionary is already cheap on repeat visits,
keep it. If it retransfers, fix its cache identity or validators before maintaining a second Lite vocabulary. Verify a
non-English locale and fallback together. Also test an old tab through a deployment so an asset update cannot turn a
train journey into a mandatory full redownload. The existing worker already caches hashed assets and provides an offline
shell. [Offline worker](../ui/public/sw.js)

## How to judge the next round

Use **full app on Wi-Fi → weak connection → Lite → an hour of reading** as the primary acceptance journey. Record
first-install bytes separately. On a modern mobile viewport, exercise Home, a previously visited thread and profile, two
pages of scrolling, Back, a photo tap, a tunnel, a tab reload, and reconnection. Add a fresh direct link as the
secondary journey. Run with both English and a supported non-English locale. Use payloads with realistic image sizes and
private fixtures for account-switch checks. Test slow throughput, high latency and complete loss separately.

| Acceptance check                                     | Desired result                                                                                                                                                                                                                                                                                         |
|------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Switch to Lite while full Home’s saved page is fresh | Text appears from local data. No repeat Home body, locale body, or unsolicited previews. Measure incremental JS against the **10.6 kB** fixture baseline.                                                                                                                                              |
| Reopen a fresh thread or profile after tab eviction  | Saved text and reading position appear before any API response. No mandatory network wait. When stale, at most one automatic validation per resource for concurrent views.                                                                                                                             |
| Read three pages, then refresh as new posts arrive   | The older reading window and scroll anchor survive. Fetch only the missing range where the endpoint supports it. For Mastodon timelines, test pagination across a gap larger than one page before relying on ID-based refresh. [Timeline pagination](https://docs.joinmastodon.org/methods/timelines/) |
| Idle on a weak link, then tap one attachment         | No recurring feed-body transfers for unchanged content and no off-screen photo downloads. Report bytes for the requested attachment separately from passive browsing.                                                                                                                                  |
| Lose signal during a reply, then reconnect           | Text survives. The reader can tell whether it is a draft, queued, or sent. Test a lost acknowledgement and verify one published reply.                                                                                                                                                                 |

The clearest product decisions from this review are already yours: accepting an initial download is fine, reopening
saved content should be immediate, and visited threads and profiles matter most. **I would ship saved-first
thread/profile reads and position-preserving refresh first, then explicit media spending.** Keep the rich composer.
Revisit its loading strategy only if measurements of the warm transition show it costing readers again.
