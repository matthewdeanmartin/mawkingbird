//! Identity-owned local archive. Diesel handles typed rows and transactions;
//! embedded SQL migrations own SQLite-specific FTS5 and schema transitions.
use anyhow::{bail, Context, Result};
use diesel::{
    connection::SimpleConnection, prelude::*, sql_query, sql_types::BigInt,
    sqlite::SqliteConnection, Connection, OptionalExtension as _,
};
use diesel_migrations::{embed_migrations, EmbeddedMigrations, MigrationHarness};
use rusqlite::{backup::Backup, Connection as RawConnection, OptionalExtension};
use serde::Serialize;
use serde_json::Value;
use std::{path::Path, time::Duration};

pub const MIGRATIONS: EmbeddedMigrations = embed_migrations!("migrations");

diesel::table! {
    archive_identity (id) {
        id -> BigInt,
        provider -> Text,
        origin -> Text,
        remote_id -> Text,
        credential_handle -> Nullable<Text>,
    }
}
diesel::table! {
    archive_credential (identity_id, handle) {
        identity_id -> BigInt,
        handle -> Text,
    }
}
diesel::table! {
    archive_actor (id) {
        id -> BigInt,
        identity_id -> BigInt,
        remote_id -> Text,
        acct -> Text,
        display_name -> Text,
        last_status_at -> Nullable<Text>,
        profile_json -> Nullable<Text>,
    }
}
diesel::table! {
    archive_follow_scan (identity_id) {
        identity_id -> BigInt,
        generation -> BigInt,
        next_cursor -> Nullable<Text>,
        complete -> Bool,
        updated_at -> BigInt,
    }
}
diesel::table! {
    archive_follow (identity_id, actor_id) {
        identity_id -> BigInt,
        actor_id -> BigInt,
        seen_generation -> BigInt,
    }
}
diesel::table! {
    archive_relationship (identity_id, actor_id) {
        identity_id -> BigInt,
        actor_id -> BigInt,
        followed_by -> Bool,
        observed_at -> BigInt,
    }
}
diesel::table! {
    archive_post (id) {
        id -> BigInt,
        identity_id -> BigInt,
        remote_id -> Text,
        actor_id -> BigInt,
        created_at -> Text,
        visibility -> Text,
        content -> Text,
        spoiler_text -> Nullable<Text>,
        in_reply_to_remote_id -> Nullable<Text>,
        reblog_of_remote_id -> Nullable<Text>,
        media_json -> Nullable<Text>,
        tags_json -> Nullable<Text>,
        raw_json -> Nullable<Text>,
        replies_count -> BigInt,
        reblogs_count -> BigInt,
        favourites_count -> BigInt,
    }
}
diesel::table! {
    archive_read (identity_id, post_id) {
        identity_id -> BigInt,
        post_id -> BigInt,
        read_at -> BigInt,
    }
}
diesel::table! {
    archive_post_analysis (identity_id, post_id, analyzer) {
        identity_id -> BigInt,
        post_id -> BigInt,
        analyzer -> Text,
        analyzer_version -> BigInt,
        input_hash -> Text,
        score -> Nullable<Double>,
        result_json -> Nullable<Text>,
        computed_at -> BigInt,
    }
}
diesel::table! {
    archive_post_source (identity_id, post_id, source) {
        identity_id -> BigInt,
        post_id -> BigInt,
        source -> Text,
    }
}
diesel::allow_tables_to_appear_in_same_query!(
    archive_identity,
    archive_credential,
    archive_actor,
    archive_follow_scan,
    archive_follow,
    archive_relationship,
    archive_post,
    archive_read,
    archive_post_analysis,
    archive_post_source,
);

#[derive(Insertable)]
#[diesel(table_name = archive_post)]
struct NewPost<'a> {
    identity_id: i64,
    remote_id: &'a str,
    actor_id: i64,
    created_at: &'a str,
    visibility: &'a str,
    content: &'a str,
    spoiler_text: Option<&'a str>,
    in_reply_to_remote_id: Option<&'a str>,
    reblog_of_remote_id: Option<&'a str>,
    media_json: Option<&'a str>,
    tags_json: Option<&'a str>,
    raw_json: Option<&'a str>,
    replies_count: i64,
    reblogs_count: i64,
    favourites_count: i64,
}

