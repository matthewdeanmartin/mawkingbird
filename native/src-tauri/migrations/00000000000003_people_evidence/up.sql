-- Relationship observations belong to the receiving identity. A missing row
-- means unknown, never "does not follow me".
CREATE TABLE archive_relationship (
    identity_id INTEGER NOT NULL,
    actor_id INTEGER NOT NULL,
    followed_by INTEGER NOT NULL,
    observed_at INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY(identity_id, actor_id),
    FOREIGN KEY(identity_id, actor_id) REFERENCES archive_actor(identity_id, id) ON DELETE CASCADE
);

-- People and post-bin reading need newest cached posts across all authors.
CREATE INDEX archive_post_identity_time ON archive_post(identity_id, created_at DESC, id DESC);
CREATE INDEX archive_post_reply_target ON archive_post(identity_id, actor_id, in_reply_to_remote_id);
