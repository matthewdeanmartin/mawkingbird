# Generated people lists

The action at the top of `/feeds?section=lists` materializes Mimb's people views
as eleven native Mastodon lists prefixed `Mawkingbird:`. Opening them uses the
existing server list timeline, with no classification work during reading.

The reference algorithm is `mastodon_is_my_blog/routes/accounts.py` in the
sibling Python project. `web/src/lite/lite-people.ts` is a useful comparison,
but its sticky `everMutual`, mention shortcut for Chatty, and lifetime status
threshold for Broadcasters are intentionally **not** used here.

These views overlap. Top friends are current mutuals with an observed mention,
favourite, reblog or status notification. Readers have boosted us. Idols are
non-mutuals we have replied to without any observed inbound notification.
Celebrities are Python's Parasocials: non-mutuals with more than 10,000 followers.
Bots require the explicit flag. Chatty and Broadcasters require five sampled
posts and reply ratios strictly above 50% or below 20%. Lively means activity
within 30 days. Zombies is Python's Graveyard: a null last-post date or activity
over 90 days ago. An absent or invalid date is unknown, not inactive.

Two deliberate adaptations: native lists can only include current follows, so
unfollowed Readers cannot be included without changing who the user follows;
and Other is the actual remainder of these views (Python's historical SQL
exclusions can overlap other named categories). The dialog explains both.

## Cost and lifecycle

- Complete following pagination, then relationship batches of 40. Activity
  metadata missing from following responses is hydrated in account batches,
  with an individual-account fallback for servers predating the batch endpoint.
- At most ten pages each of notifications, own statuses, and Home. No individual
  friend's timeline is downloaded. Interactions are an approximation of the
  Python application's historical database, explicitly described as such.
- Only compact evidence is retained: facts for current follows, at most 100
  observed post IDs per person and 5,000 overall. No post bodies are persisted.
- Requests are sequential and spaced; 429 responses pause with a countdown and
  bounded retry. Stop cancels the active subscription and queued retry.
- The root service survives page/dialog destruction. Reload ends the run;
  changing account, token or API server cancels it before subsequent requests.
- Storage is scoped by verified Mastodon account and server, classified as cache
  and excluded from settings export. IDs are remembered across list renames.

## Updating and recovery

Full sync is the default and adds/removes membership, including manual additions
to generated lists. The unchecked `Only add` option retains old membership.
Unrelated lists and follow relationships are untouched.

Each category rediscovers server lists, preferring remembered IDs and falling
back to exact branded titles. Missing lists are recreated, including after
partial deletion or loss of all local metadata. Membership is paginated before
calculating differences and verified after writes. Concurrent 404/422 responses
trigger bounded rediscovery/reconciliation; unexplained failures never count
as success. A repeated cursor, guessed follow cursor, hidden membership cursor,
or missing relationship aborts instead of treating partial data as complete.

A dirty marker is saved before writes; only successful completion of every
category clears it and advances the timestamp. Interrupted runs leave already
completed changes and offer Update to repair them. The page offers updates
after seven days, changed follow counts, incomplete runs, or missing/replaced
list IDs. Updates are always available because server edits and relationship
changes are not continuously polled. Add-only completion is labeled separately.
