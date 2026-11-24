-- One receiving identity owns every actor and post snapshot. Numeric IDs from
-- different Mastodon instances must never be treated as the same object.
CREATE TEMP TABLE archive_migration_expected AS
    SELECT
        (SELECT count(*) FROM archive_follow) AS follows,
        (SELECT count(*) FROM archive_interaction) AS interactions,
        (SELECT count(*) FROM archive_read) AS reads,
        (SELECT count(*) FROM archive_post_access) AS sources,
        (SELECT count(*) FROM (
            SELECT DISTINCT identity_id, post_id FROM archive_post_access
        )) AS posts;
CREATE TABLE archive_credential (
    identity_id INTEGER NOT NULL REFERENCES archive_identity(id) ON DELETE CASCADE,
    handle TEXT NOT NULL UNIQUE,
    PRIMARY KEY(identity_id, handle)
);
INSERT INTO archive_credential(identity_id, handle)
    SELECT id, credential_handle FROM archive_identity WHERE credential_handle IS NOT NULL;
UPDATE archive_identity SET credential_handle=NULL;

CREATE TABLE archive_actor_v2 (
    id INTEGER PRIMARY KEY,
    identity_id INTEGER NOT NULL REFERENCES archive_identity(id) ON DELETE CASCADE,
    remote_id TEXT NOT NULL,
    acct TEXT NOT NULL,
    display_name TEXT NOT NULL,
    last_status_at TEXT,
    profile_json TEXT,
    UNIQUE(identity_id, remote_id),
    UNIQUE(identity_id, id)
);
INSERT INTO archive_actor_v2(identity_id, remote_id, acct, display_name, last_status_at)
    SELECT refs.identity_id, a.remote_id, a.acct, a.display_name, a.last_status_at
    FROM archive_actor a JOIN (
        SELECT identity_id, actor_id FROM archive_follow
        UNION SELECT identity_id, actor_id FROM archive_interaction
        UNION SELECT access.identity_id, post.actor_id
            FROM archive_post_access access JOIN archive_post post ON post.id=access.post_id
    ) refs ON refs.actor_id=a.id;

CREATE TABLE archive_post_v2 (
    id INTEGER PRIMARY KEY,
    identity_id INTEGER NOT NULL REFERENCES archive_identity(id) ON DELETE CASCADE,
    remote_id TEXT NOT NULL,
    actor_id INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    visibility TEXT NOT NULL,
    content TEXT NOT NULL,
    spoiler_text TEXT,
    in_reply_to_remote_id TEXT,
    reblog_of_remote_id TEXT,
    media_json TEXT,
    tags_json TEXT,
    raw_json TEXT,
    replies_count INTEGER NOT NULL DEFAULT 0,
    reblogs_count INTEGER NOT NULL DEFAULT 0,
    favourites_count INTEGER NOT NULL DEFAULT 0,
    UNIQUE(identity_id, remote_id),
    UNIQUE(identity_id, id),
    FOREIGN KEY(identity_id, actor_id) REFERENCES archive_actor_v2(identity_id, id)
);
INSERT INTO archive_post_v2(identity_id, remote_id, actor_id, created_at, visibility, content)
    SELECT access.identity_id, post.remote_id, actor.id, post.created_at,
           post.visibility, post.content
    FROM archive_post_access access
    JOIN archive_post post ON post.id=access.post_id
    JOIN archive_actor old_actor ON old_actor.id=post.actor_id
    JOIN archive_actor_v2 actor ON actor.identity_id=access.identity_id
        AND actor.remote_id=old_actor.remote_id
    GROUP BY access.identity_id, post.id;

CREATE TABLE archive_post_source_v2 (
    identity_id INTEGER NOT NULL,
    post_id INTEGER NOT NULL,
    source TEXT NOT NULL,
    PRIMARY KEY(identity_id, post_id, source),
    FOREIGN KEY(identity_id, post_id) REFERENCES archive_post_v2(identity_id, id) ON DELETE CASCADE
);
INSERT INTO archive_post_source_v2(identity_id, post_id, source)
    SELECT access.identity_id, copy.id, access.source
    FROM archive_post_access access
    JOIN archive_post old_post ON old_post.id=access.post_id
    JOIN archive_post_v2 copy ON copy.identity_id=access.identity_id
        AND copy.remote_id=old_post.remote_id;

CREATE TABLE archive_follow_v2 (
    identity_id INTEGER NOT NULL,
    actor_id INTEGER NOT NULL,
    seen_generation INTEGER NOT NULL,
    PRIMARY KEY(identity_id, actor_id),
    FOREIGN KEY(identity_id, actor_id) REFERENCES archive_actor_v2(identity_id, id) ON DELETE CASCADE
);
INSERT INTO archive_follow_v2(identity_id, actor_id, seen_generation)
    SELECT follow.identity_id, copy.id, follow.seen_generation
    FROM archive_follow follow JOIN archive_actor old_actor ON old_actor.id=follow.actor_id
    JOIN archive_actor_v2 copy ON copy.identity_id=follow.identity_id
        AND copy.remote_id=old_actor.remote_id;

