-- Engagement history for the identity's own posts: one row per observation
-- whose counts changed, so growth curves need no extra requests.
CREATE TABLE archive_post_count_snapshot (
    identity_id INTEGER NOT NULL,
    post_id INTEGER NOT NULL,
    observed_at INTEGER NOT NULL DEFAULT (unixepoch()),
    replies INTEGER NOT NULL,
    reblogs INTEGER NOT NULL,
    favourites INTEGER NOT NULL,
    quotes INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(identity_id, post_id, observed_at),
    FOREIGN KEY(identity_id, post_id) REFERENCES archive_post(identity_id, id) ON DELETE CASCADE
);

-- Who boosted a post, with the booster's follower count when seen. Lets Full
-- reach cost one lookup per post instead of one per view.
CREATE TABLE archive_post_booster (
    identity_id INTEGER NOT NULL,
    post_id INTEGER NOT NULL,
    actor_id INTEGER NOT NULL,
    followers_count INTEGER NOT NULL DEFAULT 0,
    observed_at INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY(identity_id, post_id, actor_id),
    FOREIGN KEY(identity_id, post_id) REFERENCES archive_post(identity_id, id) ON DELETE CASCADE,
    FOREIGN KEY(identity_id, actor_id) REFERENCES archive_actor(identity_id, id) ON DELETE CASCADE
);

-- A booster lookup happened, even when it found nobody. Reused while the
-- post's boost count is unchanged.
CREATE TABLE archive_post_booster_scan (
    identity_id INTEGER NOT NULL,
    post_id INTEGER NOT NULL,
    reblogs_at_scan INTEGER NOT NULL,
    scanned_at INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY(identity_id, post_id),
    FOREIGN KEY(identity_id, post_id) REFERENCES archive_post(identity_id, id) ON DELETE CASCADE
);
