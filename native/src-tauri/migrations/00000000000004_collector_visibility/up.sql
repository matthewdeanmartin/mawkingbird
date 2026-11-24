-- Counters are per receiving identity. They contain no account content or tokens.
CREATE TABLE archive_collector_count (
    identity_id INTEGER NOT NULL,
    job TEXT NOT NULL,
    api_calls INTEGER NOT NULL DEFAULT 0,
    saved_items INTEGER NOT NULL DEFAULT 0,
    last_outcome TEXT NOT NULL DEFAULT 'waiting',
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY(identity_id, job),
    FOREIGN KEY(identity_id) REFERENCES archive_identity(id) ON DELETE CASCADE
);

-- One recent page per active followed person per week; no old/unknown actor is queued.
CREATE TABLE archive_seed (
    identity_id INTEGER NOT NULL,
    actor_id INTEGER NOT NULL,
    fetched_at INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY(identity_id, actor_id),
    FOREIGN KEY(identity_id, actor_id) REFERENCES archive_actor(identity_id, id) ON DELETE CASCADE
);