CREATE TABLE archive_interaction_v2 (
    identity_id INTEGER NOT NULL,
    actor_id INTEGER NOT NULL,
    remote_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    PRIMARY KEY(identity_id, remote_id, kind),
    FOREIGN KEY(identity_id, actor_id) REFERENCES archive_actor_v2(identity_id, id)
);
INSERT INTO archive_interaction_v2(identity_id, actor_id, remote_id, kind, occurred_at)
    SELECT interaction.identity_id, copy.id, interaction.remote_id,
           interaction.kind, interaction.occurred_at
    FROM archive_interaction interaction
    JOIN archive_actor old_actor ON old_actor.id=interaction.actor_id
    JOIN archive_actor_v2 copy ON copy.identity_id=interaction.identity_id
        AND copy.remote_id=old_actor.remote_id;

CREATE TABLE archive_read_v2 (
    identity_id INTEGER NOT NULL,
    post_id INTEGER NOT NULL,
    read_at INTEGER NOT NULL,
    PRIMARY KEY(identity_id, post_id),
    FOREIGN KEY(identity_id, post_id) REFERENCES archive_post_v2(identity_id, id) ON DELETE CASCADE
);
INSERT INTO archive_read_v2(identity_id, post_id, read_at)
    SELECT read.identity_id, copy.id, read.read_at
    FROM archive_read read JOIN archive_post old_post ON old_post.id=read.post_id
    JOIN archive_post_v2 copy ON copy.identity_id=read.identity_id
        AND copy.remote_id=old_post.remote_id;

DROP TRIGGER archive_post_fts_update;
DROP TRIGGER archive_post_fts_delete;
DROP TRIGGER archive_post_fts_insert;
DROP TABLE archive_post_fts;
DROP TABLE archive_read;
DROP TABLE archive_interaction;
DROP TABLE archive_post_access;
DROP TABLE archive_follow;
DROP TABLE archive_post;
DROP TABLE archive_actor;
ALTER TABLE archive_actor_v2 RENAME TO archive_actor;
ALTER TABLE archive_post_v2 RENAME TO archive_post;
ALTER TABLE archive_post_source_v2 RENAME TO archive_post_source;
ALTER TABLE archive_follow_v2 RENAME TO archive_follow;
ALTER TABLE archive_interaction_v2 RENAME TO archive_interaction;
ALTER TABLE archive_read_v2 RENAME TO archive_read;

CREATE INDEX archive_follow_actor ON archive_follow(actor_id);
CREATE INDEX archive_actor_activity ON archive_actor(identity_id, last_status_at DESC);
CREATE INDEX archive_post_actor_time ON archive_post(identity_id, actor_id, created_at DESC);
CREATE INDEX archive_interaction_actor ON archive_interaction(identity_id, actor_id, occurred_at DESC);

CREATE TABLE archive_post_analysis (
    identity_id INTEGER NOT NULL,
    post_id INTEGER NOT NULL,
    analyzer TEXT NOT NULL,
    analyzer_version INTEGER NOT NULL,
    input_hash TEXT NOT NULL,
    score REAL,
    result_json TEXT,
    computed_at INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY(identity_id, post_id, analyzer),
    FOREIGN KEY(identity_id, post_id) REFERENCES archive_post(identity_id, id) ON DELETE CASCADE
);
CREATE INDEX archive_post_analysis_filter
    ON archive_post_analysis(identity_id, analyzer, analyzer_version, score);

CREATE VIRTUAL TABLE archive_post_fts USING fts5(content, content='archive_post', content_rowid='id');
CREATE TRIGGER archive_post_fts_insert AFTER INSERT ON archive_post BEGIN
    INSERT INTO archive_post_fts(rowid, content) VALUES(new.id, new.content);
END;
CREATE TRIGGER archive_post_fts_delete AFTER DELETE ON archive_post BEGIN
    INSERT INTO archive_post_fts(archive_post_fts, rowid, content) VALUES('delete', old.id, old.content);
END;
CREATE TRIGGER archive_post_fts_update AFTER UPDATE OF content ON archive_post BEGIN
    INSERT INTO archive_post_fts(archive_post_fts, rowid, content) VALUES('delete', old.id, old.content);
    INSERT INTO archive_post_fts(rowid, content) VALUES(new.id, new.content);
END;
INSERT INTO archive_post_fts(archive_post_fts) VALUES('rebuild');

-- A successful SQLite integrity check alone cannot catch accidentally omitted
-- identity copies. Fail the migration transaction if any scoped row was lost.
CREATE TEMP TABLE archive_migration_assert(ok INTEGER NOT NULL CHECK(ok=1));
INSERT INTO archive_migration_assert(ok)
    SELECT CASE WHEN
        follows = (SELECT count(*) FROM archive_follow) AND
        interactions = (SELECT count(*) FROM archive_interaction) AND
        reads = (SELECT count(*) FROM archive_read) AND
        sources = (SELECT count(*) FROM archive_post_source) AND
        posts = (SELECT count(*) FROM archive_post)
    THEN 1 ELSE 0 END
    FROM archive_migration_expected;
DROP TABLE archive_migration_assert;
DROP TABLE archive_migration_expected;
