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
party hashtags. The party chat opens in **Compact** view, one line per message
like a chat room; select a line to open the full post, or turn Compact off in
the chat toolbar for full post cards. **Show** picks the video post's replies,
the hashtag for the show, or both; choosing the hashtag alone asks which
hashtag to use. **Updates** sets how often the chat checks for new messages:
**Live** (your server's hashtag stream where available, otherwise every 15
seconds), every 5, 15 or 60 seconds, or **Manual** (only when you choose
Refresh). The chat follows new messages until you scroll up, then counts them
for you. The people button lists everyone in the chat, with those who posted in
the last ten minutes marked active; select a name to highlight their messages.
Signed in to Mastodon, type in the chat box to post: messages get the show's
hashtag (posted publicly so the party can see them) and, when replies are shown,
reply to the video post. **Post Response** opens the mini composer with the video title,
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
