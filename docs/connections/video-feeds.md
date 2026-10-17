# Video feeds

Open **More → Videos**, **RSS → Video feeds**, or **Feeds → Video feeds** to read YouTube channels.
Paste a channel URL, `@handle`, `UC…` channel ID, or channel RSS URL and choose
**Subscribe**. No YouTube account or Google API key is needed.

Subscriptions appear on the left. Select a channel or **Main feed** to read
uploads. The sort menu offers **Newest first**, **Oldest first**, **Title A–Z**
and **Channel A–Z**. **Saved videos** shows the videos you saved. The reader uses the channel's public
RSS feed, which contains recent uploads rather than its entire archive. Choose
**Refresh** to check for updates. Failed refreshes preserve cached content and
never unsubscribe you.

Use **Load YouTube player**, then Play, to watch an embedded video. Playback is
never automatic. Some videos cannot be embedded; **Open on YouTube** opens the
original. Save videos for later or mark them watched with the card controls.
**Watch Party** opens the existing Watch page with its conversation and temporary
party hashtags. **Post Response** opens the mini composer with the video title,
link and channel hashtag (for example, `#TechnologyConnections`). Add your own
response, choose Mastodon, Bluesky or both from your connected posting targets,
and post when ready.

In **Feeds → Video feeds**, you can also subscribe, exclude a channel from the
reader, or unsubscribe. These subscriptions are account-scoped in this browser,
separate from blog RSS subscriptions, and included in personal settings backups.

Mawkingbird Plus adds anonymous YouTube video and channel search. Search uses
InnerTube through the Mawkingbird proxy; the Mawkingbird account authenticates
Plus access to the proxy, while no user credentials reach YouTube. Search
results can be watched or their channels subscribed to.

Public channel metadata and RSS reads use a narrow, free YouTube proxy route
with per-minute limits and caching. They do not consume the general proxy's
one/five-request daily sample. Search is checked for Plus access by both the
client and the proxy. Turning off the RSS or CORS proxy connection stops new
network reads; subscriptions and cached items remain.

Deployment requires the matching `youtube` and `youtube-search` routes in
`mawkingbird_cors_proxy`. Neither route relays video streams or YouTube account
cookies. YouTube may throttle, refuse requests or change its internal API;
subscriptions remain usable through RSS when search is unavailable.
