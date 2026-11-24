
CREATE TABLE IF NOT EXISTS archive_identity (
    id INTEGER PRIMARY KEY,
    provider TEXT NOT NULL,
    origin TEXT NOT NULL,
    remote_id TEXT NOT NULL,
    credential_handle TEXT,
    UNIQUE(provider, origin, remote_id)
);
CREATE TABLE IF NOT EXISTS archive_actor (
    id INTEGER PRIMARY KEY,
    provider TEXT NOT NULL,
    origin TEXT NOT NULL,
    remote_id TEXT NOT NULL,
    acct TEXT NOT NULL,
    display_name TEXT NOT NULL,
    last_status_at TEXT,
    UNIQUE(provider, origin, remote_id)
);
CREATE TABLE IF NOT EXISTS archive_follow_scan (
    identity_id INTEGER PRIMARY KEY REFERENCES archive_identity(id) ON DELETE CASCADE,
    generation INTEGER NOT NULL DEFAULT 0,
    next_cursor TEXT,
    complete INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE IF NOT EXISTS archive_follow (
    identity_id INTEGER NOT NULL REFERENCES archive_identity(id) ON DELETE CASCADE,
    actor_id INTEGER NOT NULL REFERENCES archive_actor(id),
    seen_generation INTEGER NOT NULL,
    PRIMARY KEY(identity_id, actor_id)
);
CREATE INDEX IF NOT EXISTS archive_follow_actor ON archive_follow(actor_id);
CREATE TABLE IF NOT EXISTS archive_post (
    id INTEGER PRIMARY KEY,
    provider TEXT NOT NULL,
    origin TEXT NOT NULL,
    remote_id TEXT NOT NULL,
    actor_id INTEGER NOT NULL REFERENCES archive_actor(id),
    created_at TEXT NOT NULL,
    visibility TEXT NOT NULL,
    content TEXT NOT NULL,
    UNIQUE(provider, origin, remote_id)
);
CREATE INDEX IF NOT EXISTS archive_post_actor_time ON archive_post(actor_id, created_at DESC);
CREATE TABLE IF NOT EXISTS archive_post_access (
    identity_id INTEGER NOT NULL REFERENCES archive_identity(id) ON DELETE CASCADE,
    post_id INTEGER NOT NULL REFERENCES archive_post(id) ON DELETE CASCADE,
    source TEXT NOT NULL,
    PRIMARY KEY(identity_id, post_id, source)
);
CREATE TABLE IF NOT EXISTS archive_interaction (
    identity_id INTEGER NOT NULL REFERENCES archive_identity(id) ON DELETE CASCADE,
    actor_id INTEGER NOT NULL REFERENCES archive_actor(id),
    remote_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    PRIMARY KEY(identity_id, remote_id, kind)
);
CREATE INDEX IF NOT EXISTS archive_interaction_actor ON archive_interaction(identity_id, actor_id, occurred_at DESC);
CREATE TABLE IF NOT EXISTS archive_read (
    identity_id INTEGER NOT NULL REFERENCES archive_identity(id) ON DELETE CASCADE,
    post_id INTEGER NOT NULL REFERENCES archive_post(id) ON DELETE CASCADE,
    read_at INTEGER NOT NULL,
    PRIMARY KEY(identity_id, post_id)
);
CREATE TABLE IF NOT EXISTS archive_cursor (
    identity_id INTEGER NOT NULL REFERENCES archive_identity(id) ON DELETE CASCADE,
    source TEXT NOT NULL,
    cursor TEXT,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY(identity_id, source)
);
CREATE VIRTUAL TABLE IF NOT EXISTS archive_post_fts USING fts5(content, content='archive_post', content_rowid='id');
CREATE TRIGGER IF NOT EXISTS archive_post_fts_insert AFTER INSERT ON archive_post BEGIN
    INSERT INTO archive_post_fts(rowid, content) VALUES(new.id, new.content);
END;
CREATE TRIGGER IF NOT EXISTS archive_post_fts_delete AFTER DELETE ON archive_post BEGIN
    INSERT INTO archive_post_fts(archive_post_fts, rowid, content) VALUES('delete', old.id, old.content);
END;
CREATE TRIGGER IF NOT EXISTS archive_post_fts_update AFTER UPDATE OF content ON archive_post BEGIN
    INSERT INTO archive_post_fts(archive_post_fts, rowid, content) VALUES('delete', old.id, old.content);
    INSERT INTO archive_post_fts(rowid, content) VALUES(new.id, new.content);
END;