#[derive(Clone, Debug)]
pub struct FollowedActor {
    pub remote_id: String,
    pub acct: String,
    pub display_name: String,
    pub last_status_at: Option<String>,
    pub profile_json: Option<String>,
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FollowStatus {
    pub following: i64,
    pub known_zombies: i64,
    pub unknown_activity: i64,
    pub generation: i64,
    pub complete: bool,
    pub updated_at: i64,
}

#[derive(QueryableByName)]
struct FollowCounts {
    #[diesel(sql_type = BigInt)]
    following: i64,
    #[diesel(sql_type = BigInt)]
    known_zombies: i64,
    #[diesel(sql_type = BigInt)]
    unknown_activity: i64,
}

#[derive(QueryableByName)]
struct ProfileRow {
    #[diesel(sql_type = BigInt)]
    id: i64,
    #[diesel(sql_type = diesel::sql_types::Text)]
    remote_id: String,
    #[diesel(sql_type = diesel::sql_types::Text)]
    acct: String,
    #[diesel(sql_type = diesel::sql_types::Text)]
    display_name: String,
    #[diesel(sql_type = diesel::sql_types::Nullable<diesel::sql_types::Text>)]
    last_status_at: Option<String>,
    #[diesel(sql_type = diesel::sql_types::Nullable<diesel::sql_types::Text>)]
    profile_json: Option<String>,
    #[diesel(sql_type = BigInt)]
    cached_posts: i64,
    #[diesel(sql_type = BigInt)]
    cached_unread: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileSummary {
    pub id: i64,
    pub remote_id: String,
    pub acct: String,
    pub display_name: String,
    pub last_status_at: Option<String>,
    pub avatar: Option<String>,
    pub cached_posts: i64,
    pub cached_unread: i64,
}

fn profile_summary(row: ProfileRow) -> ProfileSummary {
    ProfileSummary {
        id: row.id,
        remote_id: row.remote_id,
        acct: row.acct,
        display_name: row.display_name,
        last_status_at: row.last_status_at,
        avatar: row
            .profile_json
            .as_deref()
            .and_then(|json| serde_json::from_str::<Value>(json).ok())
            .and_then(|profile| {
                profile
                    .get("avatar")
                    .and_then(Value::as_str)
                    .map(str::to_owned)
            }),
        cached_posts: row.cached_posts,
        cached_unread: row.cached_unread,
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfilesResult {
    pub profiles: Vec<ProfileSummary>,
    pub following: i64,
    pub scan_complete: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PeoplePostsResult {
    pub posts: Vec<ProfilePost>,
    pub following: i64,
    pub relationships_known: i64,
    pub scan_complete: bool,
}

#[derive(QueryableByName)]
struct CountRow {
    #[diesel(sql_type = BigInt)]
    count: i64,
}

fn people_category_clause(category: &str) -> Result<String> {
    let followed = "EXISTS (SELECT 1 FROM archive_follow f WHERE f.identity_id=a.identity_id AND f.actor_id=a.id)";
    let mutual = "EXISTS (SELECT 1 FROM archive_relationship rel WHERE rel.identity_id=a.identity_id AND rel.actor_id=a.id AND rel.followed_by=1)";
    let non_mutual = "EXISTS (SELECT 1 FROM archive_relationship rel WHERE rel.identity_id=a.identity_id AND rel.actor_id=a.id AND rel.followed_by=0)";
    let inbound = "EXISTS (SELECT 1 FROM archive_interaction i WHERE i.identity_id=a.identity_id AND i.actor_id=a.id AND i.kind IN ('mention','favourite','reblog','status','quote'))";
    Ok(match category {
        "all" => followed.to_owned(),
        "social" => format!("{followed} AND {mutual} AND {inbound}"),
        "mutuals" => format!("{followed} AND {mutual}"),
        "reading" => format!("{followed} AND {non_mutual}"),
        "readers" => "EXISTS (SELECT 1 FROM archive_interaction i WHERE i.identity_id=a.identity_id AND i.actor_id=a.id AND i.kind='reblog')".into(),
        "bots" => format!("{followed} AND json_extract(a.profile_json,'$.bot')=1"),
        "lively" => format!("{followed} AND a.last_status_at IS NOT NULL AND unixepoch(a.last_status_at)>=unixepoch('now','-30 days')"),
        "zombies" => format!("{followed} AND a.last_status_at IS NOT NULL AND unixepoch(a.last_status_at)<unixepoch('now','-90 days')"),
        "celebrities" => format!("{followed} AND {non_mutual} AND CAST(json_extract(a.profile_json,'$.followers_count') AS INTEGER)>10000"),
        _ => bail!("unsupported people category"),
    })
}

#[derive(QueryableByName)]
struct ProfilePostRow {
    #[diesel(sql_type = BigInt)]
    local_id: i64,
    #[diesel(sql_type = diesel::sql_types::Text)]
    raw_json: String,
    #[diesel(sql_type = diesel::sql_types::Bool)]
    is_read: bool,
}

#[derive(QueryableByName)]
struct ProfileCursorRow {
    #[diesel(sql_type = BigInt)]
    local_id: i64,
    #[diesel(sql_type = diesel::sql_types::Text)]
    created_at: String,
    #[diesel(sql_type = diesel::sql_types::Text)]
    raw_json: String,
    #[diesel(sql_type = diesel::sql_types::Bool)]
    is_read: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileCursor {
    pub created_at: String,
    pub local_id: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfilePostPage {
    pub posts: Vec<ProfilePost>,
    pub next: Option<ProfileCursor>,
}

#[derive(QueryableByName)]
struct TextRow {
    #[diesel(sql_type = diesel::sql_types::Text)]
    value: String,
}

#[derive(QueryableByName)]
struct OptionalTextRow {
    #[diesel(sql_type = diesel::sql_types::Nullable<diesel::sql_types::Text>)]
    value: Option<String>,
}

#[derive(QueryableByName, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectorCount {
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub job: String,
    #[diesel(sql_type = BigInt)]
    pub api_calls: i64,
    #[diesel(sql_type = BigInt)]
    pub saved_items: i64,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub last_outcome: String,
    #[diesel(sql_type = BigInt)]
    pub updated_at: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionStatus {
    pub current_job: String,
    pub following: Option<FollowStatus>,
    pub cached_posts: i64,
    pub profiles_with_posts: i64,
    pub seed_eligible: i64,
    pub jobs: Vec<CollectorCount>,
    pub notification_history_complete: bool,
}

#[derive(QueryableByName)]
pub struct SeedCandidate {
    #[diesel(sql_type = BigInt)]
    pub actor_id: i64,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub remote_id: String,
}

/// Resume point for an analytics catch-up that hit its page cap.
#[derive(Clone, Debug, PartialEq, Serialize, serde::Deserialize)]
pub struct CatchUpCursor {
    /// Continue paging older from this status id.
    pub max_id: String,
    /// Newest cached `created_at` when the catch-up began; reaching it closes the gap.
    pub stop_at: Option<String>,
}

#[derive(QueryableByName, Serialize, Debug, PartialEq)]
pub struct FollowerPoint {
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub day: String,
    #[diesel(sql_type = BigInt)]
    pub followers: i64,
    #[diesel(sql_type = BigInt)]
    pub following: i64,
}

#[derive(QueryableByName, Serialize, Debug, PartialEq)]
pub struct MonthCount {
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub month: String,
    #[diesel(sql_type = BigInt)]
    pub count: i64,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AudienceHistory {
    pub followers: Vec<FollowerPoint>,
    pub follows_by_month: Vec<MonthCount>,
    /// Old notifications have all been read, so early months are not undercounted.
    pub notification_history_complete: bool,
}

#[derive(QueryableByName, Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CountPoint {
    /// Unix seconds.
    #[diesel(sql_type = BigInt)]
    pub observed_at: i64,
    #[diesel(sql_type = BigInt)]
    pub replies: i64,
    #[diesel(sql_type = BigInt)]
    pub reblogs: i64,
    #[diesel(sql_type = BigInt)]
    pub favourites: i64,
    #[diesel(sql_type = BigInt)]
    pub quotes: i64,
}

#[derive(QueryableByName, Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ActivityEvent {
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub kind: String,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub occurred_at: String,
}

#[derive(QueryableByName, Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EngagerRow {
    /// The person's account id on the home server.
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub actor: String,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub acct: String,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub display_name: String,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub kind: String,
    /// `YYYY-MM`.
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub month: String,
    #[diesel(sql_type = BigInt)]
    pub count: i64,
}

/// One timed notification from the unbroken part of the archive.
#[derive(QueryableByName, Serialize, Debug, PartialEq)]
pub struct TimedEvent {
    /// Notification id.
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub id: String,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub kind: String,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub at: String,
    /// The person's account id on the home server.
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub actor: String,
    /// The post the notification is about (the reply itself, for a mention).
    #[diesel(sql_type = diesel::sql_types::Nullable<diesel::sql_types::Text>)]
    pub post: Option<String>,
}

#[derive(QueryableByName)]
struct JsonRow {
    #[diesel(sql_type = diesel::sql_types::Text)]
    id: String,
    #[diesel(sql_type = diesel::sql_types::Nullable<diesel::sql_types::Text>)]
    json: Option<String>,
}

/// Timed reactions with the people and posts they name, each listed once.
#[derive(Serialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct TimedReactions {
    /// False until the collector has joined new notifications to older ones.
    /// Nothing else is filled in then.
    pub connected: bool,
    /// Every notification since this time is in the archive.
    pub covered_since: Option<String>,
    pub events: Vec<TimedEvent>,
    pub people: serde_json::Map<String, Value>,
    pub posts: serde_json::Map<String, Value>,
}

/// Most events one read returns; older ones move `covered_since` forward.
const MAX_TIMED_EVENTS: usize = 20_000;

/// Only what the analytics use; a stored profile also holds header art etc.
const PERSON_FIELDS: &[&str] = &[
    "id",
    "username",
    "acct",
    "display_name",
    "emojis",
    "note",
    "url",
    "avatar",
    "avatar_static",
    "followers_count",
    "following_count",
    "statuses_count",
    "last_status_at",
    "created_at",
    "bot",
    "group",
    "locked",
    "fields",
];
const POST_FIELDS: &[&str] = &[
    "id",
    "content",
    "created_at",
    "language",
    "in_reply_to_id",
    "in_reply_to_account_id",
    "tags",
];

fn pick(json: Option<&str>, id: &str, fields: &[&str]) -> Value {
    let parsed: Value = json
        .and_then(|text| serde_json::from_str(text).ok())
        .unwrap_or(Value::Null);
    let mut out = serde_json::Map::new();
    for field in fields {
        if let Some(value) = parsed.get(*field) {
            out.insert((*field).to_owned(), value.clone());
        }
    }
    out.insert("id".to_owned(), Value::String(id.to_owned()));
    Value::Object(out)
}

#[derive(Serialize, Debug)]
pub struct PostActivity {
    pub snapshots: Vec<CountPoint>,
    pub events: Vec<ActivityEvent>,
}

pub struct BoosterCache {
    pub post_known: bool,
    /// None: never looked up, or the boost count changed since.
    pub boosters: Option<Vec<Value>>,
}

#[derive(QueryableByName)]
struct ScanRow {
    #[diesel(sql_type = BigInt)]
    value: i64,
}

#[derive(QueryableByName)]
struct BoosterRow {
    #[diesel(sql_type = diesel::sql_types::Nullable<diesel::sql_types::Text>)]
    value: Option<String>,
    #[diesel(sql_type = BigInt)]
    followers: i64,
}

fn check_remote_id(id: &str) -> Result<()> {
    if id.is_empty() || id.len() > 64 || !id.bytes().all(|b| b.is_ascii_digit()) {
        bail!("invalid remote id");
    }
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfilePost {
    pub local_id: i64,
    pub status: Value,
    pub is_read: bool,
}

fn backup_before_migration(path: &Path) -> Result<()> {
    if !path.exists() || path.metadata()?.len() == 0 {
        return Ok(());
    }
    let source = RawConnection::open(path)?;
    let version: String = source
        .query_row(
            "SELECT max(version) FROM __diesel_schema_migrations",
            [],
            |row| row.get::<_, Option<String>>(0),
        )
        .optional()
        .ok()
        .flatten()
        .flatten()
        .unwrap_or_else(|| "legacy".into());
    let target = path.with_extension(format!("before-{version}.sqlite3"));
    if target.exists() {
        verify_file(&target).context("checking previous archive backup")?;
        return Ok(());
    }
    let partial = target.with_extension("partial");
    if partial.exists() {
        std::fs::remove_file(&partial)?;
    }
    let mut destination = RawConnection::open(&partial)?;
    Backup::new(&source, &mut destination)?.run_to_completion(
        64,
        Duration::from_millis(25),
        None,
    )?;
    drop(destination);
    verify_file(&partial)?;
    std::fs::rename(&partial, &target)?;
    Ok(())
}

fn verify_file(path: &Path) -> Result<()> {
    let raw = RawConnection::open(path)?;
    let verdict: String = raw.query_row("PRAGMA quick_check", [], |row| row.get(0))?;
    if verdict != "ok" {
        bail!("archive integrity check failed");
    }
    let mut statement = raw.prepare("PRAGMA foreign_key_check")?;
    if statement.query([])?.next()?.is_some() {
        bail!("archive foreign key check failed");
    }
    Ok(())
}

/// Earlier prototype databases may lack the final credential_handle column.
/// This compatibility step runs only after a consistent SQLite backup exists.
fn normalize_legacy(path: &Path) -> Result<()> {
    let raw = RawConnection::open(path)?;
    let columns = raw
        .prepare("PRAGMA table_info(archive_identity)")?
        .query_map([], |row| row.get::<_, String>(1))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    if !columns.is_empty()
        && ["id", "provider", "origin", "remote_id"]
            .iter()
            .any(|required| !columns.iter().any(|column| column == required))
    {
        bail!("unrecognized legacy archive schema");
    }
    if !columns.is_empty() && !columns.iter().any(|column| column == "credential_handle") {
        raw.execute(
            "ALTER TABLE archive_identity ADD COLUMN credential_handle TEXT",
            [],
        )?;
    }
    Ok(())
}

pub struct Archive {
    db: SqliteConnection,
}

impl Archive {
    /// None means never started; Some(None) means the old-history pass ended.
    pub fn notification_cursor(
        &mut self,
        credential: &str,
        server: &str,
    ) -> Result<Option<Option<String>>> {
        let account = self
            .identity_for_handle(credential, server)?
            .context("archive identity unavailable")?;
        Ok(sql_query(
            "SELECT cursor AS value FROM archive_cursor WHERE identity_id=? AND source='notifications:history'",
        )
        .bind::<BigInt, _>(account)
        .get_result::<OptionalTextRow>(&mut self.db)
        .optional()?
        .map(|row| row.value))
    }

    pub fn save_notification_cursor(
        &mut self,
        credential: &str,
        server: &str,
        cursor: Option<&str>,
    ) -> Result<()> {
        if cursor.is_some_and(|value| {
            value.is_empty() || value.len() > 128 || !value.bytes().all(|b| b.is_ascii_digit())
        }) {
            bail!("invalid notification cursor");
        }
        let account = self
            .identity_for_handle(credential, server)?
            .context("archive identity unavailable")?;
        sql_query("INSERT INTO archive_cursor(identity_id,source,cursor,updated_at) VALUES(?,'notifications:history',?,unixepoch()) ON CONFLICT(identity_id,source) DO UPDATE SET cursor=excluded.cursor,updated_at=excluded.updated_at")
            .bind::<BigInt, _>(account)
            .bind::<diesel::sql_types::Nullable<diesel::sql_types::Text>, _>(cursor)
            .execute(&mut self.db)?;
        Ok(())
    }

    /// The newest notification known to be joined, without a gap, to the ones
    /// before it. `None` until the collector has recorded one.
    pub fn notification_mark(&mut self, credential: &str, server: &str) -> Result<Option<String>> {
        let account = self
            .identity_for_handle(credential, server)?
            .context("archive identity unavailable")?;
        Ok(sql_query(
            "SELECT cursor AS value FROM archive_cursor WHERE identity_id=? AND source='notifications:newest'",
        )
        .bind::<BigInt, _>(account)
        .get_result::<OptionalTextRow>(&mut self.db)
        .optional()?
        .and_then(|row| row.value))
    }

    /// Record a finished read of the newest notifications. `history` also moves
    /// where the older ones resume; both change together or not at all.
    pub fn save_notification_mark(
        &mut self,
        credential: &str,
        server: &str,
        newest: &str,
        history: Option<Option<&str>>,
    ) -> Result<()> {
        let valid = |value: &str| {
            !value.is_empty() && value.len() <= 128 && value.bytes().all(|b| b.is_ascii_digit())
        };
        if !valid(newest) || history.flatten().is_some_and(|value| !valid(value)) {
            bail!("invalid notification cursor");
        }
        let account = self
            .identity_for_handle(credential, server)?
            .context("archive identity unavailable")?;
        self.db.transaction::<_, anyhow::Error, _>(|db| {
            let mut save = |source: &str, value: Option<&str>| {
                sql_query("INSERT INTO archive_cursor(identity_id,source,cursor,updated_at) VALUES(?,?,?,unixepoch()) ON CONFLICT(identity_id,source) DO UPDATE SET cursor=excluded.cursor,updated_at=excluded.updated_at")
                    .bind::<BigInt, _>(account)
                    .bind::<diesel::sql_types::Text, _>(source)
                    .bind::<diesel::sql_types::Nullable<diesel::sql_types::Text>, _>(value)
                    .execute(db)
            };
            if let Some(cursor) = history {
                save("notifications:history", cursor)?;
            }
            save("notifications:newest", Some(newest))?;
            Ok(())
        })
    }

    pub fn record_collector_request(
        &mut self,
        credential: &str,
        server: &str,
        job: &str,
    ) -> Result<()> {
        if !matches!(
            job,
            "following" | "relationships" | "notifications" | "recent_seed" | "analytics"
        ) {
            bail!("unsupported collector job");
        }
        let account = self
            .identity_for_handle(credential, server)?
            .context("archive identity unavailable")?;
        sql_query("INSERT INTO archive_collector_count(identity_id,job,api_calls,last_outcome) VALUES(?,?,1,'requesting') ON CONFLICT(identity_id,job) DO UPDATE SET api_calls=api_calls+1,last_outcome='requesting',updated_at=unixepoch()")
            .bind::<BigInt, _>(account)
            .bind::<diesel::sql_types::Text, _>(job)
            .execute(&mut self.db)?;
        Ok(())
    }

    pub fn record_collector_saved(
        &mut self,
        credential: &str,
        server: &str,
        job: &str,
        count: i64,
    ) -> Result<()> {
        if count < 0
            || !matches!(
                job,
                "following" | "relationships" | "notifications" | "recent_seed" | "analytics"
            )
        {
            bail!("invalid collector result");
        }
        let account = self
            .identity_for_handle(credential, server)?
            .context("archive identity unavailable")?;
        sql_query("INSERT INTO archive_collector_count(identity_id,job,saved_items,last_outcome) VALUES(?,?,?,'saved') ON CONFLICT(identity_id,job) DO UPDATE SET saved_items=saved_items+excluded.saved_items,last_outcome='saved',updated_at=unixepoch()")
            .bind::<BigInt, _>(account)
            .bind::<diesel::sql_types::Text, _>(job)
            .bind::<BigInt, _>(count)
            .execute(&mut self.db)?;
        Ok(())
    }

    pub fn record_collector_problem(
        &mut self,
        credential: &str,
        server: &str,
        job: &str,
        problem: &str,
    ) -> Result<()> {
        if !matches!(
            job,
            "following" | "relationships" | "notifications" | "recent_seed" | "analytics"
        ) || !matches!(problem, "network" | "rate_limit" | "provider")
        {
            bail!("invalid collector problem");
        }
        let account = self
            .identity_for_handle(credential, server)?
            .context("archive identity unavailable")?;
        sql_query("UPDATE archive_collector_count SET last_outcome=?,updated_at=unixepoch() WHERE identity_id=? AND job=?")
            .bind::<diesel::sql_types::Text, _>(problem)
            .bind::<BigInt, _>(account)
            .bind::<diesel::sql_types::Text, _>(job)
            .execute(&mut self.db)?;
        Ok(())
    }

    pub fn collection_status(
        &mut self,
        credential: &str,
        server: &str,
    ) -> Result<CollectionStatus> {
        let account = self
            .identity_for_handle(credential, server)?
            .context("archive identity unavailable")?;
        let cached_posts =
            sql_query("SELECT COUNT(*) AS count FROM archive_post WHERE identity_id=?")
                .bind::<BigInt, _>(account)
                .get_result::<CountRow>(&mut self.db)?
                .count;
        let profiles_with_posts = sql_query(
            "SELECT COUNT(DISTINCT actor_id) AS count FROM archive_post WHERE identity_id=?",
        )
        .bind::<BigInt, _>(account)
        .get_result::<CountRow>(&mut self.db)?
        .count;
        let seed_eligible = sql_query(
            "SELECT COUNT(*) AS count FROM archive_follow f JOIN archive_actor a ON a.id=f.actor_id AND a.identity_id=f.identity_id
             LEFT JOIN archive_seed s ON s.identity_id=f.identity_id AND s.actor_id=f.actor_id
             WHERE f.identity_id=? AND a.last_status_at IS NOT NULL
               AND unixepoch(a.last_status_at)>=unixepoch('now','-90 days')
               AND (s.fetched_at IS NULL OR s.fetched_at<=unixepoch('now','-7 days'))"
        ).bind::<BigInt, _>(account).get_result::<CountRow>(&mut self.db)?.count;
        let jobs = sql_query("SELECT job,api_calls,saved_items,last_outcome,updated_at FROM archive_collector_count WHERE identity_id=? ORDER BY job")
            .bind::<BigInt, _>(account).load::<CollectorCount>(&mut self.db)?;
        Ok(CollectionStatus {
            current_job: "idle".into(),
            following: self.follow_status(server, credential)?,
            cached_posts,
            profiles_with_posts,
            seed_eligible,
            jobs,
            notification_history_complete: self.notification_cursor(credential, server)?
                == Some(None),
        })
    }

    pub fn next_seed_candidate(
        &mut self,
        credential: &str,
        server: &str,
    ) -> Result<Option<SeedCandidate>> {
        let account = self
            .identity_for_handle(credential, server)?
            .context("archive identity unavailable")?;
        Ok(sql_query(
            "SELECT a.id AS actor_id,a.remote_id AS remote_id FROM archive_follow f
             JOIN archive_actor a ON a.id=f.actor_id AND a.identity_id=f.identity_id
             LEFT JOIN archive_seed s ON s.identity_id=f.identity_id AND s.actor_id=f.actor_id
             WHERE f.identity_id=? AND a.last_status_at IS NOT NULL
               AND unixepoch(a.last_status_at)>=unixepoch('now','-90 days')
               AND (s.fetched_at IS NULL OR s.fetched_at<=unixepoch('now','-7 days'))
             ORDER BY a.last_status_at DESC,a.id LIMIT 1",
        )
        .bind::<BigInt, _>(account)
        .get_result(&mut self.db)
        .optional()?)
    }

    pub fn finish_seed_page(
        &mut self,
        credential: &str,
        server: &str,
        actor: i64,
        saved: i64,
    ) -> Result<()> {
        let account = self
            .identity_for_handle(credential, server)?
            .context("archive identity unavailable")?;
        self.db.transaction::<_, anyhow::Error, _>(|db| {
            let followed = archive_follow::table
                .filter(archive_follow::identity_id.eq(account))
                .filter(archive_follow::actor_id.eq(actor))
                .select(archive_follow::actor_id).first::<i64>(db).optional()?.is_some();
            if !followed { bail!("seed actor no longer followed"); }
            sql_query("INSERT INTO archive_seed(identity_id,actor_id) VALUES(?,?) ON CONFLICT(identity_id,actor_id) DO UPDATE SET fetched_at=unixepoch()")
                .bind::<BigInt, _>(account).bind::<BigInt, _>(actor).execute(db)?;
            sql_query("INSERT INTO archive_collector_count(identity_id,job,saved_items,last_outcome) VALUES(?,'recent_seed',?,'saved') ON CONFLICT(identity_id,job) DO UPDATE SET saved_items=saved_items+excluded.saved_items,last_outcome='saved',updated_at=unixepoch()")
                .bind::<BigInt, _>(account).bind::<BigInt, _>(saved).execute(db)?;
            Ok(())
        })
    }

    pub fn people_members(
        &mut self,
        credential: &str,
        server: &str,
        category: &str,
    ) -> Result<Vec<ProfileSummary>> {
        let clause = people_category_clause(category)?;
        let account = self
            .identity_for_handle(credential, server)?
            .context("archive identity unavailable")?;
        let ordering = match category {
            "zombies" => "last_status_at ASC NULLS LAST, a.id",
            "celebrities" => {
                "CAST(json_extract(a.profile_json,'$.followers_count') AS INTEGER) DESC, a.id"
            }
            _ => "last_status_at DESC NULLS LAST, a.id",
        };
        let query = format!(
            "SELECT a.id AS id, a.remote_id AS remote_id, a.acct AS acct, a.display_name AS display_name,
                    NULLIF(MAX(COALESCE((SELECT MAX(p.created_at) FROM archive_post p WHERE p.identity_id=a.identity_id AND p.actor_id=a.id), ''),
                               COALESCE(a.last_status_at, '')), '') AS last_status_at,
                    a.profile_json AS profile_json,
                    (SELECT COUNT(*) FROM archive_post p WHERE p.identity_id=a.identity_id AND p.actor_id=a.id) AS cached_posts,
                    (SELECT COUNT(*) FROM archive_post p LEFT JOIN archive_read r ON r.identity_id=p.identity_id AND r.post_id=p.id
                     WHERE p.identity_id=a.identity_id AND p.actor_id=a.id AND r.post_id IS NULL) AS cached_unread
             FROM archive_actor a WHERE a.identity_id=? AND ({clause})
             ORDER BY {ordering} LIMIT 5000"
        );
        let rows: Vec<ProfileRow> = sql_query(query)
            .bind::<BigInt, _>(account)
            .load(&mut self.db)?;
        Ok(rows.into_iter().map(profile_summary).collect())
    }

    /// The two filters are independent: people membership selects authors,
    /// while a post bin selects the shape of their cached writing.
    pub fn people_posts(
        &mut self,
        credential: &str,
        server: &str,
        category: &str,
        bin: &str,
        offset: i64,
    ) -> Result<PeoplePostsResult> {
        if !(0..=5000).contains(&offset) {
            bail!("unsupported people filter");
        }
        let category_clause = people_category_clause(category)?;
        let bin_clause = match bin {
            "all" => "p.reblog_of_remote_id IS NULL AND (p.in_reply_to_remote_id IS NULL OR CAST(json_extract(p.raw_json,'$.in_reply_to_account_id') AS TEXT)=a.remote_id)",
            "storms" => "p.reblog_of_remote_id IS NULL AND p.in_reply_to_remote_id IS NULL AND EXISTS (SELECT 1 FROM archive_post child WHERE child.identity_id=p.identity_id AND child.actor_id=p.actor_id AND child.in_reply_to_remote_id=p.remote_id AND child.reblog_of_remote_id IS NULL)",
            "discussions" => "p.reblog_of_remote_id IS NULL AND p.in_reply_to_remote_id IS NOT NULL AND CAST(json_extract(p.raw_json,'$.in_reply_to_account_id') AS TEXT)<>a.remote_id",
            "pictures" => "p.reblog_of_remote_id IS NULL AND EXISTS (SELECT 1 FROM json_each(p.media_json) media WHERE json_extract(media.value,'$.type')='image')",
            "videos" => "p.reblog_of_remote_id IS NULL AND EXISTS (SELECT 1 FROM json_each(p.media_json) media WHERE json_extract(media.value,'$.type') IN ('video','gifv','audio'))",
            "reposts" => "p.reblog_of_remote_id IS NOT NULL",
            _ => bail!("unsupported post bin"),
        };
        let account = self
            .identity_for_handle(credential, server)?
            .context("archive identity unavailable")?;
        let following: i64 = archive_follow::table
            .filter(archive_follow::identity_id.eq(account))
            .count()
            .get_result(&mut self.db)?;
        let relationships_known: i64 = sql_query(
            "SELECT COUNT(*) AS count FROM archive_relationship r
             JOIN archive_follow f ON f.identity_id=r.identity_id AND f.actor_id=r.actor_id
             WHERE r.identity_id=?",
        )
        .bind::<BigInt, _>(account)
        .get_result::<CountRow>(&mut self.db)?
        .count;
        let scan_complete = archive_follow_scan::table
            .filter(archive_follow_scan::identity_id.eq(account))
            .select(archive_follow_scan::complete)
            .first::<bool>(&mut self.db)
            .optional()?
            .unwrap_or(false);
        let query = format!(
            "SELECT p.id AS local_id, p.raw_json AS raw_json,
                    (r.post_id IS NOT NULL) AS is_read
             FROM archive_post p
             JOIN archive_actor a ON a.id=p.actor_id AND a.identity_id=p.identity_id
             LEFT JOIN archive_read r ON r.identity_id=p.identity_id AND r.post_id=p.id
             WHERE p.identity_id=? AND p.raw_json IS NOT NULL
               AND ({category_clause}) AND ({bin_clause})
             ORDER BY p.created_at DESC, p.id DESC LIMIT 40 OFFSET ?"
        );
        let rows: Vec<ProfilePostRow> = sql_query(query)
            .bind::<BigInt, _>(account)
            .bind::<BigInt, _>(offset)
            .load(&mut self.db)?;
        let posts = rows
            .into_iter()
            .filter_map(|row| {
                serde_json::from_str(&row.raw_json)
                    .ok()
                    .map(|status| ProfilePost {
                        local_id: row.local_id,
                        status,
                        is_read: row.is_read,
                    })
            })
            .collect();
        Ok(PeoplePostsResult {
            posts,
            following,
            relationships_known,
            scan_complete,
        })
    }

    pub fn account_posts(
        &mut self,
        credential: &str,
        server: &str,
        remote_id: &str,
        offset: i64,
    ) -> Result<Vec<ProfilePost>> {
        if remote_id.is_empty()
            || remote_id.len() > 64
            || !remote_id.bytes().all(|b| b.is_ascii_digit())
            || !(0..=5000).contains(&offset)
        {
            bail!("invalid account id");
        }
        let account = self
            .identity_for_handle(credential, server)?
            .context("archive identity unavailable")?;
        let actor = archive_actor::table
            .filter(archive_actor::identity_id.eq(account))
            .filter(archive_actor::remote_id.eq(remote_id))
            .select(archive_actor::id)
            .first::<i64>(&mut self.db)
            .optional()?;
        match actor {
            Some(actor) => self.profile_posts(credential, server, actor, "all", false, offset),
            None => Ok(Vec::new()),
        }
    }

    pub fn oldest_account_post_id(
        &mut self,
        credential: &str,
        server: &str,
        remote_id: &str,
    ) -> Result<Option<String>> {
        if remote_id.is_empty()
            || remote_id.len() > 64
            || !remote_id.bytes().all(|b| b.is_ascii_digit())
        {
            bail!("invalid account id");
        }
        let account = self
            .identity_for_handle(credential, server)?
            .context("archive identity unavailable")?;
        Ok(sql_query(
            "SELECT p.remote_id AS value FROM archive_post p
             JOIN archive_actor a ON a.id=p.actor_id AND a.identity_id=p.identity_id
             WHERE p.identity_id=? AND a.remote_id=?
             ORDER BY p.created_at ASC, p.id ASC LIMIT 1",
        )
        .bind::<BigInt, _>(account)
        .bind::<diesel::sql_types::Text, _>(remote_id)
        .get_result::<TextRow>(&mut self.db)
        .optional()?
        .map(|row| row.value))
    }

    pub fn profiles(&mut self, credential: &str, server: &str) -> Result<ProfilesResult> {
        let account = self
            .identity_for_handle(credential, server)?
            .context("archive identity unavailable")?;
        let following: i64 = archive_follow::table
            .filter(archive_follow::identity_id.eq(account))
            .count()
            .get_result(&mut self.db)?;
        let scan_complete: bool = archive_follow_scan::table
            .filter(archive_follow_scan::identity_id.eq(account))
            .select(archive_follow_scan::complete)
            .first(&mut self.db)
            .optional()?
            .unwrap_or(false);
        let rows: Vec<ProfileRow> = sql_query(
            "SELECT a.id AS id, a.remote_id AS remote_id, a.acct AS acct, a.display_name AS display_name,
                    NULLIF(MAX(COALESCE((SELECT MAX(p.created_at) FROM archive_post p
                              WHERE p.identity_id=a.identity_id AND p.actor_id=a.id), ''),
                             COALESCE(a.last_status_at, '')), '') AS last_status_at,
                    a.profile_json AS profile_json,
                    (SELECT COUNT(*) FROM archive_post p
                     WHERE p.identity_id=a.identity_id AND p.actor_id=a.id) AS cached_posts,
                    (SELECT COUNT(*) FROM archive_post p
                     LEFT JOIN archive_read r ON r.identity_id=p.identity_id AND r.post_id=p.id
                     WHERE p.identity_id=a.identity_id AND p.actor_id=a.id AND r.post_id IS NULL) AS cached_unread
             FROM archive_follow f JOIN archive_actor a
               ON a.id=f.actor_id AND a.identity_id=f.identity_id
             WHERE f.identity_id=?
             ORDER BY last_status_at DESC NULLS LAST, a.id
             LIMIT 5000"
        ).bind::<BigInt,_>(account).load(&mut self.db)?;
        let profiles = rows.into_iter().map(profile_summary).collect();
        Ok(ProfilesResult {
            profiles,
            following,
            scan_complete,
        })
    }

    pub fn profile_posts(
        &mut self,
        credential: &str,
        server: &str,
        actor_id: i64,
        filter: &str,
        hide_read: bool,
        offset: i64,
    ) -> Result<Vec<ProfilePost>> {
        if !matches!(filter, "all" | "replies" | "boosts" | "links" | "media")
            || !(0..=5000).contains(&offset)
        {
            bail!("unsupported profile filter");
        }
        let account = self
            .identity_for_handle(credential, server)?
            .context("archive identity unavailable")?;
        let owned = archive_actor::table
            .filter(archive_actor::id.eq(actor_id))
            .filter(archive_actor::identity_id.eq(account))
            .select(archive_actor::id)
            .first::<i64>(&mut self.db)
            .optional()?
            .is_some();
        if !owned {
            bail!("profile is not part of this identity");
        }
        let rows: Vec<ProfilePostRow> = sql_query(
            "SELECT p.id AS local_id, p.raw_json AS raw_json,
                    (r.post_id IS NOT NULL) AS is_read
             FROM archive_post p LEFT JOIN archive_read r
               ON r.identity_id=p.identity_id AND r.post_id=p.id
             WHERE p.identity_id=? AND p.actor_id=? AND p.raw_json IS NOT NULL
               AND (?=0 OR r.post_id IS NULL)
               AND (?='all' OR (?='replies' AND p.in_reply_to_remote_id IS NOT NULL)
                 OR (?='boosts' AND p.reblog_of_remote_id IS NOT NULL)
                 OR (?='links' AND p.content LIKE '%href=%')
                 OR (?='media' AND p.media_json IS NOT NULL AND p.media_json<>'[]'))
             ORDER BY p.created_at DESC, p.id DESC LIMIT 40 OFFSET ?",
        )
        .bind::<BigInt, _>(account)
        .bind::<BigInt, _>(actor_id)
        .bind::<diesel::sql_types::Bool, _>(hide_read)
        .bind::<diesel::sql_types::Text, _>(filter)
        .bind::<diesel::sql_types::Text, _>(filter)
        .bind::<diesel::sql_types::Text, _>(filter)
        .bind::<diesel::sql_types::Text, _>(filter)
        .bind::<diesel::sql_types::Text, _>(filter)
        .bind::<BigInt, _>(offset)
        .load(&mut self.db)?;
        Ok(rows
            .into_iter()
            .filter_map(|row| {
                serde_json::from_str(&row.raw_json)
                    .ok()
                    .map(|status| ProfilePost {
                        local_id: row.local_id,
                        status,
                        is_read: row.is_read,
                    })
            })
            .collect())
    }

    /// Keyset paging remains stable while new posts and read state enter the archive.
    pub fn profile_posts_after(
        &mut self,
        credential: &str,
        server: &str,
        actor_id: i64,
        filter: &str,
        hide_read: bool,
        before: Option<(&str, i64)>,
    ) -> Result<ProfilePostPage> {
        let (before_created_at, before_id) = before.unzip();
        if !matches!(filter, "all" | "replies" | "boosts" | "links" | "media")
            || before_created_at.is_some_and(|value| value.is_empty() || value.len() > 64)
            || before_id.is_some_and(|value| value <= 0)
        {
            bail!("invalid profile page cursor");
        }
        let account = self
            .identity_for_handle(credential, server)?
            .context("archive identity unavailable")?;
        let owned = archive_actor::table
            .filter(archive_actor::id.eq(actor_id))
            .filter(archive_actor::identity_id.eq(account))
            .select(archive_actor::id)
            .first::<i64>(&mut self.db)
            .optional()?
            .is_some();
        if !owned {
            bail!("profile is not part of this identity");
        }
        let mut rows: Vec<ProfileCursorRow> = sql_query(
            "SELECT p.id AS local_id,p.created_at AS created_at,p.raw_json AS raw_json,
                    (r.post_id IS NOT NULL) AS is_read
             FROM archive_post p LEFT JOIN archive_read r ON r.identity_id=p.identity_id AND r.post_id=p.id
             WHERE p.identity_id=? AND p.actor_id=? AND p.raw_json IS NOT NULL
               AND (?=0 OR r.post_id IS NULL)
               AND (?='all' OR (?='replies' AND p.in_reply_to_remote_id IS NOT NULL)
                 OR (?='boosts' AND p.reblog_of_remote_id IS NOT NULL)
                 OR (?='links' AND p.content LIKE '%href=%')
                 OR (?='media' AND p.media_json IS NOT NULL AND p.media_json<>'[]'))
               AND (? IS NULL OR p.created_at<? OR (p.created_at=? AND p.id<?))
             ORDER BY p.created_at DESC,p.id DESC LIMIT 41"
        )
        .bind::<BigInt, _>(account).bind::<BigInt, _>(actor_id)
        .bind::<diesel::sql_types::Bool, _>(hide_read)
        .bind::<diesel::sql_types::Text, _>(filter)
        .bind::<diesel::sql_types::Text, _>(filter)
        .bind::<diesel::sql_types::Text, _>(filter)
        .bind::<diesel::sql_types::Text, _>(filter)
        .bind::<diesel::sql_types::Text, _>(filter)
        .bind::<diesel::sql_types::Nullable<diesel::sql_types::Text>, _>(before_created_at)
        .bind::<diesel::sql_types::Nullable<diesel::sql_types::Text>, _>(before_created_at)
        .bind::<diesel::sql_types::Nullable<diesel::sql_types::Text>, _>(before_created_at)
        .bind::<diesel::sql_types::Nullable<BigInt>, _>(before_id)
        .load(&mut self.db)?;
        let more = rows.len() > 40;
        rows.truncate(40);
        let next = if more {
            rows.last().map(|row| ProfileCursor {
                created_at: row.created_at.clone(),
                local_id: row.local_id,
            })
        } else {
            None
        };
        let posts = rows
            .into_iter()
            .filter_map(|row| {
                serde_json::from_str(&row.raw_json)
                    .ok()
                    .map(|status| ProfilePost {
                        local_id: row.local_id,
                        status,
                        is_read: row.is_read,
                    })
            })
            .collect();
        Ok(ProfilePostPage { posts, next })
    }

    pub fn mark_read(&mut self, credential: &str, server: &str, post_id: i64) -> Result<()> {
        let account = self
            .identity_for_handle(credential, server)?
            .context("archive identity unavailable")?;
        let owned = archive_post::table
            .filter(archive_post::id.eq(post_id))
            .filter(archive_post::identity_id.eq(account))
            .select(archive_post::id)
            .first::<i64>(&mut self.db)
            .optional()?
            .is_some();
        if !owned {
            bail!("post is not part of this identity");
        }
        diesel::insert_into(archive_read::table)
            .values((
                archive_read::identity_id.eq(account),
                archive_read::post_id.eq(post_id),
                archive_read::read_at.eq(diesel::dsl::sql::<BigInt>("unixepoch()")),
            ))
            .on_conflict((archive_read::identity_id, archive_read::post_id))
            .do_nothing()
            .execute(&mut self.db)?;
        Ok(())
    }

    /// Commit one viewport pass atomically and reject IDs from another identity.
    pub fn mark_read_batch(
        &mut self,
        credential: &str,
        server: &str,
        post_ids: &[i64],
    ) -> Result<()> {
        if post_ids.is_empty() || post_ids.len() > 100 || post_ids.iter().any(|id| *id <= 0) {
            bail!("invalid read batch");
        }
        let account = self
            .identity_for_handle(credential, server)?
            .context("archive identity unavailable")?;
        self.db.transaction::<_, anyhow::Error, _>(|db| {
            for post_id in post_ids {
                let owned = archive_post::table
                    .filter(archive_post::id.eq(post_id))
                    .filter(archive_post::identity_id.eq(account))
                    .select(archive_post::id)
                    .first::<i64>(db)
                    .optional()?
                    .is_some();
                if !owned {
                    bail!("post is not part of this identity");
                }
            }
            for post_id in post_ids {
                diesel::insert_into(archive_read::table)
                    .values((
                        archive_read::identity_id.eq(account),
                        archive_read::post_id.eq(post_id),
                        archive_read::read_at.eq(diesel::dsl::sql::<BigInt>("unixepoch()")),
                    ))
                    .on_conflict((archive_read::identity_id, archive_read::post_id))
                    .do_nothing()
                    .execute(db)?;
            }
            Ok(())
        })
    }
    /// Record a count observation for one of the identity's own posts. Other
    /// people's posts are not tracked: their history would grow with every
    /// home-timeline read and nothing reports on it.
    fn snapshot_own_counts(
        db: &mut SqliteConnection,
        account: i64,
        local_post: i64,
        author_remote: &str,
        (replies, reblogs, favourites): (i64, i64, i64),
        status: &Value,
    ) -> Result<()> {
        let own = archive_identity::table
            .filter(archive_identity::id.eq(account))
            .filter(archive_identity::remote_id.eq(author_remote))
            .count()
            .get_result::<i64>(db)?
            > 0;
        if !own {
            return Ok(());
        }
        if let Some(author) = status.get("account") {
            Self::snapshot_followers(db, account, author)?;
        }
        let quotes = status
            .get("quotes_count")
            .and_then(Value::as_i64)
            .unwrap_or(0);
        sql_query("INSERT INTO archive_post_count_snapshot(identity_id,post_id,observed_at,replies,reblogs,favourites,quotes) VALUES(?,?,unixepoch(),?,?,?,?) ON CONFLICT(identity_id,post_id,observed_at) DO UPDATE SET replies=excluded.replies,reblogs=excluded.reblogs,favourites=excluded.favourites,quotes=excluded.quotes")
            .bind::<BigInt, _>(account)
            .bind::<BigInt, _>(local_post)
            .bind::<BigInt, _>(replies.max(0))
            .bind::<BigInt, _>(reblogs.max(0))
            .bind::<BigInt, _>(favourites.max(0))
            .bind::<BigInt, _>(quotes.max(0))
            .execute(db)?;
        Ok(())
    }

    /// An account's statuses (own posts and boosts), newest first, as last observed.
    pub fn analytics_posts(
        &mut self,
        credential: &str,
        server: &str,
        remote_id: &str,
        limit: i64,
    ) -> Result<Vec<Value>> {
        check_remote_id(remote_id)?;
        if !(1..=5000).contains(&limit) {
            bail!("invalid limit");
        }
        let account = self
            .identity_for_handle(credential, server)?
            .context("archive identity unavailable")?;
        let rows = sql_query(
            "SELECT p.raw_json AS value FROM archive_post p
             JOIN archive_actor a ON a.id=p.actor_id AND a.identity_id=p.identity_id
             WHERE p.identity_id=? AND a.remote_id=?
             ORDER BY p.created_at DESC, p.id DESC LIMIT ?",
        )
        .bind::<BigInt, _>(account)
        .bind::<diesel::sql_types::Text, _>(remote_id)
        .bind::<BigInt, _>(limit)
        .load::<OptionalTextRow>(&mut self.db)?;
        Ok(rows
            .into_iter()
            .filter_map(|row| row.value)
            .filter_map(|raw| serde_json::from_str(&raw).ok())
            .collect())
    }

    /// `created_at` of the account's newest cached post, if any.
    pub fn newest_account_post_created(
        &mut self,
        credential: &str,
        server: &str,
        remote_id: &str,
    ) -> Result<Option<String>> {
        check_remote_id(remote_id)?;
        let account = self
            .identity_for_handle(credential, server)?
            .context("archive identity unavailable")?;
        Ok(sql_query(
            "SELECT MAX(p.created_at) AS value FROM archive_post p
             JOIN archive_actor a ON a.id=p.actor_id AND a.identity_id=p.identity_id
             WHERE p.identity_id=? AND a.remote_id=?",
        )
        .bind::<BigInt, _>(account)
        .bind::<diesel::sql_types::Text, _>(remote_id)
        .get_result::<OptionalTextRow>(&mut self.db)
        .optional()?
        .and_then(|row| row.value))
    }

    /// The start of the recount window, in the API's timestamp format.
    pub fn recount_cutoff(&mut self, days: i64) -> Result<String> {
        if !(1..=365).contains(&days) {
            bail!("invalid recount window");
        }
        Ok(
            sql_query("SELECT strftime('%Y-%m-%dT%H:%M:%SZ','now',?) AS value")
                .bind::<diesel::sql_types::Text, _>(format!("-{days} days"))
                .get_result::<TextRow>(&mut self.db)?
                .value,
        )
    }

    /// An unfinished catch-up for one account: where to resume, and the cached
    /// edge it must reach before stopping. Stored as JSON in `archive_cursor`.
    pub fn analytics_cursor(
        &mut self,
        credential: &str,
        server: &str,
        remote_id: &str,
    ) -> Result<Option<CatchUpCursor>> {
        check_remote_id(remote_id)?;
        let account = self
            .identity_for_handle(credential, server)?
            .context("archive identity unavailable")?;
        let raw = sql_query(
            "SELECT cursor AS value FROM archive_cursor WHERE identity_id=? AND source=?",
        )
        .bind::<BigInt, _>(account)
        .bind::<diesel::sql_types::Text, _>(format!("analytics:{remote_id}"))
        .get_result::<OptionalTextRow>(&mut self.db)
        .optional()?
        .and_then(|row| row.value);
        Ok(raw.and_then(|raw| serde_json::from_str::<CatchUpCursor>(&raw).ok()))
    }

    pub fn save_analytics_cursor(
        &mut self,
        credential: &str,
        server: &str,
        remote_id: &str,
        cursor: Option<&CatchUpCursor>,
    ) -> Result<()> {
        check_remote_id(remote_id)?;
        if let Some(cursor) = cursor {
            check_remote_id(&cursor.max_id)?;
        }
        let account = self
            .identity_for_handle(credential, server)?
            .context("archive identity unavailable")?;
        let source = format!("analytics:{remote_id}");
        match cursor {
            Some(cursor) => {
                sql_query("INSERT INTO archive_cursor(identity_id,source,cursor,updated_at) VALUES(?,?,?,unixepoch()) ON CONFLICT(identity_id,source) DO UPDATE SET cursor=excluded.cursor,updated_at=excluded.updated_at")
                    .bind::<BigInt, _>(account)
                    .bind::<diesel::sql_types::Text, _>(&source)
                    .bind::<diesel::sql_types::Text, _>(serde_json::to_string(cursor)?)
                    .execute(&mut self.db)?;
            }
            None => {
                sql_query("DELETE FROM archive_cursor WHERE identity_id=? AND source=?")
                    .bind::<BigInt, _>(account)
                    .bind::<diesel::sql_types::Text, _>(&source)
                    .execute(&mut self.db)?;
            }
        }
        Ok(())
    }

    /// Cached boosters of a post, valid while its boost count is unchanged.
    pub fn cached_boosters(
        &mut self,
        credential: &str,
        server: &str,
        post_remote_id: &str,
    ) -> Result<BoosterCache> {
        check_remote_id(post_remote_id)?;
        let account = self
            .identity_for_handle(credential, server)?
            .context("archive identity unavailable")?;
        let post: Option<(i64, i64)> = archive_post::table
            .filter(archive_post::identity_id.eq(account))
            .filter(archive_post::remote_id.eq(post_remote_id))
            .select((archive_post::id, archive_post::reblogs_count))
            .first(&mut self.db)
            .optional()?;
        let Some((local_post, reblogs)) = post else {
            return Ok(BoosterCache {
                post_known: false,
                boosters: None,
            });
        };
        let fresh = sql_query(
            "SELECT reblogs_at_scan AS value FROM archive_post_booster_scan WHERE identity_id=? AND post_id=?",
        )
        .bind::<BigInt, _>(account)
        .bind::<BigInt, _>(local_post)
        .get_result::<ScanRow>(&mut self.db)
        .optional()?
        .is_some_and(|row| row.value == reblogs);
        if !fresh {
            return Ok(BoosterCache {
                post_known: true,
                boosters: None,
            });
        }
        let rows = sql_query(
            "SELECT a.profile_json AS value, b.followers_count AS followers FROM archive_post_booster b
             JOIN archive_actor a ON a.id=b.actor_id AND a.identity_id=b.identity_id
             WHERE b.identity_id=? AND b.post_id=? ORDER BY b.followers_count DESC",
        )
        .bind::<BigInt, _>(account)
        .bind::<BigInt, _>(local_post)
        .load::<BoosterRow>(&mut self.db)?;
        let boosters = rows
            .into_iter()
            .filter_map(|row| {
                let mut value: Value = serde_json::from_str(row.value.as_deref()?).ok()?;
                // The count when this booster was seen boosting, not a later profile read.
                value["followers_count"] = Value::from(row.followers);
                Some(value)
            })
            .collect();
        Ok(BoosterCache {
            post_known: true,
            boosters: Some(boosters),
        })
    }

    /// Replace a post's booster list with a fresh lookup.
    pub fn save_boosters(
        &mut self,
        credential: &str,
        server: &str,
        post_remote_id: &str,
        accounts: &[Value],
    ) -> Result<usize> {
        check_remote_id(post_remote_id)?;
        let account = self
            .identity_for_handle(credential, server)?
            .context("archive identity unavailable")?;
        self.db.transaction::<_, anyhow::Error, _>(|db| {
            let (local_post, reblogs): (i64, i64) = archive_post::table
                .filter(archive_post::identity_id.eq(account))
                .filter(archive_post::remote_id.eq(post_remote_id))
                .select((archive_post::id, archive_post::reblogs_count))
                .first(db)
                .context("post not in archive")?;
            sql_query("DELETE FROM archive_post_booster WHERE identity_id=? AND post_id=?")
                .bind::<BigInt, _>(account)
                .bind::<BigInt, _>(local_post)
                .execute(db)?;
            let mut saved = 0;
            for booster in accounts {
                let Some(actor) = Self::upsert_actor_json(db, account, booster)? else {
                    continue;
                };
                let followers = booster
                    .get("followers_count")
                    .and_then(Value::as_i64)
                    .unwrap_or(0)
                    .max(0);
                saved += sql_query("INSERT INTO archive_post_booster(identity_id,post_id,actor_id,followers_count) VALUES(?,?,?,?) ON CONFLICT(identity_id,post_id,actor_id) DO UPDATE SET followers_count=excluded.followers_count,observed_at=unixepoch()")
                    .bind::<BigInt, _>(account)
                    .bind::<BigInt, _>(local_post)
                    .bind::<BigInt, _>(actor)
                    .bind::<BigInt, _>(followers)
                    .execute(db)?;
            }
            sql_query("INSERT INTO archive_post_booster_scan(identity_id,post_id,reblogs_at_scan) VALUES(?,?,?) ON CONFLICT(identity_id,post_id) DO UPDATE SET reblogs_at_scan=excluded.reblogs_at_scan,scanned_at=unixepoch()")
                .bind::<BigInt, _>(account)
                .bind::<BigInt, _>(local_post)
                .bind::<BigInt, _>(reblogs)
                .execute(db)?;
            Ok(saved)
        })
    }

    fn upsert_actor_json(
        db: &mut SqliteConnection,
        account: i64,
        actor: &Value,
    ) -> Result<Option<i64>> {
        let Some(remote) = actor.get("id").and_then(Value::as_str) else {
            return Ok(None);
        };
        if check_remote_id(remote).is_err() {
            return Ok(None);
        }
        let acct = actor.get("acct").and_then(Value::as_str).unwrap_or(remote);
        let display = actor
            .get("display_name")
            .and_then(Value::as_str)
            .unwrap_or("");
        let snapshot = actor.to_string();
        diesel::insert_into(archive_actor::table)
            .values((
                archive_actor::identity_id.eq(account),
                archive_actor::remote_id.eq(remote),
                archive_actor::acct.eq(acct),
                archive_actor::display_name.eq(display),
                archive_actor::profile_json.eq(&snapshot),
            ))
            .on_conflict((archive_actor::identity_id, archive_actor::remote_id))
            .do_update()
            .set((
                archive_actor::acct.eq(acct),
                archive_actor::display_name.eq(display),
                archive_actor::profile_json.eq(&snapshot),
            ))
            .execute(db)?;
        Ok(Some(
            archive_actor::table
                .filter(archive_actor::identity_id.eq(account))
                .filter(archive_actor::remote_id.eq(remote))
                .select(archive_actor::id)
                .first(db)?,
        ))
    }

    /// Today's follower count for the identity's own account (one row a day;
    /// the latest reading of the day wins).
    fn snapshot_followers(db: &mut SqliteConnection, account: i64, own: &Value) -> Result<()> {
        let count = |name: &str| own.get(name).and_then(Value::as_i64);
        let Some(followers) = count("followers_count") else {
            return Ok(());
        };
        sql_query("INSERT INTO archive_follower_snapshot(identity_id,observed_day,followers,following,statuses) VALUES(?,date('now'),?,?,?) ON CONFLICT(identity_id,observed_day) DO UPDATE SET followers=excluded.followers,following=excluded.following,statuses=excluded.statuses")
            .bind::<BigInt, _>(account)
            .bind::<BigInt, _>(followers.max(0))
            .bind::<BigInt, _>(count("following_count").unwrap_or(0).max(0))
            .bind::<BigInt, _>(count("statuses_count").unwrap_or(0).max(0))
            .execute(db)?;
        Ok(())
    }

    /// The signed-in account's audience over time: daily follower counts and
    /// new-follower notifications per month.
    pub fn analytics_history(&mut self, credential: &str, server: &str) -> Result<AudienceHistory> {
        let account = self
            .identity_for_handle(credential, server)?
            .context("archive identity unavailable")?;
        let followers = sql_query(
            "SELECT observed_day AS day, followers, following FROM archive_follower_snapshot
             WHERE identity_id=? ORDER BY observed_day",
        )
        .bind::<BigInt, _>(account)
        .load::<FollowerPoint>(&mut self.db)?;
        let follows_by_month = sql_query(
            "SELECT substr(occurred_at,1,7) AS month, COUNT(*) AS count FROM archive_interaction
             WHERE identity_id=? AND kind='follow' GROUP BY month ORDER BY month",
        )
        .bind::<BigInt, _>(account)
        .load::<MonthCount>(&mut self.db)?;
        let notification_history_complete = self
            .notification_cursor(credential, server)?
            .is_some_and(|cursor| cursor.is_none());
        Ok(AudienceHistory {
            followers,
            follows_by_month,
            notification_history_complete,
        })
    }

    /// Who reacted to the signed-in account (favourites, boosts, quotes and
    /// mentions/replies) over the last `days` days, counted per person, kind
    /// and month. Handles are qualified with the home server's host.
    pub fn engagers(
        &mut self,
        credential: &str,
        server: &str,
        days: i64,
    ) -> Result<Vec<EngagerRow>> {
        let cutoff = self.recount_cutoff(days)?;
        let account = self
            .identity_for_handle(credential, server)?
            .context("archive identity unavailable")?;
        let host = url::Url::parse(server)
            .ok()
            .and_then(|url| url.host_str().map(str::to_owned))
            .unwrap_or_default();
        let mut rows = sql_query(
            "SELECT a.remote_id AS actor, a.acct AS acct, a.display_name AS display_name,
                    i.kind AS kind, substr(i.occurred_at,1,7) AS month, COUNT(*) AS count
             FROM archive_interaction i
             JOIN archive_actor a ON a.id=i.actor_id AND a.identity_id=i.identity_id
             WHERE i.identity_id=? AND i.kind IN ('favourite','reblog','quote','mention')
               AND i.occurred_at>=?
             GROUP BY a.id, i.kind, month ORDER BY month",
        )
        .bind::<BigInt, _>(account)
        .bind::<diesel::sql_types::Text, _>(cutoff)
        .load::<EngagerRow>(&mut self.db)?;
        for row in &mut rows {
            if !row.acct.contains('@') && !host.is_empty() {
                row.acct = format!("{}@{host}", row.acct);
            }
        }
        Ok(rows)
    }

    /// Timed likes, boosts, mentions and follows from the last `days` days,
    /// newest first, only where the archive has no gap: between where the
    /// backfill has reached and the newest joined notification.
    pub fn timed_reactions(
        &mut self,
        credential: &str,
        server: &str,
        days: i64,
    ) -> Result<TimedReactions> {
        let cutoff = self.recount_cutoff(days)?;
        let account = self
            .identity_for_handle(credential, server)?
            .context("archive identity unavailable")?;
        let Some(mark) = self.notification_mark(credential, server)? else {
            return Ok(TimedReactions::default());
        };
        // No saved history cursor means the backfill has not started.
        let Some(history) = self.notification_cursor(credential, server)? else {
            return Ok(TimedReactions::default());
        };
        // A cursor is "everything older than this is unread"; none is complete.
        let floor = history.as_deref().unwrap_or("0");
        let mut covered_since = cutoff.clone();
        if history.is_some() {
            let oldest = sql_query(
                "SELECT MIN(occurred_at) AS value FROM archive_interaction
                 WHERE identity_id=? AND CAST(remote_id AS INTEGER)>=CAST(? AS INTEGER)
                   AND CAST(remote_id AS INTEGER)<=CAST(? AS INTEGER)",
            )
            .bind::<BigInt, _>(account)
            .bind::<diesel::sql_types::Text, _>(floor)
            .bind::<diesel::sql_types::Text, _>(&mark)
            .get_result::<OptionalTextRow>(&mut self.db)?
            .value;
            match oldest {
                Some(oldest) if oldest > covered_since => covered_since = oldest,
                Some(_) => {}
                None => return Ok(TimedReactions::default()),
            }
        }
        let mut events = sql_query(
            "SELECT i.remote_id AS id, i.kind AS kind, i.occurred_at AS at,
                    a.remote_id AS actor, i.status_remote_id AS post
             FROM archive_interaction i
             JOIN archive_actor a ON a.id=i.actor_id AND a.identity_id=i.identity_id
             WHERE i.identity_id=? AND i.kind IN ('favourite','reblog','mention','follow')
               AND i.occurred_at>=?
               AND CAST(i.remote_id AS INTEGER)>=CAST(? AS INTEGER)
               AND CAST(i.remote_id AS INTEGER)<=CAST(? AS INTEGER)
             ORDER BY CAST(i.remote_id AS INTEGER) DESC LIMIT ?",
        )
        .bind::<BigInt, _>(account)
        .bind::<diesel::sql_types::Text, _>(&covered_since)
        .bind::<diesel::sql_types::Text, _>(floor)
        .bind::<diesel::sql_types::Text, _>(&mark)
        .bind::<BigInt, _>(MAX_TIMED_EVENTS as i64 + 1)
        .load::<TimedEvent>(&mut self.db)?;
        if events.len() > MAX_TIMED_EVENTS {
            events.truncate(MAX_TIMED_EVENTS);
            if let Some(last) = events.last() {
                covered_since = last.at.clone();
            }
        }
        let people = self.json_rows(
            "SELECT remote_id AS id, profile_json AS json FROM archive_actor
             WHERE identity_id=? AND remote_id IN (SELECT value FROM json_each(?))",
            account,
            events.iter().map(|event| event.actor.as_str()),
            PERSON_FIELDS,
        )?;
        let posts = self.json_rows(
            "SELECT remote_id AS id, raw_json AS json FROM archive_post
             WHERE identity_id=? AND remote_id IN (SELECT value FROM json_each(?))",
            account,
            events.iter().filter_map(|event| event.post.as_deref()),
            POST_FIELDS,
        )?;
        Ok(TimedReactions {
            connected: true,
            covered_since: Some(covered_since),
            events,
            people,
            posts,
        })
    }

    fn json_rows<'a>(
        &mut self,
        sql: &str,
        account: i64,
        ids: impl Iterator<Item = &'a str>,
        fields: &[&str],
    ) -> Result<serde_json::Map<String, Value>> {
        let unique: std::collections::BTreeSet<&str> = ids.collect();
        Ok(sql_query(sql)
            .bind::<BigInt, _>(account)
            .bind::<diesel::sql_types::Text, _>(serde_json::to_string(&unique)?)
            .load::<JsonRow>(&mut self.db)?
            .into_iter()
            .map(|row| {
                let value = pick(row.json.as_deref(), &row.id, fields);
                (row.id, value)
            })
            .collect())
    }

    /// When a post's engagement arrived: count snapshots plus the boost,
    /// favourite and quote notifications that name it.
    pub fn post_activity(
        &mut self,
        credential: &str,
        server: &str,
        post_remote_id: &str,
    ) -> Result<PostActivity> {
        check_remote_id(post_remote_id)?;
        let account = self
            .identity_for_handle(credential, server)?
            .context("archive identity unavailable")?;
        let snapshots = sql_query(
            "SELECT s.observed_at, s.replies, s.reblogs, s.favourites, s.quotes
             FROM archive_post_count_snapshot s JOIN archive_post p ON p.id=s.post_id AND p.identity_id=s.identity_id
             WHERE s.identity_id=? AND p.remote_id=? ORDER BY s.observed_at",
        )
        .bind::<BigInt, _>(account)
        .bind::<diesel::sql_types::Text, _>(post_remote_id)
        .load::<CountPoint>(&mut self.db)?;
        let events = sql_query(
            "SELECT kind, occurred_at FROM archive_interaction
             WHERE identity_id=? AND status_remote_id=? AND kind IN ('reblog','favourite','quote')
             ORDER BY occurred_at",
        )
        .bind::<BigInt, _>(account)
        .bind::<diesel::sql_types::Text, _>(post_remote_id)
        .load::<ActivityEvent>(&mut self.db)?;
        Ok(PostActivity { snapshots, events })
    }

    fn identity_for_handle(&mut self, credential: &str, server: &str) -> Result<Option<i64>> {
        let account: Option<i64> = archive_credential::table
            .filter(archive_credential::handle.eq(credential))
            .select(archive_credential::identity_id)
            .first(&mut self.db)
            .optional()?;
        let Some(account) = account else {
            return Ok(None);
        };
        Ok(archive_identity::table
            .filter(archive_identity::id.eq(account))
            .filter(archive_identity::provider.eq("mastodon"))
            .filter(archive_identity::origin.eq(server))
            .select(archive_identity::id)
            .first(&mut self.db)
            .optional()?)
    }

    /// Remove one identity's copy of a post its owner deleted on the server.
    pub fn forget_post(
        &mut self,
        credential: &str,
        server: &str,
        remote_id: &str,
    ) -> Result<usize> {
        let Some(account) = self.identity_for_handle(credential, server)? else {
            return Ok(0);
        };
        Ok(diesel::delete(
            archive_post::table
                .filter(archive_post::identity_id.eq(account))
                .filter(archive_post::remote_id.eq(remote_id)),
        )
        .execute(&mut self.db)?)
    }

    /// Save provider responses already fetched for ordinary reading. No network
    /// request is caused by ingestion. Invalid or unsupported responses are skipped.
    pub fn observe(
        &mut self,
        credential: &str,
        server: &str,
        source: &str,
        body: &str,
    ) -> Result<usize> {
        let value: Value = serde_json::from_str(body)?;
        if source == "verify" {
            if let Some(id) = value.get("id").and_then(Value::as_str) {
                if !id.is_empty() && id.bytes().all(|byte| byte.is_ascii_digit()) {
                    let account = self.identity("mastodon", server, id)?;
                    self.bind_handle(account, credential)?;
                    Self::snapshot_followers(&mut self.db, account, &value)?;
                }
            }
            return Ok(0);
        }
        let Some(account) = self.identity_for_handle(credential, server)? else {
            return Ok(0);
        };
        if source == "relationships" {
            return self.observe_relationships(account, &value);
        }
        if source == "notifications" {
            return self.observe_notifications(account, &value);
        }
        let statuses: Vec<&Value> = match source {
            "home" | "profile" => value
                .as_array()
                .map(|rows| rows.iter().collect())
                .unwrap_or_default(),
            "status" => vec![&value],
            _ => return Ok(0),
        };
        self.db.transaction::<_, anyhow::Error, _>(|db| {
            let mut saved = 0;
            for wrapper in statuses {
                if Self::save_status(db, account, source, wrapper)? {
                    saved += 1;
                }
                if let Some(target) = wrapper.get("reblog").filter(|item| item.is_object()) {
                    if Self::save_status(db, account, source, target)? {
                        saved += 1;
                    }
                }
            }
            Ok(saved)
        })
    }

    fn observe_relationships(&mut self, account: i64, value: &Value) -> Result<usize> {
        let Some(rows) = value.as_array() else {
            return Ok(0);
        };
        self.db.transaction::<_, anyhow::Error, _>(|db| {
            let mut saved = 0;
            for row in rows {
                let Some(remote) = row.get("id").and_then(Value::as_str) else {
                    continue;
                };
                let Some(followed_by) = row.get("followed_by").and_then(Value::as_bool) else {
                    continue;
                };
                let Some(actor_id) = archive_actor::table
                    .filter(archive_actor::identity_id.eq(account))
                    .filter(archive_actor::remote_id.eq(remote))
                    .select(archive_actor::id)
                    .first::<i64>(db)
                    .optional()?
                else {
                    continue;
                };
                diesel::insert_into(archive_relationship::table)
                    .values((
                        archive_relationship::identity_id.eq(account),
                        archive_relationship::actor_id.eq(actor_id),
                        archive_relationship::followed_by.eq(followed_by),
                    ))
                    .on_conflict((
                        archive_relationship::identity_id,
                        archive_relationship::actor_id,
                    ))
                    .do_update()
                    .set((
                        archive_relationship::followed_by.eq(followed_by),
                        archive_relationship::observed_at
                            .eq(diesel::dsl::sql::<BigInt>("unixepoch()")),
                    ))
                    .execute(db)?;
                saved += 1;
            }
            Ok(saved)
        })
    }

    fn observe_notifications(&mut self, account: i64, value: &Value) -> Result<usize> {
        let Some(rows) = value.as_array() else {
            return Ok(0);
        };
        self.db.transaction::<_, anyhow::Error, _>(|db| {
            let mut saved = 0;
            for row in rows {
                let Some(remote) = row.get("id").and_then(Value::as_str) else { continue };
                let Some(kind) = row.get("type").and_then(Value::as_str) else { continue };
                let Some(occurred) = row.get("created_at").and_then(Value::as_str) else { continue };
                if !matches!(kind, "mention" | "favourite" | "reblog" | "status" | "quote" | "follow") {
                    continue;
                }
                let Some(author) = row.get("account") else { continue };
                let Some(author_remote) = author.get("id").and_then(Value::as_str) else { continue };
                if !author_remote.bytes().all(|b| b.is_ascii_digit()) || author_remote.len() > 64 {
                    continue;
                }
                let acct = author.get("acct").and_then(Value::as_str).unwrap_or(author_remote);
                let display = author.get("display_name").and_then(Value::as_str).unwrap_or("");
                let snapshot = author.to_string();
                diesel::insert_into(archive_actor::table)
                    .values((
                        archive_actor::identity_id.eq(account),
                        archive_actor::remote_id.eq(author_remote),
                        archive_actor::acct.eq(acct),
                        archive_actor::display_name.eq(display),
                        archive_actor::profile_json.eq(&snapshot),
                    ))
                    .on_conflict((archive_actor::identity_id, archive_actor::remote_id))
                    .do_update()
                    .set((
                        archive_actor::acct.eq(acct),
                        archive_actor::display_name.eq(display),
                        archive_actor::profile_json.eq(&snapshot),
                    ))
                    .execute(db)?;
                let actor_id: i64 = archive_actor::table
                    .filter(archive_actor::identity_id.eq(account))
                    .filter(archive_actor::remote_id.eq(author_remote))
                    .select(archive_actor::id)
                    .first(db)?;
                let status_remote = row
                    .get("status")
                    .and_then(|status| status.get("id"))
                    .and_then(Value::as_str)
                    .filter(|id| check_remote_id(id).is_ok());
                // A re-read notification fills in the post link it was saved without.
                saved += sql_query("INSERT INTO archive_interaction(identity_id,actor_id,remote_id,kind,occurred_at,status_remote_id) VALUES(?,?,?,?,?,?) ON CONFLICT(identity_id,remote_id,kind) DO UPDATE SET status_remote_id=COALESCE(archive_interaction.status_remote_id,excluded.status_remote_id) WHERE archive_interaction.status_remote_id IS NULL AND excluded.status_remote_id IS NOT NULL")
                    .bind::<BigInt, _>(account)
                    .bind::<BigInt, _>(actor_id)
                    .bind::<diesel::sql_types::Text, _>(remote)
                    .bind::<diesel::sql_types::Text, _>(kind)
                    .bind::<diesel::sql_types::Text, _>(occurred)
                    .bind::<diesel::sql_types::Nullable<diesel::sql_types::Text>, _>(status_remote)
                    .execute(db)?;
                if let Some(status) = row.get("status") {
                    Self::save_status(db, account, "notification", status)?;
                }
            }
            Ok(saved)
        })
    }

    fn save_status(
        db: &mut SqliteConnection,
        account: i64,
        source_name: &str,
        status: &Value,
    ) -> Result<bool> {
        let field = |name: &str| status.get(name).and_then(Value::as_str);
        let Some(remote) = field("id").filter(|id| !id.is_empty() && id.len() <= 64) else {
            return Ok(false);
        };
        let Some(created) = field("created_at") else {
            return Ok(false);
        };
        let Some(author) = status.get("account") else {
            return Ok(false);
        };
        let Some(author_remote) = author.get("id").and_then(Value::as_str) else {
            return Ok(false);
        };
        let acct_value = author.get("acct").and_then(Value::as_str).unwrap_or("");
        let display = author
            .get("display_name")
            .and_then(Value::as_str)
            .unwrap_or("");
        let author_json = author.to_string();
        diesel::insert_into(archive_actor::table)
            .values((
                archive_actor::identity_id.eq(account),
                archive_actor::remote_id.eq(author_remote),
                archive_actor::acct.eq(acct_value),
                archive_actor::display_name.eq(display),
                archive_actor::profile_json.eq(&author_json),
            ))
            .on_conflict((archive_actor::identity_id, archive_actor::remote_id))
            .do_update()
            .set((
                archive_actor::acct.eq(acct_value),
                archive_actor::display_name.eq(display),
                archive_actor::profile_json.eq(&author_json),
            ))
            .execute(db)?;
        let actor: i64 = archive_actor::table
            .filter(archive_actor::identity_id.eq(account))
            .filter(archive_actor::remote_id.eq(author_remote))
            .select(archive_actor::id)
            .first(db)?;
        sql_query("UPDATE archive_actor SET last_status_at=CASE WHEN last_status_at IS NULL OR last_status_at<? THEN ? ELSE last_status_at END WHERE id=? AND identity_id=?")
            .bind::<diesel::sql_types::Text,_>(created)
            .bind::<diesel::sql_types::Text,_>(created)
            .bind::<BigInt,_>(actor)
            .bind::<BigInt,_>(account)
            .execute(db)?;
        let content_value = field("content").unwrap_or("");
        let visibility_value = field("visibility").unwrap_or("public");
        let media = status.get("media_attachments").map(Value::to_string);
        let tags = status.get("tags").map(Value::to_string);
        let raw = status.to_string();
        let post = NewPost {
            identity_id: account,
            remote_id: remote,
            actor_id: actor,
            created_at: created,
            visibility: visibility_value,
            content: content_value,
            spoiler_text: field("spoiler_text"),
            in_reply_to_remote_id: field("in_reply_to_id"),
            reblog_of_remote_id: status
                .get("reblog")
                .and_then(|v| v.get("id"))
                .and_then(Value::as_str),
            media_json: media.as_deref(),
            tags_json: tags.as_deref(),
            raw_json: Some(&raw),
            replies_count: status
                .get("replies_count")
                .and_then(Value::as_i64)
                .unwrap_or(0),
            reblogs_count: status
                .get("reblogs_count")
                .and_then(Value::as_i64)
                .unwrap_or(0),
            favourites_count: status
                .get("favourites_count")
                .and_then(Value::as_i64)
                .unwrap_or(0),
        };
        let previous_counts: Option<(i64, i64, i64)> = archive_post::table
            .filter(archive_post::identity_id.eq(account))
            .filter(archive_post::remote_id.eq(remote))
            .select((
                archive_post::replies_count,
                archive_post::reblogs_count,
                archive_post::favourites_count,
            ))
            .first(db)
            .optional()?;
        diesel::insert_into(archive_post::table)
            .values(&post)
            .on_conflict((archive_post::identity_id, archive_post::remote_id))
            .do_update()
            .set((
                archive_post::actor_id.eq(actor),
                archive_post::content.eq(content_value),
                archive_post::visibility.eq(visibility_value),
                archive_post::spoiler_text.eq(post.spoiler_text),
                archive_post::in_reply_to_remote_id.eq(post.in_reply_to_remote_id),
                archive_post::reblog_of_remote_id.eq(post.reblog_of_remote_id),
                archive_post::raw_json.eq(&raw),
                archive_post::media_json.eq(media.as_deref()),
                archive_post::tags_json.eq(tags.as_deref()),
                archive_post::replies_count.eq(post.replies_count),
                archive_post::reblogs_count.eq(post.reblogs_count),
                archive_post::favourites_count.eq(post.favourites_count),
            ))
            .execute(db)?;
        let local_post: i64 = archive_post::table
            .filter(archive_post::identity_id.eq(account))
            .filter(archive_post::remote_id.eq(remote))
            .select(archive_post::id)
            .first(db)?;
        let counts = (
            post.replies_count,
            post.reblogs_count,
            post.favourites_count,
        );
        if previous_counts != Some(counts) {
            Self::snapshot_own_counts(db, account, local_post, author_remote, counts, status)?;
        }
        diesel::insert_into(archive_post_source::table)
            .values((
                archive_post_source::identity_id.eq(account),
                archive_post_source::post_id.eq(local_post),
                archive_post_source::source.eq(source_name),
            ))
            .on_conflict((
                archive_post_source::identity_id,
                archive_post_source::post_id,
                archive_post_source::source,
            ))
            .do_nothing()
            .execute(db)?;
        Ok(true)
    }
    pub fn open(path: &Path) -> Result<Self> {
        let had_archive = path.exists() && path.metadata()?.len() > 0;
        let url = path.to_str().context("archive path is not UTF-8")?;
        let mut db = SqliteConnection::establish(url).context("opening archive")?;
        db.batch_execute("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;")?;
        if db
            .has_pending_migration(MIGRATIONS)
            .map_err(|_| anyhow::anyhow!("checking archive migrations failed"))?
        {
            drop(db);
            if had_archive {
                backup_before_migration(path).context("backing up archive")?;
            }
            normalize_legacy(path).context("preparing older archive")?;
            db = SqliteConnection::establish(url)?;
            db.batch_execute("PRAGMA busy_timeout=5000;")?;
            db.run_pending_migrations(MIGRATIONS)
                .map_err(|_| anyhow::anyhow!("archive migration failed"))?;
            if path != Path::new(":memory:") {
                verify_file(path).context("checking upgraded archive")?;
            }
        }
        db.batch_execute("PRAGMA foreign_keys=ON;")?;
        Ok(Self { db })
    }

    pub fn identity(&mut self, provider_name: &str, server: &str, account_id: &str) -> Result<i64> {
        use self::archive_identity::dsl::{id, origin, provider, remote_id};
        diesel::insert_into(archive_identity::table)
            .values((
                provider.eq(provider_name),
                origin.eq(server),
                remote_id.eq(account_id),
            ))
            .on_conflict((provider, origin, remote_id))
            .do_nothing()
            .execute(&mut self.db)?;
        Ok(archive_identity::table
            .filter(provider.eq(provider_name))
            .filter(origin.eq(server))
            .filter(remote_id.eq(account_id))
            .select(id)
            .first(&mut self.db)?)
    }

    pub fn bind_handle(&mut self, account: i64, credential: &str) -> Result<()> {
        use self::archive_credential::dsl::{handle, identity_id};
        diesel::insert_into(archive_credential::table)
            .values((identity_id.eq(account), handle.eq(credential)))
            .on_conflict(handle)
            .do_update()
            .set(identity_id.eq(account))
            .execute(&mut self.db)?;
        Ok(())
    }

    pub fn follow_status(
        &mut self,
        server: &str,
        credential: &str,
    ) -> Result<Option<FollowStatus>> {
        let account: Option<i64> = archive_credential::table
            .filter(archive_credential::handle.eq(credential))
            .select(archive_credential::identity_id)
            .first(&mut self.db)
            .optional()?;
        let Some(account) = account else {
            return Ok(None);
        };
        let valid = archive_identity::table
            .filter(archive_identity::id.eq(account))
            .filter(archive_identity::provider.eq("mastodon"))
            .filter(archive_identity::origin.eq(server))
            .select(archive_identity::id)
            .first::<i64>(&mut self.db)
            .optional()?
            .is_some();
        if !valid {
            return Ok(None);
        }
        let scan: Option<(i64, bool, i64)> = archive_follow_scan::table
            .filter(archive_follow_scan::identity_id.eq(account))
            .select((
                archive_follow_scan::generation,
                archive_follow_scan::complete,
                archive_follow_scan::updated_at,
            ))
            .first(&mut self.db)
            .optional()?;
        let (following, known_zombies, unknown_activity) = self.follow_counts(account)?;
        let (generation, complete, updated_at) = scan.unwrap_or((0, false, 0));
        Ok(Some(FollowStatus {
            following,
            known_zombies,
            unknown_activity,
            generation,
            complete,
            updated_at,
        }))
    }

    /// An interrupted generation resumes from its durable page cursor.
    pub fn follow_scan(&mut self, account: i64) -> Result<(i64, Option<String>)> {
        use self::archive_follow_scan::dsl::{
            complete, generation, identity_id, next_cursor, updated_at,
        };
        diesel::insert_into(archive_follow_scan::table)
            .values((
                identity_id.eq(account),
                generation.eq(1),
                complete.eq(false),
            ))
            .on_conflict(identity_id)
            .do_nothing()
            .execute(&mut self.db)?;
        let (current, cursor, done): (i64, Option<String>, bool) = archive_follow_scan::table
            .filter(identity_id.eq(account))
            .select((generation, next_cursor, complete))
            .first(&mut self.db)?;
        if !done {
            return Ok((current, cursor));
        }
        diesel::update(archive_follow_scan::table.filter(identity_id.eq(account)))
            .set((
                generation.eq(current + 1),
                next_cursor.eq::<Option<String>>(None),
                complete.eq(false),
                updated_at.eq(diesel::dsl::sql::<BigInt>("unixepoch()")),
            ))
            .execute(&mut self.db)?;
        Ok((current + 1, None))
    }

    pub fn save_follow_page(
        &mut self,
        account: i64,
        current: i64,
        _origin: &str,
        actors: &[FollowedActor],
        cursor: Option<&str>,
    ) -> Result<()> {
        self.db.transaction::<_, anyhow::Error, _>(|db| {
            let active: Option<i64> = archive_follow_scan::table
                .filter(archive_follow_scan::identity_id.eq(account))
                .filter(archive_follow_scan::complete.eq(false))
                .select(archive_follow_scan::generation)
                .first(db)
                .optional()?;
            if active != Some(current) {
                bail!("following generation changed");
            }
            for actor in actors {
                use self::archive_actor::dsl::{
                    acct, display_name, id, identity_id, last_status_at, remote_id,
                };
                diesel::insert_into(archive_actor::table)
                    .values((
                        identity_id.eq(account),
                        remote_id.eq(&actor.remote_id),
                        acct.eq(&actor.acct),
                        display_name.eq(&actor.display_name),
                        last_status_at.eq(&actor.last_status_at),
                    ))
                    .on_conflict((identity_id, remote_id))
                    .do_update()
                    .set((acct.eq(&actor.acct), display_name.eq(&actor.display_name)))
                    .execute(db)?;
                if let Some(time) = &actor.last_status_at {
                    diesel::update(
                        archive_actor::table
                            .filter(identity_id.eq(account))
                            .filter(remote_id.eq(&actor.remote_id)),
                    )
                    .set(last_status_at.eq(time))
                    .execute(db)?;
                }
                let actor_id: i64 = archive_actor::table
                    .filter(identity_id.eq(account))
                    .filter(remote_id.eq(&actor.remote_id))
                    .select(id)
                    .first(db)?;
                if let Some(snapshot) = &actor.profile_json {
                    diesel::update(archive_actor::table.filter(id.eq(actor_id)))
                        .set(archive_actor::profile_json.eq(snapshot))
                        .execute(db)?;
                }
                diesel::insert_into(archive_follow::table)
                    .values((
                        archive_follow::identity_id.eq(account),
                        archive_follow::actor_id.eq(actor_id),
                        archive_follow::seen_generation.eq(current),
                    ))
                    .on_conflict((archive_follow::identity_id, archive_follow::actor_id))
                    .do_update()
                    .set(archive_follow::seen_generation.eq(current))
                    .execute(db)?;
            }
            diesel::update(
                archive_follow_scan::table
                    .filter(archive_follow_scan::identity_id.eq(account))
                    .filter(archive_follow_scan::generation.eq(current)),
            )
            .set((
                archive_follow_scan::next_cursor.eq(cursor),
                archive_follow_scan::complete.eq(cursor.is_none()),
                archive_follow_scan::updated_at.eq(diesel::dsl::sql::<BigInt>("unixepoch()")),
            ))
            .execute(db)?;
            if cursor.is_none() {
                diesel::delete(
                    archive_follow::table
                        .filter(archive_follow::identity_id.eq(account))
                        .filter(archive_follow::seen_generation.ne(current)),
                )
                .execute(db)?;
            }
            Ok(())
        })
    }

    pub fn follow_counts(&mut self, account: i64) -> Result<(i64, i64, i64)> {
        let row: FollowCounts = sql_query(
            "SELECT COUNT(*) AS following,
             COALESCE(SUM(CASE WHEN a.last_status_at IS NOT NULL AND
               unixepoch(a.last_status_at) < unixepoch('now', '-90 days') THEN 1 ELSE 0 END), 0) AS known_zombies,
             COALESCE(SUM(CASE WHEN a.last_status_at IS NULL OR unixepoch(a.last_status_at) IS NULL THEN 1 ELSE 0 END), 0) AS unknown_activity
             FROM archive_follow f JOIN archive_actor a
               ON a.id=f.actor_id AND a.identity_id=f.identity_id
             WHERE f.identity_id=?"
        ).bind::<BigInt,_>(account).get_result(&mut self.db)?;
        Ok((row.following, row.known_zombies, row.unknown_activity))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn viewport_read_batch_is_atomic_and_identity_owned() {
        let mut archive = Archive::open(Path::new(":memory:")).unwrap();
        let origin = "https://example.com";
        for (handle, me, remote) in [
            ("native-mastodon:a", "1", "100"),
            ("native-mastodon:b", "2", "200"),
        ] {
            archive
                .observe(handle, origin, "verify", &format!(r#"{{"id":"{me}"}}"#))
                .unwrap();
            let status = serde_json::json!([{"id":remote,"created_at":"2026-01-01T00:00:00Z","content":"post","visibility":"public","account":{"id":"55","acct":"friend"}}]);
            archive
                .observe(handle, origin, "home", &status.to_string())
                .unwrap();
        }
        let ids: Vec<i64> = archive_post::table
            .order(archive_post::id.asc())
            .select(archive_post::id)
            .load(&mut archive.db)
            .unwrap();
        assert_eq!(ids.len(), 2);
        assert!(archive
            .mark_read_batch("native-mastodon:a", origin, &ids)
            .is_err());
        assert_eq!(
            archive_read::table
                .count()
                .get_result::<i64>(&mut archive.db)
                .unwrap(),
            0
        );
        archive
            .mark_read_batch("native-mastodon:a", origin, &ids[..1])
            .unwrap();
        archive
            .mark_read_batch("native-mastodon:a", origin, &ids[..1])
            .unwrap();
        assert_eq!(
            archive_read::table
                .count()
                .get_result::<i64>(&mut archive.db)
                .unwrap(),
            1
        );
    }

    #[test]
    fn a_deleted_post_leaves_only_its_owners_archive() {
        let mut archive = Archive::open(Path::new(":memory:")).unwrap();
        let origin = "https://example.com";
        for (handle, me) in [("native-mastodon:a", "1"), ("native-mastodon:b", "2")] {
            archive
                .observe(handle, origin, "verify", &format!(r#"{{"id":"{me}"}}"#))
                .unwrap();
            let status = serde_json::json!([{"id":"100","created_at":"2026-01-01T00:00:00Z","content":"post","visibility":"public","account":{"id":"1","acct":"me"}}]);
            archive
                .observe(handle, origin, "profile", &status.to_string())
                .unwrap();
        }
        let first = archive_post::table
            .order(archive_post::id.asc())
            .select(archive_post::id)
            .first::<i64>(&mut archive.db)
            .unwrap();
        archive
            .mark_read("native-mastodon:a", origin, first)
            .unwrap();
        assert_eq!(
            archive
                .forget_post("native-mastodon:a", origin, "100")
                .unwrap(),
            1
        );
        assert!(archive
            .account_posts("native-mastodon:a", origin, "1", 0)
            .unwrap()
            .is_empty());
        assert_eq!(
            archive
                .account_posts("native-mastodon:b", origin, "1", 0)
                .unwrap()
                .len(),
            1
        );
    }

    #[test]
    fn profile_keyset_pages_past_read_changes_and_equal_timestamps() {
        let mut archive = Archive::open(Path::new(":memory:")).unwrap();
        let origin = "https://example.com";
        let handle = "native-mastodon:a";
        archive
            .observe(handle, origin, "verify", r#"{"id":"1"}"#)
            .unwrap();
        let statuses: Vec<Value> = (1..=85)
            .map(|id| {
                serde_json::json!({
                    "id": id.to_string(), "created_at": "2026-01-01T00:00:00Z",
                    "content": "post", "visibility": "public",
                    "account": {"id":"55", "acct":"friend"}
                })
            })
            .collect();
        archive
            .observe(handle, origin, "home", &Value::Array(statuses).to_string())
            .unwrap();
        let actor_id = archive_actor::table
            .filter(archive_actor::remote_id.eq("55"))
            .select(archive_actor::id)
            .first::<i64>(&mut archive.db)
            .unwrap();
        let mut cursor: Option<ProfileCursor> = None;
        let mut ids = Vec::new();
        for expected in [40, 40, 5] {
            let page = archive
                .profile_posts_after(
                    handle,
                    origin,
                    actor_id,
                    "all",
                    false,
                    cursor.as_ref().map(|c| (c.created_at.as_str(), c.local_id)),
                )
                .unwrap();
            assert_eq!(page.posts.len(), expected);
            ids.extend(page.posts.iter().map(|post| post.local_id));
            cursor = page.next;
        }
        assert!(cursor.is_none());
        ids.sort_unstable();
        ids.dedup();
        assert_eq!(ids.len(), 85);
        let newest = archive
            .profile_posts_after(handle, origin, actor_id, "all", false, None)
            .unwrap();
        archive
            .mark_read_batch(
                handle,
                origin,
                &newest
                    .posts
                    .iter()
                    .map(|post| post.local_id)
                    .collect::<Vec<_>>(),
            )
            .unwrap();
        let unread = archive
            .profile_posts_after(handle, origin, actor_id, "all", true, None)
            .unwrap();
        assert_eq!(unread.posts.len(), 40);
        assert!(unread.posts.iter().all(|post| !newest
            .posts
            .iter()
            .any(|read| read.local_id == post.local_id)));
    }

    #[test]
    fn recent_seed_skips_old_and_unknown_profiles_and_keeps_identity_counts() {
        let mut archive = Archive::open(Path::new(":memory:")).unwrap();
        let origin = "https://example.com";
        let active_date =
            sql_query("SELECT strftime('%Y-%m-%dT%H:%M:%SZ','now','-1 day') AS value")
                .get_result::<TextRow>(&mut archive.db)
                .unwrap()
                .value;
        archive
            .observe("native-mastodon:a", origin, "verify", r#"{"id":"1"}"#)
            .unwrap();
        archive
            .observe("native-mastodon:b", origin, "verify", r#"{"id":"2"}"#)
            .unwrap();
        let account = archive
            .identity_for_handle("native-mastodon:a", origin)
            .unwrap()
            .unwrap();
        let (generation, _) = archive.follow_scan(account).unwrap();
        archive
            .save_follow_page(
                account,
                generation,
                origin,
                &[
                    FollowedActor {
                        remote_id: "10".into(),
                        acct: "active".into(),
                        display_name: "Active".into(),
                        last_status_at: Some(active_date),
                        profile_json: None,
                    },
                    FollowedActor {
                        remote_id: "11".into(),
                        acct: "old".into(),
                        display_name: "Old".into(),
                        last_status_at: Some("2020-01-01T00:00:00Z".into()),
                        profile_json: None,
                    },
                    FollowedActor {
                        remote_id: "12".into(),
                        acct: "unknown".into(),
                        display_name: "Unknown".into(),
                        last_status_at: None,
                        profile_json: None,
                    },
                ],
                None,
            )
            .unwrap();
        let candidate = archive
            .next_seed_candidate("native-mastodon:a", origin)
            .unwrap()
            .unwrap();
        assert_eq!(candidate.remote_id, "10");
        archive
            .record_collector_request("native-mastodon:a", origin, "recent_seed")
            .unwrap();
        archive
            .finish_seed_page("native-mastodon:a", origin, candidate.actor_id, 2)
            .unwrap();
        assert!(archive
            .next_seed_candidate("native-mastodon:a", origin)
            .unwrap()
            .is_none());
        let a = archive
            .collection_status("native-mastodon:a", origin)
            .unwrap();
        let b = archive
            .collection_status("native-mastodon:b", origin)
            .unwrap();
        assert_eq!(a.seed_eligible, 0);
        assert_eq!((a.jobs[0].api_calls, a.jobs[0].saved_items), (1, 2));
        assert_eq!(b.jobs.len(), 0);
        sql_query("UPDATE archive_seed SET fetched_at=unixepoch('now','-8 days')")
            .execute(&mut archive.db)
            .unwrap();
        assert_eq!(
            archive
                .next_seed_candidate("native-mastodon:a", origin)
                .unwrap()
                .unwrap()
                .remote_id,
            "10"
        );
    }

    #[test]
    fn notification_backfill_cursor_is_durable_and_identity_owned() {
        let mut archive = Archive::open(Path::new(":memory:")).unwrap();
        for (handle, id) in [("native-mastodon:a", "1"), ("native-mastodon:b", "2")] {
            archive
                .observe(
                    handle,
                    "https://example.com",
                    "verify",
                    &format!(r#"{{"id":"{id}"}}"#),
                )
                .unwrap();
        }
        assert_eq!(
            archive
                .notification_cursor("native-mastodon:a", "https://example.com")
                .unwrap(),
            None
        );
        archive
            .save_notification_cursor("native-mastodon:a", "https://example.com", Some("42"))
            .unwrap();
        assert_eq!(
            archive
                .notification_cursor("native-mastodon:a", "https://example.com")
                .unwrap(),
            Some(Some("42".into()))
        );
        assert_eq!(
            archive
                .notification_cursor("native-mastodon:b", "https://example.com")
                .unwrap(),
            None
        );
        archive
            .save_notification_cursor("native-mastodon:a", "https://example.com", None)
            .unwrap();
        assert_eq!(
            archive
                .notification_cursor("native-mastodon:a", "https://example.com")
                .unwrap(),
            Some(None)
        );
        assert!(archive
            .save_notification_cursor("native-mastodon:a", "https://example.com", Some("bad"))
            .is_err());
    }

    fn analytics_archive() -> Archive {
        let mut archive = Archive::open(Path::new(":memory:")).unwrap();
        archive
            .observe(
                "native-mastodon:a",
                "https://example.com",
                "verify",
                r#"{"id":"1"}"#,
            )
            .unwrap();
        archive
    }

    fn status_json(id: &str, author: &str, created: &str, reblogs: i64, favourites: i64) -> String {
        format!(
            r#"{{"id":"{id}","created_at":"{created}","content":"<p>x</p>","visibility":"public","account":{{"id":"{author}","acct":"u{author}","display_name":"U","followers_count":10}},"replies_count":0,"reblogs_count":{reblogs},"favourites_count":{favourites},"quotes_count":1}}"#
        )
    }

    fn snapshot_rows(archive: &mut Archive) -> Vec<(i64, i64)> {
        #[derive(QueryableByName)]
        struct Row {
            #[diesel(sql_type = BigInt)]
            reblogs: i64,
            #[diesel(sql_type = BigInt)]
            quotes: i64,
        }
        sql_query("SELECT reblogs, quotes FROM archive_post_count_snapshot ORDER BY post_id")
            .load::<Row>(&mut archive.db)
            .unwrap()
            .into_iter()
            .map(|r| (r.reblogs, r.quotes))
            .collect()
    }

    #[test]
    fn count_snapshots_track_only_own_posts_and_only_changes() {
        let mut archive = analytics_archive();
        let (h, o) = ("native-mastodon:a", "https://example.com");
        let own = status_json("10", "1", "2026-11-01T00:00:00Z", 1, 2);
        let theirs = status_json("11", "2", "2026-11-01T00:00:00Z", 5, 5);
        archive
            .observe(h, o, "profile", &format!("[{own},{theirs}]"))
            .unwrap();
        assert_eq!(snapshot_rows(&mut archive), vec![(1, 1)]);
        // Same counts again: nothing new recorded.
        archive.observe(h, o, "status", &own).unwrap();
        assert_eq!(snapshot_rows(&mut archive), vec![(1, 1)]);
        // Changed counts are recorded (same second, so the row is updated in place).
        let boosted = status_json("10", "1", "2026-11-01T00:00:00Z", 4, 2);
        archive.observe(h, o, "status", &boosted).unwrap();
        assert_eq!(snapshot_rows(&mut archive), vec![(4, 1)]);
    }

    #[test]
    fn analytics_posts_are_the_accounts_statuses_newest_first_with_boosts() {
        let mut archive = analytics_archive();
        let (h, o) = ("native-mastodon:a", "https://example.com");
        let older = status_json("10", "1", "2026-10-01T00:00:00Z", 0, 0);
        let newer = status_json("12", "1", "2026-11-01T00:00:00Z", 0, 0);
        let boost = format!(
            r#"{{"id":"13","created_at":"2026-11-02T00:00:00Z","content":"","visibility":"public","account":{{"id":"1","acct":"me"}},"reblog":{}}}"#,
            status_json("14", "2", "2026-10-30T00:00:00Z", 0, 0)
        );
        archive
            .observe(h, o, "profile", &format!("[{boost},{newer},{older}]"))
            .unwrap();
        let ids: Vec<String> = archive
            .analytics_posts(h, o, "1", 100)
            .unwrap()
            .into_iter()
            .map(|v| v["id"].as_str().unwrap().to_owned())
            .collect();
        // The boost wrapper is the account's; the boosted post (by "2") is not.
        assert_eq!(ids, vec!["13", "12", "10"]);
        assert_eq!(
            archive
                .newest_account_post_created(h, o, "1")
                .unwrap()
                .as_deref(),
            Some("2026-11-02T00:00:00Z")
        );
        assert!(archive.analytics_posts(h, o, "1", 0).is_err());
        assert!(archive.analytics_posts(h, o, "x", 10).is_err());
    }

    #[test]
    fn analytics_cursor_round_trips_and_clears() {
        let mut archive = analytics_archive();
        let (h, o) = ("native-mastodon:a", "https://example.com");
        assert_eq!(archive.analytics_cursor(h, o, "1").unwrap(), None);
        let cursor = CatchUpCursor {
            max_id: "99".into(),
            stop_at: Some("2026-11-01T00:00:00Z".into()),
        };
        archive
            .save_analytics_cursor(h, o, "1", Some(&cursor))
            .unwrap();
        assert_eq!(archive.analytics_cursor(h, o, "1").unwrap(), Some(cursor));
        assert_eq!(archive.analytics_cursor(h, o, "2").unwrap(), None);
        archive.save_analytics_cursor(h, o, "1", None).unwrap();
        assert_eq!(archive.analytics_cursor(h, o, "1").unwrap(), None);
        let bad = CatchUpCursor {
            max_id: "x".into(),
            stop_at: None,
        };
        assert!(archive
            .save_analytics_cursor(h, o, "1", Some(&bad))
            .is_err());
        assert!(archive.recount_cutoff(14).unwrap().ends_with('Z'));
    }

    #[test]
    fn booster_cache_is_reused_until_the_boost_count_changes() {
        let mut archive = analytics_archive();
        let (h, o) = ("native-mastodon:a", "https://example.com");
        assert!(!archive.cached_boosters(h, o, "10").unwrap().post_known);
        archive
            .observe(
                h,
                o,
                "status",
                &status_json("10", "1", "2026-11-01T00:00:00Z", 2, 0),
            )
            .unwrap();
        let unscanned = archive.cached_boosters(h, o, "10").unwrap();
        assert!(unscanned.post_known && unscanned.boosters.is_none());
        let boosters: Vec<Value> = vec![
            serde_json::json!({"id":"20","acct":"small","followers_count":5}),
            serde_json::json!({"id":"21","acct":"big","followers_count":500}),
            serde_json::json!({"id":"not-a-number","acct":"skip"}),
        ];
        assert_eq!(archive.save_boosters(h, o, "10", &boosters).unwrap(), 2);
        let cached = archive
            .cached_boosters(h, o, "10")
            .unwrap()
            .boosters
            .unwrap();
        let accts: Vec<&str> = cached.iter().map(|v| v["acct"].as_str().unwrap()).collect();
        assert_eq!(accts, vec!["big", "small"]);
        assert_eq!(cached[0]["followers_count"], 500);
        // Another boost arrived: the cached list is stale.
        archive
            .observe(
                h,
                o,
                "status",
                &status_json("10", "1", "2026-11-01T00:00:00Z", 3, 0),
            )
            .unwrap();
        assert!(archive
            .cached_boosters(h, o, "10")
            .unwrap()
            .boosters
            .is_none());
        // An empty lookup is still a lookup.
        archive.save_boosters(h, o, "10", &[]).unwrap();
        assert_eq!(
            archive.cached_boosters(h, o, "10").unwrap().boosters,
            Some(vec![])
        );
    }

    #[test]
    fn audience_history_and_post_activity_come_from_the_archive() {
        let mut archive = Archive::open(Path::new(":memory:")).unwrap();
        let (h, o) = ("native-mastodon:a", "https://example.com");
        archive
            .observe(
                h,
                o,
                "verify",
                r#"{"id":"1","followers_count":40,"following_count":7,"statuses_count":9}"#,
            )
            .unwrap();
        // Own post seen later the same day with a newer follower count.
        archive
            .observe(
                h,
                o,
                "status",
                &status_json("10", "1", "2026-11-01T00:00:00Z", 1, 0),
            )
            .unwrap();
        let notification = |id: &str, kind: &str, at: &str, status: Option<&str>| {
            let status = status
                .map(|s| format!(r#","status":{s}"#))
                .unwrap_or_default();
            format!(
                r#"{{"id":"{id}","type":"{kind}","created_at":"{at}","account":{{"id":"5","acct":"fan"}}{status}}}"#
            )
        };
        let post = status_json("10", "1", "2026-11-01T00:00:00Z", 1, 0);
        let page = format!(
            "[{},{},{}]",
            notification("n1", "reblog", "2026-11-01T02:00:00Z", Some(&post)),
            notification("n2", "favourite", "2026-11-03T00:00:00Z", Some(&post)),
            notification("n3", "follow", "2026-10-15T00:00:00Z", None),
        );
        archive.observe(h, o, "notifications", &page).unwrap();

        let history = archive.analytics_history(h, o).unwrap();
        assert_eq!(history.followers.len(), 1);
        // status_json's author carries followers_count 10, observed after verify.
        assert_eq!(history.followers[0].followers, 10);
        assert_eq!(
            history.follows_by_month,
            vec![MonthCount {
                month: "2026-10".into(),
                count: 1
            }]
        );
        assert!(!history.notification_history_complete);

        let activity = archive.post_activity(h, o, "10").unwrap();
        let kinds: Vec<&str> = activity.events.iter().map(|e| e.kind.as_str()).collect();
        assert_eq!(kinds, vec!["reblog", "favourite"]);
        assert_eq!(activity.snapshots.len(), 1);
        assert!(archive.post_activity(h, o, "x").is_err());
    }

    #[test]
    fn engagers_are_counted_per_person_kind_and_month_within_the_window() {
        let mut archive = analytics_archive();
        let (h, o) = ("native-mastodon:a", "https://example.com");
        let n = |id: &str, kind: &str, at: &str, who: &str, acct: &str| {
            format!(
                r#"{{"id":"{id}","type":"{kind}","created_at":"{at}","account":{{"id":"{who}","acct":"{acct}","display_name":"D{who}"}}}}"#
            )
        };
        // Future dates stay inside any "last N days" window; 2000 is outside.
        let page = format!(
            "[{},{},{},{},{}]",
            n("1", "favourite", "2099-01-02T00:00:00Z", "5", "local"),
            n("2", "favourite", "2099-01-03T00:00:00Z", "5", "local"),
            n("3", "reblog", "2099-02-01T00:00:00Z", "6", "far@else.where"),
            n("4", "follow", "2099-02-01T00:00:00Z", "7", "follower"),
            n("5", "favourite", "2000-01-01T00:00:00Z", "8", "old"),
        );
        archive.observe(h, o, "notifications", &page).unwrap();
        let rows = archive.engagers(h, o, 90).unwrap();
        let summary: Vec<(&str, &str, &str, i64)> = rows
            .iter()
            .map(|r| (r.acct.as_str(), r.kind.as_str(), r.month.as_str(), r.count))
            .collect();
        assert_eq!(
            summary,
            vec![
                ("local@example.com", "favourite", "2099-01", 2),
                ("far@else.where", "reblog", "2099-02", 1),
            ]
        );
        assert!(archive.engagers(h, o, 0).is_err());
    }

    /// Ten days of likes, one a day; ids 1..=10, newest has the highest id.
    fn timed_archive() -> Archive {
        let mut archive = analytics_archive();
        let rows: Vec<String> = (1..=10)
            .map(|day| {
                format!(
                    r#"{{"id":"{day}","type":"favourite","created_at":"2099-01-{day:02}T00:00:00.000Z","account":{{"id":"{}","acct":"fan{day}","display_name":"F","followers_count":7,"header":"big"}},"status":{{"id":"90","created_at":"2099-01-01T00:00:00Z","content":"<p>hi</p>","tags":[{{"name":"Art"}}],"language":"en","account":{{"id":"1","acct":"me","display_name":"Me"}}}}}}"#,
                    100 + day
                )
            })
            .collect();
        archive
            .observe(
                "native-mastodon:a",
                "https://example.com",
                "notifications",
                &format!("[{}]", rows.join(",")),
            )
            .unwrap();
        archive
    }

    #[test]
    fn timed_reactions_wait_for_the_collector_to_connect() {
        let mut archive = timed_archive();
        let (h, o) = ("native-mastodon:a", "https://example.com");
        // Rows saved by browsing alone may have gaps, so none are offered.
        let none = archive.timed_reactions(h, o, 90).unwrap();
        assert!(!none.connected && none.events.is_empty());
        archive
            .save_notification_mark(h, o, "10", Some(None))
            .unwrap();
        let all = archive.timed_reactions(h, o, 90).unwrap();
        assert!(all.connected);
        assert_eq!(all.events.len(), 10);
        assert_eq!(all.events[0].id, "10");
        assert_eq!(all.events[0].post.as_deref(), Some("90"));
        assert_eq!(all.people.len(), 10);
        assert_eq!(all.people["110"]["followers_count"], 7);
        assert!(all.people["110"].get("header").is_none());
        assert_eq!(all.posts["90"]["tags"][0]["name"], "Art");
        assert_eq!(all.posts["90"]["language"], "en");
        assert!(archive.timed_reactions(h, o, 0).is_err());
    }

    #[test]
    fn timed_reactions_stay_inside_the_unbroken_stretch() {
        let mut archive = timed_archive();
        let (h, o) = ("native-mastodon:a", "https://example.com");
        // Joined up to 8; the backfill still has everything below 4 to read.
        archive
            .save_notification_mark(h, o, "8", Some(Some("4")))
            .unwrap();
        let part = archive.timed_reactions(h, o, 90).unwrap();
        let ids: Vec<&str> = part.events.iter().map(|e| e.id.as_str()).collect();
        assert_eq!(ids, ["8", "7", "6", "5", "4"]);
        assert_eq!(
            part.covered_since.as_deref(),
            Some("2099-01-04T00:00:00.000Z")
        );
    }

    #[test]
    fn a_notification_mark_leaves_the_history_cursor_unless_told() {
        let mut archive = analytics_archive();
        let (h, o) = ("native-mastodon:a", "https://example.com");
        assert_eq!(archive.notification_mark(h, o).unwrap(), None);
        archive.save_notification_cursor(h, o, Some("42")).unwrap();
        archive.save_notification_mark(h, o, "99", None).unwrap();
        assert_eq!(archive.notification_mark(h, o).unwrap(), Some("99".into()));
        assert_eq!(
            archive.notification_cursor(h, o).unwrap(),
            Some(Some("42".into()))
        );
        archive
            .save_notification_mark(h, o, "120", Some(None))
            .unwrap();
        assert_eq!(archive.notification_cursor(h, o).unwrap(), Some(None));
        assert!(archive.save_notification_mark(h, o, "x", None).is_err());
    }

    #[test]
    fn a_reread_notification_gains_its_post_link() {
        let mut archive = analytics_archive();
        let (h, o) = ("native-mastodon:a", "https://example.com");
        // Saved before the link existed.
        archive
            .observe(h, o, "notifications", r#"[{"id":"n1","type":"reblog","created_at":"2026-11-01T00:00:00Z","account":{"id":"5","acct":"fan"}}]"#)
            .unwrap();
        assert!(archive.post_activity(h, o, "10").unwrap().events.is_empty());
        let post = status_json("10", "1", "2026-11-01T00:00:00Z", 1, 0);
        archive
            .observe(
                h,
                o,
                "notifications",
                &format!(r#"[{{"id":"n1","type":"reblog","created_at":"2026-11-01T00:00:00Z","account":{{"id":"5","acct":"fan"}},"status":{post}}}]"#),
            )
            .unwrap();
        assert_eq!(archive.post_activity(h, o, "10").unwrap().events.len(), 1);
    }

    #[test]
    fn people_post_bins_keep_self_threads_and_other_replies_distinct() {
        let mut archive = Archive::open(Path::new(":memory:")).unwrap();
        let handle = "native-mastodon:reader";
        let origin = "https://example.com";
        archive
            .observe(handle, origin, "verify", r#"{"id":"1"}"#)
            .unwrap();
        let account = serde_json::json!({"id":"55","acct":"friend","display_name":"Friend"});
        let posts = serde_json::json!([
            {"id":"100","created_at":"2026-01-01T00:00:00Z","content":"root","visibility":"public","account":account},
            {"id":"101","created_at":"2026-01-02T00:00:00Z","content":"self reply","visibility":"public","account":account,"in_reply_to_id":"100","in_reply_to_account_id":"55"},
            {"id":"102","created_at":"2026-01-03T00:00:00Z","content":"discussion","visibility":"public","account":account,"in_reply_to_id":"900","in_reply_to_account_id":"77"}
        ]);
        archive
            .observe(handle, origin, "home", &posts.to_string())
            .unwrap();
        sql_query("INSERT INTO archive_follow(identity_id,actor_id,seen_generation) SELECT identity_id,id,1 FROM archive_actor WHERE remote_id='55'")
            .execute(&mut archive.db).unwrap();
        let storms = archive
            .people_posts(handle, origin, "all", "storms", 0)
            .unwrap();
        assert_eq!(
            archive
                .people_posts(handle, origin, "all", "all", 0)
                .unwrap()
                .posts
                .len(),
            2
        );
        assert_eq!(storms.posts.len(), 1);
        assert_eq!(storms.posts[0].status["id"], "100");
        let discussions = archive
            .people_posts(handle, origin, "all", "discussions", 0)
            .unwrap();
        assert_eq!(discussions.posts.len(), 1);
        assert_eq!(discussions.posts[0].status["id"], "102");
    }

    #[test]
    fn ordinary_reads_keep_posts_and_edits_separate_by_identity() {
        let mut archive = Archive::open(Path::new(":memory:")).unwrap();
        for (handle, self_id, text) in [
            ("native-mastodon:a", "1", "first copy"),
            ("native-mastodon:b", "2", "second copy"),
        ] {
            archive
                .observe(
                    handle,
                    "https://example.com",
                    "verify",
                    &format!(r#"{{"id":"{self_id}"}}"#),
                )
                .unwrap();
            let status = serde_json::json!({
                "id": "99", "created_at": "2026-01-01T00:00:00Z", "content": text,
                "visibility": "public", "account": {"id":"55", "acct":"friend", "display_name":"Friend"},
                "media_attachments": [], "tags": []
            });
            assert_eq!(
                archive
                    .observe(
                        handle,
                        "https://example.com",
                        "home",
                        &serde_json::json!([status]).to_string()
                    )
                    .unwrap(),
                1
            );
        }
        let a: String = archive_post::table
            .filter(archive_post::identity_id.eq(1))
            .select(archive_post::content)
            .first(&mut archive.db)
            .unwrap();
        let b: String = archive_post::table
            .filter(archive_post::identity_id.eq(2))
            .select(archive_post::content)
            .first(&mut archive.db)
            .unwrap();
        assert_eq!((a.as_str(), b.as_str()), ("first copy", "second copy"));
        let edited = serde_json::json!({
            "id": "99", "created_at": "2026-01-01T00:00:00Z", "content": "edited first copy",
            "visibility": "public", "account": {"id":"55", "acct":"friend", "display_name":"Friend"}
        });
        archive
            .observe(
                "native-mastodon:a",
                "https://example.com",
                "status",
                &edited.to_string(),
            )
            .unwrap();
        let updated: String = archive_post::table
            .filter(archive_post::identity_id.eq(1))
            .select(archive_post::content)
            .first(&mut archive.db)
            .unwrap();
        let untouched: String = archive_post::table
            .filter(archive_post::identity_id.eq(2))
            .select(archive_post::content)
            .first(&mut archive.db)
            .unwrap();
        assert_eq!(updated, "edited first copy");
        assert_eq!(untouched, "second copy");
        let count: i64 = archive_post::table
            .count()
            .get_result(&mut archive.db)
            .unwrap();
        assert_eq!(count, 2);
        for identity in [1, 2] {
            let actor: i64 = archive_actor::table
                .filter(archive_actor::identity_id.eq(identity))
                .select(archive_actor::id)
                .first(&mut archive.db)
                .unwrap();
            diesel::sql_query(
                "INSERT INTO archive_follow(identity_id,actor_id,seen_generation) VALUES(?,?,1)",
            )
            .bind::<BigInt, _>(identity)
            .bind::<BigInt, _>(actor)
            .execute(&mut archive.db)
            .unwrap();
        }
        let a_profile = archive
            .profiles("native-mastodon:a", "https://example.com")
            .unwrap();
        assert_eq!(a_profile.profiles.len(), 1);
        assert_eq!(a_profile.profiles[0].remote_id, "55");
        let a_people = archive
            .people_posts("native-mastodon:a", "https://example.com", "all", "all", 0)
            .unwrap();
        assert_eq!(a_people.following, 1);
        assert_eq!(a_people.posts.len(), 1);
        assert_eq!(a_people.posts[0].status["content"], "edited first copy");
        let b_people = archive
            .people_posts("native-mastodon:b", "https://example.com", "all", "all", 0)
            .unwrap();
        assert_eq!(b_people.posts[0].status["content"], "second copy");
        assert!(archive
            .people_posts(
                "native-mastodon:a",
                "https://example.com",
                "reading",
                "all",
                0
            )
            .unwrap()
            .posts
            .is_empty());
        archive
            .observe(
                "native-mastodon:a",
                "https://example.com",
                "relationships",
                r#"[{"id":"55","following":true,"followed_by":false}]"#,
            )
            .unwrap();
        assert_eq!(
            archive
                .people_posts(
                    "native-mastodon:a",
                    "https://example.com",
                    "reading",
                    "all",
                    0
                )
                .unwrap()
                .posts
                .len(),
            1
        );
        archive.observe("native-mastodon:a", "https://example.com", "notifications",
            r#"[{"id":"901","type":"mention","created_at":"2026-01-02T00:00:00Z","account":{"id":"55","acct":"friend","display_name":"Friend"}}]"#).unwrap();
        assert!(archive
            .people_posts(
                "native-mastodon:a",
                "https://example.com",
                "social",
                "all",
                0
            )
            .unwrap()
            .posts
            .is_empty());
        archive
            .observe(
                "native-mastodon:a",
                "https://example.com",
                "relationships",
                r#"[{"id":"55","following":true,"followed_by":true}]"#,
            )
            .unwrap();
        assert_eq!(
            archive
                .people_posts(
                    "native-mastodon:a",
                    "https://example.com",
                    "social",
                    "all",
                    0
                )
                .unwrap()
                .posts
                .len(),
            1
        );
        assert_eq!(
            archive
                .people_members("native-mastodon:a", "https://example.com", "social")
                .unwrap()
                .len(),
            1
        );
        assert!(archive
            .people_members("native-mastodon:b", "https://example.com", "social")
            .unwrap()
            .is_empty());
        assert!(archive
            .people_posts(
                "native-mastodon:b",
                "https://example.com",
                "social",
                "all",
                0
            )
            .unwrap()
            .posts
            .is_empty());
        assert!(archive
            .people_posts(
                "native-mastodon:a",
                "https://example.com",
                "social",
                "made_up",
                0
            )
            .is_err());
        assert_eq!(
            archive
                .account_posts("native-mastodon:a", "https://example.com", "55", 0)
                .unwrap()
                .len(),
            1
        );
        assert!(archive
            .account_posts("native-mastodon:a", "https://example.com", "56", 0)
            .unwrap()
            .is_empty());
        assert_eq!(
            archive
                .oldest_account_post_id("native-mastodon:a", "https://example.com", "55")
                .unwrap()
                .as_deref(),
            Some("99")
        );
        assert_eq!(a_profile.profiles[0].cached_unread, 1);
        let a_actor = a_profile.profiles[0].id;
        let a_posts = archive
            .profile_posts(
                "native-mastodon:a",
                "https://example.com",
                a_actor,
                "all",
                false,
                0,
            )
            .unwrap();
        assert_eq!(a_posts.len(), 1);
        assert_eq!(a_posts[0].status["content"], "edited first copy");
        archive
            .mark_read(
                "native-mastodon:a",
                "https://example.com",
                a_posts[0].local_id,
            )
            .unwrap();
        assert!(archive
            .profile_posts(
                "native-mastodon:a",
                "https://example.com",
                a_actor,
                "all",
                true,
                0
            )
            .unwrap()
            .is_empty());
        assert_eq!(
            archive
                .profiles("native-mastodon:a", "https://example.com")
                .unwrap()
                .profiles[0]
                .cached_unread,
            0
        );
        assert_eq!(
            archive
                .profiles("native-mastodon:b", "https://example.com")
                .unwrap()
                .profiles[0]
                .cached_unread,
            1
        );
        assert!(archive
            .mark_read(
                "native-mastodon:b",
                "https://example.com",
                a_posts[0].local_id
            )
            .is_err());
    }

    #[test]
    fn read_state_survives_reopen_without_crossing_identities() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("archive.sqlite3");
        let status = serde_json::json!({
            "id": "99", "created_at": "2026-01-01T00:00:00Z", "content": "private copy",
            "visibility": "private", "account": {"id":"55", "acct":"friend"}
        });
        let mut archive = Archive::open(&path).unwrap();
        for (handle, self_id) in [("native-mastodon:a", "1"), ("native-mastodon:b", "2")] {
            archive
                .observe(
                    handle,
                    "https://example.com",
                    "verify",
                    &format!(r#"{{"id":"{self_id}"}}"#),
                )
                .unwrap();
            archive
                .observe(
                    handle,
                    "https://example.com",
                    "home",
                    &serde_json::json!([status.clone()]).to_string(),
                )
                .unwrap();
        }
        let own_post: i64 = archive_post::table
            .filter(archive_post::identity_id.eq(1))
            .select(archive_post::id)
            .first(&mut archive.db)
            .unwrap();
        archive
            .mark_read("native-mastodon:a", "https://example.com", own_post)
            .unwrap();
        drop(archive);

        let restored_path = dir.path().join("restored.sqlite3");
        let source = RawConnection::open(&path).unwrap();
        let mut destination = RawConnection::open(&restored_path).unwrap();
        Backup::new(&source, &mut destination)
            .unwrap()
            .run_to_completion(64, Duration::from_millis(1), None)
            .unwrap();
        drop(destination);
        drop(source);
        verify_file(&restored_path).unwrap();

        for database in [&path, &restored_path] {
            let mut reopened = Archive::open(database).unwrap();
            for (handle, expected) in [("native-mastodon:a", true), ("native-mastodon:b", false)] {
                let actor: i64 = archive_actor::table
                    .filter(archive_actor::identity_id.eq(if expected { 1 } else { 2 }))
                    .select(archive_actor::id)
                    .first(&mut reopened.db)
                    .unwrap();
                let posts = reopened
                    .profile_posts(handle, "https://example.com", actor, "all", false, 0)
                    .unwrap();
                assert_eq!(posts.len(), 1);
                assert_eq!(posts[0].is_read, expected);
                assert_eq!(posts[0].status["visibility"], "private");
            }
        }
    }

    #[test]
    fn fresh_archive_reaches_current_schema_without_backup() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("archive.sqlite3");
        let mut archive = Archive::open(&path).unwrap();
        assert_eq!(
            archive
                .identity("mastodon", "https://example.com", "1")
                .unwrap(),
            1
        );
        drop(archive);
        let raw = RawConnection::open(&path).unwrap();
        let version: String = raw
            .query_row(
                "SELECT max(version) FROM __diesel_schema_migrations",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(version, "00000000000006");
        assert!(!path.with_extension("before-legacy.sqlite3").exists());
    }

    #[test]
    fn upgrades_legacy_archive_without_merging_identity_copies() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("archive.sqlite3");
        let raw = RawConnection::open(&path).unwrap();
        raw.execute_batch(include_str!(
            "../migrations/00000000000001_legacy_archive/up.sql"
        ))
        .unwrap();
        raw.execute_batch(
            "INSERT INTO archive_identity(id,provider,origin,remote_id,credential_handle) VALUES
             (1,'mastodon','https://example.com','1','native-mastodon:a'),
             (2,'mastodon','https://example.com','2','native-mastodon:b');
             INSERT INTO archive_actor(id,provider,origin,remote_id,acct,display_name) VALUES
             (7,'mastodon','https://example.com','55','person@example.com','Person');
             INSERT INTO archive_follow(identity_id,actor_id,seen_generation) VALUES (1,7,3),(2,7,1);
             INSERT INTO archive_follow_scan(identity_id,generation,next_cursor,complete) VALUES (1,3,'older',0);
             INSERT INTO archive_post(id,provider,origin,remote_id,actor_id,created_at,visibility,content)
               VALUES (8,'mastodon','https://example.com','99',7,'2026-01-01T00:00:00Z','public','hello old archive');
             INSERT INTO archive_post_access(identity_id,post_id,source) VALUES (1,8,'home'),(2,8,'profile');
             INSERT INTO archive_read(identity_id,post_id,read_at) VALUES (1,8,123);
             INSERT INTO archive_interaction(identity_id,actor_id,remote_id,kind,occurred_at)
               VALUES (1,7,'notify-1','favourite','2026-01-02T00:00:00Z');",
        )
        .unwrap();
        drop(raw);

        let mut archive = Archive::open(&path).unwrap();
        assert_eq!(archive.follow_scan(1).unwrap(), (3, Some("older".into())));
        assert_eq!(archive.follow_counts(1).unwrap().0, 1);
        assert_eq!(archive.follow_counts(2).unwrap().0, 1);
        assert!(archive
            .follow_status("https://example.com", "native-mastodon:a")
            .unwrap()
            .is_some());
        for identity in [1, 2] {
            let own_posts: i64 = archive_post::table
                .filter(archive_post::identity_id.eq(identity))
                .count()
                .get_result(&mut archive.db)
                .unwrap();
            assert_eq!(own_posts, 1);
        }
        let b_reads: i64 = archive_read::table
            .filter(archive_read::identity_id.eq(2))
            .count()
            .get_result(&mut archive.db)
            .unwrap();
        assert_eq!(b_reads, 0);
        drop(archive);

        let raw = RawConnection::open(&path).unwrap();
        let (actors, posts, read): (i64, i64, i64) = (
            raw.query_row("SELECT count(*) FROM archive_actor", [], |row| row.get(0))
                .unwrap(),
            raw.query_row("SELECT count(*) FROM archive_post", [], |row| row.get(0))
                .unwrap(),
            raw.query_row("SELECT count(*) FROM archive_read", [], |row| row.get(0))
                .unwrap(),
        );
        assert_eq!((actors, posts, read), (2, 2, 1));
        let fts: i64 = raw
            .query_row(
                "SELECT count(*) FROM archive_post_fts WHERE archive_post_fts MATCH 'hello'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(fts, 2);
        let credential_count: i64 = raw
            .query_row("SELECT count(*) FROM archive_credential", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(credential_count, 2);
        let version: String = raw
            .query_row(
                "SELECT max(version) FROM __diesel_schema_migrations",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(version, "00000000000006");
        drop(raw);
        assert!(path.with_extension("before-legacy.sqlite3").exists());
        Archive::open(&path).unwrap();
    }

    #[test]
    fn bad_legacy_schema_keeps_a_backup_and_original_data() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("archive.sqlite3");
        let raw = RawConnection::open(&path).unwrap();
        raw.execute_batch("CREATE TABLE archive_identity(id INTEGER PRIMARY KEY, value TEXT); INSERT INTO archive_identity(value) VALUES('keep me');").unwrap();
        drop(raw);
        assert!(Archive::open(&path).is_err());
        assert!(path.with_extension("before-legacy.sqlite3").exists());
        let raw = RawConnection::open(&path).unwrap();
        let value: String = raw
            .query_row("SELECT value FROM archive_identity", [], |row| row.get(0))
            .unwrap();
        assert_eq!(value, "keep me");
    }

    #[test]
    fn upgrades_older_identity_table_without_credential_column() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("archive.sqlite3");
        let raw = RawConnection::open(&path).unwrap();
        let old_sql = include_str!("../migrations/00000000000001_legacy_archive/up.sql")
            .replace("    credential_handle TEXT,", "");
        raw.execute_batch(&old_sql).unwrap();
        raw.execute("INSERT INTO archive_identity(provider,origin,remote_id) VALUES('mastodon','https://example.com','1')", []).unwrap();
        drop(raw);
        let mut archive = Archive::open(&path).unwrap();
        assert_eq!(
            archive
                .identity("mastodon", "https://example.com", "1")
                .unwrap(),
            1
        );
        archive.bind_handle(1, "native-mastodon:new").unwrap();
        assert!(archive
            .follow_status("https://example.com", "native-mastodon:new")
            .unwrap()
            .is_some());
    }
}
