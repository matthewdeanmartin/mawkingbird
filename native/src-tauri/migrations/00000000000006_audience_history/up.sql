-- Which post a notification was about, so a post's boosts and favourites can
-- be placed on a timeline. Filled for notifications observed from now on.
ALTER TABLE archive_interaction ADD COLUMN status_remote_id TEXT;
CREATE INDEX archive_interaction_status ON archive_interaction(identity_id, status_remote_id);

-- The identity's own follower count, at most one row per day.
CREATE TABLE archive_follower_snapshot (
    identity_id INTEGER NOT NULL,
    observed_day TEXT NOT NULL,
    followers INTEGER NOT NULL,
    following INTEGER NOT NULL,
    statuses INTEGER NOT NULL,
    PRIMARY KEY(identity_id, observed_day),
    FOREIGN KEY(identity_id) REFERENCES archive_identity(id) ON DELETE CASCADE
);
