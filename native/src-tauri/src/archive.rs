//! Local Mastodon archive collector over identity-owned SQLite snapshots.
use crate::archive_store::{
    Archive, AudienceHistory, CatchUpCursor, CollectionStatus, EngagerRow, FollowStatus,
    FollowedActor, PeoplePostsResult, PostActivity, ProfilePost, ProfilePostPage, ProfileSummary,
    ProfilesResult, TimedReactions,
};
use crate::{
    diagnostics,
    mastodon_login::{account_read, archive_auth},
    public_mastodon::{client_for, failure, read_json, Failure, PublicResponse},
};
use serde::Serialize;
use serde_json::Value;
use std::{
    collections::{HashMap, HashSet},
    path::PathBuf,
    sync::Mutex,
    time::Duration,
};
use tauri::Manager;
use tokio::sync::Semaphore;
use url::Url;

static ARCHIVE_COLLECTOR: Semaphore = Semaphore::const_new(1);
static PROFILE_FETCH: Semaphore = Semaphore::const_new(1);
static COLLECTOR_JOB: Mutex<Option<(String, u8)>> = Mutex::new(None);
static SEEDED_THIS_SESSION: Mutex<Option<HashMap<String, usize>>> = Mutex::new(None);
struct ActiveJob(String);
impl ActiveJob {
    fn start(handle: &str, job: u8) -> Self {
        if let Ok(mut active) = COLLECTOR_JOB.lock() {
            *active = Some((handle.to_owned(), job));
        }
        Self(handle.to_owned())
    }
}
impl Drop for ActiveJob {
    fn drop(&mut self) {
        if let Ok(mut active) = COLLECTOR_JOB.lock() {
            if active.as_ref().is_some_and(|(handle, _)| handle == &self.0) {
                *active = None;
            }
        }
    }
}
const FOLLOW_PAGE_SIZE: usize = 80;
const MAX_FOLLOW_PAGES: usize = 1000;
const NOTIFICATION_PAGE_SIZE: usize = 80;
const MAX_NOTIFICATION_PAGES_PER_RUN: usize = 20;
const RECENT_SEED_PROFILES_PER_SESSION: usize = 12;

async fn count_request(
    app: &tauri::AppHandle,
    handle: &str,
    origin: &str,
    job: &'static str,
) -> Result<(), Failure> {
    let path = archive_dir(app)
        .map_err(|_| archive_error())?
        .join("archive.sqlite3");
    let handle = handle.to_owned();
    let origin = origin.to_owned();
    tokio::task::spawn_blocking(move || {
        Archive::open(&path)?.record_collector_request(&handle, &origin, job)
    })
    .await
    .map_err(|_| archive_error())?
    .map_err(|_| archive_error())
}

async fn count_problem(
    app: &tauri::AppHandle,
    handle: &str,
    origin: &str,
    job: &'static str,
    problem: &'static str,
) {
    let path = match archive_dir(app) {
        Ok(path) => path.join("archive.sqlite3"),
        Err(_) => return,
    };
    let handle = handle.to_owned();
    let origin = origin.to_owned();
    let _ = tokio::task::spawn_blocking(move || {
        Archive::open(&path)?.record_collector_problem(&handle, &origin, job, problem)
    })
    .await;
}

#[tauri::command]
pub async fn archive_collection_status(
    app: tauri::AppHandle,
    handle: String,
) -> Result<CollectionStatus, Failure> {
    let (origin, _) = archive_auth(&handle)?;
    let path = archive_dir(&app)
        .map_err(|_| archive_error())?
        .join("archive.sqlite3");
    let status_handle = handle.clone();
    let mut status = tokio::task::spawn_blocking(move || {
        Archive::open(&path)?.collection_status(&handle, &origin)
    })
    .await
    .map_err(|_| archive_error())?
    .map_err(|_| archive_error())?;
    let job = COLLECTOR_JOB
        .lock()
        .ok()
        .and_then(|active| {
            active
                .as_ref()
                .and_then(|(owner, job)| (owner == &status_handle).then_some(*job))
        })
        .unwrap_or(0);
    status.current_job = match job {
        1 => "following",
        2 => "notifications",
        3 => "recent_seed",
        _ => "idle",
    }
    .into();
    Ok(status)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SeedReport {
    profiles: usize,
    posts: usize,
    remaining: i64,
}

/// One bounded recent page for each selected active follow. No unknown or
/// older-than-90-day account enters this queue, and no older page is followed.
#[tauri::command]
pub async fn archive_seed_recent(
    app: tauri::AppHandle,
    handle: String,
) -> Result<SeedReport, Failure> {
    let _permit = ARCHIVE_COLLECTOR
        .try_acquire()
        .map_err(|_| failure("busy", "Another archive collection is running."))?;
    let _job = ActiveJob::start(&handle, 3);
    let (origin, token) = archive_auth(&handle)?;
    let already_seeded = {
        let mut sessions = SEEDED_THIS_SESSION.lock().map_err(|_| archive_error())?;
        *sessions
            .get_or_insert_with(HashMap::new)
            .get(&handle)
            .unwrap_or(&0)
    };
    let db_path = archive_dir(&app)
        .map_err(|_| archive_error())?
        .join("archive.sqlite3");
    let mut profiles = 0;
    let mut posts = 0;
    for _ in already_seeded..RECENT_SEED_PROFILES_PER_SESSION {
        let candidate_path = db_path.clone();
        let candidate_handle = handle.clone();
        let candidate_origin = origin.clone();
        let candidate = tokio::task::spawn_blocking(move || {
            Archive::open(&candidate_path)?
                .next_seed_candidate(&candidate_handle, &candidate_origin)
        })
        .await
        .map_err(|_| archive_error())?
        .map_err(|_| archive_error())?;
        let Some(candidate) = candidate else { break };
        let mut url = Url::parse(&origin).map_err(|_| archive_error())?;
        url.set_path(&format!(
            "/api/v1/accounts/{}/statuses",
            candidate.remote_id
        ));
        url.query_pairs_mut().append_pair("limit", "40");
        let value =
            json_value(get_follow_page(&app, &handle, &origin, "recent_seed", url, &token).await?)?;
        let rows = value
            .as_array()
            .ok_or_else(|| failure("response", "Invalid recent profile page."))?;
        if rows.len() > 40
            || rows.iter().any(|row| {
                row.get("id").and_then(Value::as_str).is_none_or(|id| {
                    id.is_empty() || id.len() > 64 || !id.bytes().all(|b| b.is_ascii_digit())
                })
            })
        {
            return Err(failure(
                "response",
                "Invalid recent profile page; seed paused.",
            ));
        }
        let body = value.to_string();
        let save_path = db_path.clone();
        let save_handle = handle.clone();
        let save_origin = origin.clone();
        let saved = tokio::task::spawn_blocking(move || {
            let mut archive = Archive::open(&save_path)?;
            let saved = archive.observe(&save_handle, &save_origin, "profile", &body)?;
            archive.finish_seed_page(
                &save_handle,
                &save_origin,
                candidate.actor_id,
                saved as i64,
            )?;
            Ok::<_, anyhow::Error>(saved)
        })
        .await
        .map_err(|_| archive_error())?
        .map_err(|_| archive_error())?;
        profiles += 1;
        posts += saved;
        if let Ok(mut sessions) = SEEDED_THIS_SESSION.lock() {
            *sessions
                .get_or_insert_with(HashMap::new)
                .entry(handle.clone())
                .or_default() += 1;
        }
        tokio::time::sleep(Duration::from_secs(1)).await;
    }
    let status_path = db_path;
    let status_handle = handle;
    let status_origin = origin;
    let remaining = tokio::task::spawn_blocking(move || {
        Ok::<_, anyhow::Error>(
            Archive::open(&status_path)?
                .collection_status(&status_handle, &status_origin)?
                .seed_eligible,
        )
    })
    .await
    .map_err(|_| archive_error())?
    .map_err(|_| archive_error())?;
    Ok(SeedReport {
        profiles,
        posts,
        remaining,
    })
}

fn archive_dir(app: &tauri::AppHandle) -> Result<PathBuf, Box<dyn std::error::Error>> {
    let dir = if cfg!(debug_assertions) && std::env::args().any(|arg| arg == "--smoke-test") {
        std::path::PathBuf::from(
            std::env::var_os("MAWKINGBIRD_SMOKE_PROFILE").ok_or("Missing smoke profile")?,
        )
    } else {
        app.path().app_data_dir()?
    };
    Ok(dir)
}

pub fn init(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let dir = archive_dir(app)?;
    std::fs::create_dir_all(&dir)?;
    // A damaged or un-upgradeable archive must not prevent reading, writing or
    // account recovery elsewhere in the app. The original file and its
    // pre-migration backup remain on disk for in-app recovery.
    if Archive::open(&dir.join("archive.sqlite3")).is_err() {
        diagnostics::record("archive", "unavailable", None);
    } else {
        diagnostics::record("archive", "ready", None);
    }
    Ok(())
}

/// Observe only supported Mastodon reads already completed by the native
/// transport. The response is stored under the credential's receiving server.
pub(crate) async fn observe_read(app: tauri::AppHandle, handle: String, url: String, body: String) {
    let Ok(target) = Url::parse(&url) else { return };
    let path = target.path();
    let source = if path == "/api/v1/accounts/verify_credentials" {
        "verify"
    } else if path == "/api/v1/timelines/home" {
        "home"
    } else if path.starts_with("/api/v1/accounts/") && path.ends_with("/statuses") {
        "profile"
    } else if path == "/api/v1/accounts/relationships" {
        "relationships"
    } else if path == "/api/v1/notifications" {
        "notifications"
    } else if path.starts_with("/api/v1/statuses/")
        && path["/api/v1/statuses/".len()..]
            .bytes()
            .all(|b| b.is_ascii_digit())
    {
        "status"
    } else {
        return;
    };
    let origin = target.origin().ascii_serialization();
    let path = match archive_dir(&app) {
        Ok(dir) => dir.join("archive.sqlite3"),
        Err(_) => return,
    };
    let result = tokio::task::spawn_blocking(move || {
        Archive::open(&path)?.observe(&handle, &origin, source, &body)
    })
    .await;
    if result.is_err() || result.is_ok_and(|value| value.is_err()) {
        diagnostics::record("archive_observe", "paused", None);
    }
}

/// The account deleted one of its own posts: drop this identity's saved copy too.
pub(crate) async fn observe_delete(
    app: tauri::AppHandle,
    handle: String,
    origin: String,
    remote_id: String,
) {
    let path = match archive_dir(&app) {
        Ok(dir) => dir.join("archive.sqlite3"),
        Err(_) => return,
    };
    let result = tokio::task::spawn_blocking(move || {
        Archive::open(&path)?.forget_post(&handle, &origin, &remote_id)
    })
    .await;
    if !matches!(result, Ok(Ok(_))) {
        diagnostics::record("archive_delete", "paused", None);
    }
}

#[derive(Serialize)]
pub struct FollowReport {
    pub following: i64,
    pub known_zombies: i64,
    pub unknown_activity: i64,
    pub complete: bool,
}

#[tauri::command]
pub async fn archive_following_status(
    app: tauri::AppHandle,
    handle: String,
) -> Result<Option<FollowStatus>, Failure> {
    let (origin, _) = archive_auth(&handle)?;
    let path = archive_dir(&app)
        .map_err(|_| archive_error())?
        .join("archive.sqlite3");
    tokio::task::spawn_blocking(move || Archive::open(&path)?.follow_status(&origin, &handle))
        .await
        .map_err(|_| archive_error())?
        .map_err(|_| archive_error())
}

#[tauri::command]
pub async fn archive_profiles(
    app: tauri::AppHandle,
    handle: String,
) -> Result<ProfilesResult, Failure> {
    let (origin, _) = archive_auth(&handle)?;
    let path = archive_dir(&app)
        .map_err(|_| archive_error())?
        .join("archive.sqlite3");
    tokio::task::spawn_blocking(move || Archive::open(&path)?.profiles(&handle, &origin))
        .await
        .map_err(|_| archive_error())?
        .map_err(|_| archive_error())
}

#[tauri::command]
pub async fn archive_people_posts(
    app: tauri::AppHandle,
    handle: String,
    category: String,
    bin: String,
    offset: i64,
) -> Result<PeoplePostsResult, Failure> {
    let (origin, _) = archive_auth(&handle)?;
    let path = archive_dir(&app)
        .map_err(|_| archive_error())?
        .join("archive.sqlite3");
    tokio::task::spawn_blocking(move || {
        Archive::open(&path)?.people_posts(&handle, &origin, &category, &bin, offset)
    })
    .await
    .map_err(|_| archive_error())?
    .map_err(|_| archive_error())
}

#[tauri::command]
pub async fn archive_people_members(
    app: tauri::AppHandle,
    handle: String,
    category: String,
) -> Result<Vec<ProfileSummary>, Failure> {
    let (origin, _) = archive_auth(&handle)?;
    let path = archive_dir(&app)
        .map_err(|_| archive_error())?
        .join("archive.sqlite3");
    tokio::task::spawn_blocking(move || {
        Archive::open(&path)?.people_members(&handle, &origin, &category)
    })
    .await
    .map_err(|_| archive_error())?
    .map_err(|_| archive_error())
}

#[tauri::command]
pub async fn archive_profile_posts(
    app: tauri::AppHandle,
    handle: String,
    actor_id: i64,
    filter: String,
    hide_read: bool,
    offset: i64,
) -> Result<Vec<ProfilePost>, Failure> {
    let (origin, _) = archive_auth(&handle)?;
    let path = archive_dir(&app)
        .map_err(|_| archive_error())?
        .join("archive.sqlite3");
    tokio::task::spawn_blocking(move || {
        Archive::open(&path)?.profile_posts(&handle, &origin, actor_id, &filter, hide_read, offset)
    })
    .await
    .map_err(|_| archive_error())?
    .map_err(|_| archive_error())
}

#[tauri::command]
pub async fn archive_profile_posts_after(
    app: tauri::AppHandle,
    handle: String,
    actor_id: i64,
    filter: String,
    hide_read: bool,
    before_created_at: Option<String>,
    before_id: Option<i64>,
) -> Result<ProfilePostPage, Failure> {
    // The cursor is both halves or neither; half a cursor is a caller bug.
    let before = match (before_created_at, before_id) {
        (Some(created_at), Some(id)) => Some((created_at, id)),
        (None, None) => None,
        _ => return Err(failure("policy", "Invalid profile cursor.")),
    };
    let (origin, _) = archive_auth(&handle)?;
    let path = archive_dir(&app)
        .map_err(|_| archive_error())?
        .join("archive.sqlite3");
    tokio::task::spawn_blocking(move || {
        Archive::open(&path)?.profile_posts_after(
            &handle,
            &origin,
            actor_id,
            &filter,
            hide_read,
            before
                .as_ref()
                .map(|(created_at, id)| (created_at.as_str(), *id)),
        )
    })
    .await
    .map_err(|_| archive_error())?
    .map_err(|_| archive_error())
}

#[tauri::command]
pub async fn archive_account_posts(
    app: tauri::AppHandle,
    handle: String,
    remote_id: String,
    offset: i64,
) -> Result<Vec<ProfilePost>, Failure> {
    let (origin, _) = archive_auth(&handle)?;
    let path = archive_dir(&app)
        .map_err(|_| archive_error())?
        .join("archive.sqlite3");
    tokio::task::spawn_blocking(move || {
        Archive::open(&path)?.account_posts(&handle, &origin, &remote_id, offset)
    })
    .await
    .map_err(|_| archive_error())?
    .map_err(|_| archive_error())
}

#[tauri::command]
pub async fn archive_fetch_account_page(
    app: tauri::AppHandle,
    handle: String,
    remote_id: String,
    older: bool,
) -> Result<usize, Failure> {
    if remote_id.is_empty()
        || remote_id.len() > 64
        || !remote_id.bytes().all(|b| b.is_ascii_digit())
    {
        return Err(failure("policy", "Invalid account id."));
    }
    let _permit = PROFILE_FETCH.try_acquire().map_err(|_| {
        failure(
            "busy",
            "Another profile page is being fetched. Retry shortly.",
        )
    })?;
    let (origin, _) = archive_auth(&handle)?;
    let path = archive_dir(&app)
        .map_err(|_| archive_error())?
        .join("archive.sqlite3");
    let cursor = if older {
        let cursor_handle = handle.clone();
        let cursor_origin = origin.clone();
        let cursor_id = remote_id.clone();
        let cursor_path = path.clone();
        tokio::task::spawn_blocking(move || {
            Archive::open(&cursor_path)?.oldest_account_post_id(
                &cursor_handle,
                &cursor_origin,
                &cursor_id,
            )
        })
        .await
        .map_err(|_| archive_error())?
        .map_err(|_| archive_error())?
    } else {
        None
    };
    let mut url = Url::parse(&origin).map_err(|_| archive_error())?;
    url.set_path(&format!("/api/v1/accounts/{remote_id}/statuses"));
    url.query_pairs_mut().append_pair("limit", "40");
    if let Some(cursor) = cursor {
        if cursor.is_empty() || cursor.len() > 64 || !cursor.bytes().all(|b| b.is_ascii_digit()) {
            return Err(failure("archive", "Saved profile cursor is invalid."));
        }
        url.query_pairs_mut().append_pair("max_id", &cursor);
    }
    let response = tokio::time::timeout(
        Duration::from_secs(20),
        account_read(url.to_string(), handle.clone()),
    )
    .await
    .map_err(|_| failure("timeout", "Profile fetch timed out."))??;
    if response.status != 200 {
        return Err(failure(
            "network",
            "Could not fetch this profile page. The server may be limiting requests.",
        ));
    }
    let body = response.body;
    tokio::task::spawn_blocking(move || {
        Archive::open(&path)?.observe(&handle, &origin, "profile", &body)
    })
    .await
    .map_err(|_| archive_error())?
    .map_err(|_| archive_error())
}

// --- Analytics: catch-up, cached history, persisted boosters ---

/// Most status pages one catch-up spends; an unfinished one resumes next time.
const CATCH_UP_MAX_PAGES: usize = 10;
/// With an empty cache, read at least this many pages so analytics has a sample.
const CATCH_UP_MIN_PAGES_COLD: usize = 3;
/// Posts younger than this are re-read so their counts stay fresh.
const RECOUNT_DAYS: i64 = 14;
/// Booster pages (80 each) per post. Boosts beyond fall back to the model constant.
const BOOSTER_MAX_PAGES: usize = 5;
/// Pause between consecutive pages of one job: be a good citizen.
const PAGE_GAP: Duration = Duration::from_millis(1000);
static BOOSTER_FETCH: Semaphore = Semaphore::const_new(1);

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CatchUpReport {
    pages: usize,
    saved: usize,
    complete: bool,
    rate_limited: bool,
}

fn valid_remote_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 64 && id.bytes().all(|b| b.is_ascii_digit())
}

async fn with_archive<T, F>(app: &tauri::AppHandle, work: F) -> Result<T, Failure>
where
    T: Send + 'static,
    F: FnOnce(&mut Archive) -> anyhow::Result<T> + Send + 'static,
{
    let path = archive_dir(app)
        .map_err(|_| archive_error())?
        .join("archive.sqlite3");
    tokio::task::spawn_blocking(move || work(&mut Archive::open(&path)?))
        .await
        .map_err(|_| archive_error())?
        .map_err(|_| archive_error())
}

/// Where a catch-up stops: past the recount window, and (when resuming or with
/// a cache) at the cached edge. A short page is the end of the history.
fn catch_up_done(
    page_len: usize,
    oldest_created: &str,
    cutoff: &str,
    stop_at: Option<&str>,
    pages: usize,
) -> bool {
    if page_len < 40 {
        return true;
    }
    let reached_cache = match stop_at {
        Some(edge) => oldest_created <= edge,
        None => pages >= CATCH_UP_MIN_PAGES_COLD,
    };
    oldest_created < cutoff && reached_cache
}

/// Read an account's newest posts until they meet the cache and pass the
/// recount window, saving every page (which refreshes counts and records own
/// count snapshots). Resumes an earlier run that hit its page cap, so a long
/// absence never leaves a hole between the new posts and the cache.
#[tauri::command]
pub async fn archive_analytics_catch_up(
    app: tauri::AppHandle,
    handle: String,
    remote_id: String,
) -> Result<CatchUpReport, Failure> {
    if !valid_remote_id(&remote_id) {
        return Err(failure("policy", "Invalid account id."));
    }
    let _permit = PROFILE_FETCH.try_acquire().map_err(|_| {
        failure(
            "busy",
            "Another profile page is being fetched. Retry shortly.",
        )
    })?;
    let (origin, _) = archive_auth(&handle)?;
    let (h, o, r) = (handle.clone(), origin.clone(), remote_id.clone());
    let (resume, newest, cutoff) = with_archive(&app, move |a| {
        Ok((
            a.analytics_cursor(&h, &o, &r)?,
            a.newest_account_post_created(&h, &o, &r)?,
            a.recount_cutoff(RECOUNT_DAYS)?,
        ))
    })
    .await?;
    let stop_at = match &resume {
        Some(cursor) => cursor.stop_at.clone(),
        None => newest,
    };
    let mut max_id = resume.map(|cursor| cursor.max_id);
    let mut report = CatchUpReport {
        pages: 0,
        saved: 0,
        complete: false,
        rate_limited: false,
    };
    let mut failed = false;
    while report.pages < CATCH_UP_MAX_PAGES {
        if report.pages > 0 {
            tokio::time::sleep(PAGE_GAP).await;
        }
        let mut url = Url::parse(&origin).map_err(|_| archive_error())?;
        url.set_path(&format!("/api/v1/accounts/{remote_id}/statuses"));
        url.query_pairs_mut().append_pair("limit", "40");
        if let Some(cursor) = &max_id {
            url.query_pairs_mut().append_pair("max_id", cursor);
        }
        count_request(&app, &handle, &origin, "analytics").await?;
        let response = tokio::time::timeout(
            Duration::from_secs(20),
            account_read(url.to_string(), handle.clone()),
        )
        .await
        .map_err(|_| failure("timeout", "Profile fetch timed out."))??;
        report.pages += 1;
        if response.status == 429 {
            report.rate_limited = true;
            break;
        }
        if response.status != 200 {
            failed = true;
            break;
        }
        let page: Vec<Value> = serde_json::from_str(&response.body).unwrap_or_default();
        let (h, o, body) = (handle.clone(), origin.clone(), response.body);
        report.saved += with_archive(&app, move |a| a.observe(&h, &o, "profile", &body)).await?;
        let Some(oldest) = page.last() else {
            report.complete = true;
            break;
        };
        let oldest_created = oldest
            .get("created_at")
            .and_then(Value::as_str)
            .unwrap_or("");
        let oldest_id = oldest.get("id").and_then(Value::as_str).unwrap_or("");
        if catch_up_done(
            page.len(),
            oldest_created,
            &cutoff,
            stop_at.as_deref(),
            report.pages,
        ) || !valid_remote_id(oldest_id)
        {
            report.complete = true;
            break;
        }
        max_id = Some(oldest_id.to_owned());
    }
    let cursor = match (&max_id, report.complete) {
        (Some(max_id), false) => Some(CatchUpCursor {
            max_id: max_id.clone(),
            stop_at: stop_at.clone(),
        }),
        _ => None,
    };
    let (h, o, r) = (handle.clone(), origin.clone(), remote_id.clone());
    let saved = report.saved as i64;
    with_archive(&app, move |a| {
        a.save_analytics_cursor(&h, &o, &r, cursor.as_ref())?;
        a.record_collector_saved(&h, &o, "analytics", saved)
    })
    .await?;
    if failed {
        count_problem(&app, &handle, &origin, "analytics", "http").await;
        return Err(failure(
            "network",
            "Could not fetch this profile page. The server may be limiting requests.",
        ));
    }
    Ok(report)
}

/// An account's statuses from the archive (own posts and boosts), newest first.
#[tauri::command]
pub async fn archive_analytics_posts(
    app: tauri::AppHandle,
    handle: String,
    remote_id: String,
    limit: i64,
) -> Result<Vec<Value>, Failure> {
    let (origin, _) = archive_auth(&handle)?;
    with_archive(&app, move |a| {
        a.analytics_posts(&handle, &origin, &remote_id, limit)
    })
    .await
}

/// Who boosted a post: from the archive while its boost count is unchanged,
/// otherwise looked up (up to five pages, a second apart) and saved.
#[tauri::command]
pub async fn archive_post_boosters(
    app: tauri::AppHandle,
    handle: String,
    post_id: String,
) -> Result<Vec<Value>, Failure> {
    if !valid_remote_id(&post_id) {
        return Err(failure("policy", "Invalid post id."));
    }
    // One lookup at a time across the app; callers queue rather than fail.
    let _permit = BOOSTER_FETCH.acquire().await.map_err(|_| archive_error())?;
    let (origin, _) = archive_auth(&handle)?;
    let (h, o, p) = (handle.clone(), origin.clone(), post_id.clone());
    let cache = with_archive(&app, move |a| a.cached_boosters(&h, &o, &p)).await?;
    if let Some(boosters) = cache.boosters {
        return Ok(boosters);
    }
    let mut post_known = cache.post_known;
    if !post_known {
        // Save the post first so its boosters have somewhere to live.
        let mut url = Url::parse(&origin).map_err(|_| archive_error())?;
        url.set_path(&format!("/api/v1/statuses/{post_id}"));
        count_request(&app, &handle, &origin, "analytics").await?;
        let response = account_read(url.to_string(), handle.clone()).await?;
        if response.status == 429 {
            return Err(failure("rate_limited", "The server asked to slow down."));
        }
        if response.status == 200 {
            let (h, o, body) = (handle.clone(), origin.clone(), response.body);
            post_known = with_archive(&app, move |a| a.observe(&h, &o, "status", &body)).await? > 0;
        }
    }
    let path = format!("/api/v1/statuses/{post_id}/reblogged_by");
    let mut boosters: Vec<Value> = Vec::new();
    let mut max_id: Option<String> = None;
    for page in 0..BOOSTER_MAX_PAGES {
        if page > 0 {
            tokio::time::sleep(PAGE_GAP).await;
        }
        let mut url = Url::parse(&origin).map_err(|_| archive_error())?;
        url.set_path(&path);
        url.query_pairs_mut().append_pair("limit", "80");
        if let Some(cursor) = &max_id {
            url.query_pairs_mut().append_pair("max_id", cursor);
        }
        count_request(&app, &handle, &origin, "analytics").await?;
        let response = account_read(url.to_string(), handle.clone()).await?;
        if response.status == 429 {
            if boosters.is_empty() {
                return Err(failure("rate_limited", "The server asked to slow down."));
            }
            break;
        }
        if response.status != 200 {
            if boosters.is_empty() {
                return Err(failure(
                    "network",
                    "This server did not share who boosted the post.",
                ));
            }
            break;
        }
        let rows: Vec<Value> = serde_json::from_str(&response.body).unwrap_or_default();
        let len = rows.len();
        boosters.extend(rows);
        let link = response.headers.get("link").cloned();
        match following_cursor(link.as_deref(), &origin, &path, len) {
            Ok(Some(next)) if len > 0 => max_id = Some(next),
            _ => break,
        }
    }
    if post_known {
        let (h, o, p, rows) = (
            handle.clone(),
            origin.clone(),
            post_id.clone(),
            boosters.clone(),
        );
        with_archive(&app, move |a| a.save_boosters(&h, &o, &p, &rows)).await?;
    }
    Ok(boosters)
}

/// The signed-in account's follower history. Archive only; no requests.
#[tauri::command]
pub async fn archive_analytics_history(
    app: tauri::AppHandle,
    handle: String,
) -> Result<AudienceHistory, Failure> {
    let (origin, _) = archive_auth(&handle)?;
    with_archive(&app, move |a| a.analytics_history(&handle, &origin)).await
}

/// Who reacted to the signed-in account in the last `days` days (≤ 365).
/// Archive only; no requests.
#[tauri::command]
pub async fn archive_engagers(
    app: tauri::AppHandle,
    handle: String,
    days: i64,
) -> Result<Vec<EngagerRow>, Failure> {
    let (origin, _) = archive_auth(&handle)?;
    with_archive(&app, move |a| a.engagers(&handle, &origin, days)).await
}

/// Timed likes, boosts, mentions and follows from the last `days` days (≤ 365),
/// where the archive has no gap. Archive only; no requests.
#[tauri::command]
pub async fn archive_reactions(
    app: tauri::AppHandle,
    handle: String,
    days: i64,
) -> Result<TimedReactions, Failure> {
    let (origin, _) = archive_auth(&handle)?;
    with_archive(&app, move |a| a.timed_reactions(&handle, &origin, days)).await
}

/// When a post's engagement arrived. Archive only; no requests.
#[tauri::command]
pub async fn archive_post_activity(
    app: tauri::AppHandle,
    handle: String,
    post_id: String,
) -> Result<PostActivity, Failure> {
    if !valid_remote_id(&post_id) {
        return Err(failure("policy", "Invalid post id."));
    }
    let (origin, _) = archive_auth(&handle)?;
    with_archive(&app, move |a| a.post_activity(&handle, &origin, &post_id)).await
}

#[tauri::command]
pub async fn archive_mark_read(
    app: tauri::AppHandle,
    handle: String,
    post_id: i64,
) -> Result<(), Failure> {
    let (origin, _) = archive_auth(&handle)?;
    let path = archive_dir(&app)
        .map_err(|_| archive_error())?
        .join("archive.sqlite3");
    tokio::task::spawn_blocking(move || Archive::open(&path)?.mark_read(&handle, &origin, post_id))
        .await
        .map_err(|_| archive_error())?
        .map_err(|_| archive_error())
}

#[tauri::command]
pub async fn archive_mark_read_batch(
    app: tauri::AppHandle,
    handle: String,
    post_ids: Vec<i64>,
) -> Result<(), Failure> {
    let (origin, _) = archive_auth(&handle)?;
    let path = archive_dir(&app)
        .map_err(|_| archive_error())?
        .join("archive.sqlite3");
    tokio::task::spawn_blocking(move || {
        Archive::open(&path)?.mark_read_batch(&handle, &origin, &post_ids)
    })
    .await
    .map_err(|_| archive_error())?
    .map_err(|_| archive_error())
}

fn archive_error() -> Failure {
    failure(
        "archive",
        "Could not update the local archive. See Help > Open logs.",
    )
}

fn following_cursor(
    link: Option<&str>,
    origin: &str,
    path: &str,
    page_len: usize,
) -> Result<Option<String>, Failure> {
    if let Some(header) = link {
        for part in header.split(',') {
            if !part.to_ascii_lowercase().contains("rel=\"next\"")
                && !part.to_ascii_lowercase().contains("rel=next")
            {
                continue;
            }
            let raw = part
                .trim()
                .strip_prefix('<')
                .and_then(|s| s.split_once('>'))
                .map(|(s, _)| s)
                .ok_or_else(|| failure("pagination", "Invalid following cursor from server."))?;
            let url = Url::parse(raw)
                .map_err(|_| failure("pagination", "Invalid following cursor from server."))?;
            if url.origin().ascii_serialization() != origin || url.path() != path {
                return Err(failure(
                    "pagination",
                    "Following cursor changed server or path.",
                ));
            }
            let cursor = url
                .query_pairs()
                .find(|(key, _)| key == "max_id")
                .map(|(_, value)| value.into_owned())
                .filter(|value| {
                    !value.is_empty()
                        && value.len() <= 128
                        && value.bytes().all(|b| b.is_ascii_digit())
                })
                .ok_or_else(|| failure("pagination", "Invalid following cursor from server."))?;
            return Ok(Some(cursor));
        }
        return Ok(None);
    }
    if page_len == FOLLOW_PAGE_SIZE {
        return Err(failure(
            "pagination",
            "Following list is partial: server omitted the next cursor.",
        ));
    }
    Ok(None)
}

async fn get_json(url: Url, token: &str) -> Result<PublicResponse, Failure> {
    let response = client_for(&url)
        .await?
        .get(url)
        .bearer_auth(token)
        .header("Accept", "application/json")
        .header("Accept-Encoding", "identity")
        .send()
        .await
        .map_err(|_| failure("network", "Archive request failed. See Help > Open logs."))?;
    read_json(response).await
}

fn json_value(response: PublicResponse) -> Result<Value, Failure> {
    if response.status != 200 {
        return Err(failure("provider", "Mastodon declined the archive read."));
    }
    serde_json::from_str(&response.body)
        .map_err(|_| failure("response", "Mastodon returned invalid archive data."))
}

fn parse_following(value: &Value) -> Result<Vec<FollowedActor>, Failure> {
    let rows = value
        .as_array()
        .ok_or_else(|| failure("response", "Invalid following list."))?;
    if rows.len() > FOLLOW_PAGE_SIZE {
        return Err(failure(
            "response",
            "Following page exceeded the requested size.",
        ));
    }
    rows.iter()
        .map(|row| {
            let field = |name: &str| row.get(name).and_then(Value::as_str);
            let remote_id = field("id")
                .filter(|s| !s.is_empty())
                .ok_or_else(|| failure("response", "Following account lacks an ID."))?;
            let acct = field("acct")
                .ok_or_else(|| failure("response", "Following account lacks a handle."))?;
            Ok(FollowedActor {
                remote_id: remote_id.into(),
                acct: acct.into(),
                display_name: field("display_name").unwrap_or("").into(),
                last_status_at: field("last_status_at").map(str::to_owned),
                profile_json: Some(row.to_string()),
            })
        })
        .collect()
}

async fn get_follow_page(
    app: &tauri::AppHandle,
    handle: &str,
    origin: &str,
    job: &'static str,
    url: Url,
    token: &str,
) -> Result<PublicResponse, Failure> {
    for attempt in 0..3 {
        count_request(app, handle, origin, job).await?;
        let response = match get_json(url.clone(), token).await {
            Ok(response) => response,
            Err(error) => {
                count_problem(app, handle, origin, job, "network").await;
                return Err(error);
            }
        };
        if response.status != 429 {
            if response.status != 200 {
                count_problem(app, handle, origin, job, "provider").await;
                return Err(failure("provider", "Mastodon declined the archive read."));
            }
            return Ok(response);
        }
        if attempt == 2 {
            break;
        }
        let delay = response
            .headers
            .get("retry-after")
            .and_then(|value| value.parse::<u64>().ok())
            .unwrap_or(30);
        if delay > 120 {
            break;
        }
        tokio::time::sleep(Duration::from_secs(delay.max(1))).await;
    }
    count_problem(app, handle, origin, job, "rate_limit").await;
    Err(failure(
        "rate_limit",
        "Mastodon rate limit reached; resume later.",
    ))
}

/// A complete native-only following inventory. The IPC future is asynchronous,
/// so other app work continues; each page and cursor commit atomically.
#[tauri::command]
pub async fn archive_collect_following(
    app: tauri::AppHandle,
    handle: String,
) -> Result<FollowReport, Failure> {
    let _permit = ARCHIVE_COLLECTOR
        .try_acquire()
        .map_err(|_| failure("busy", "Following inventory is already running."))?;
    let _job = ActiveJob::start(&handle, 1);
    let (origin, token) = archive_auth(&handle)?;
    let verify_url = Url::parse(&format!("{origin}/api/v1/accounts/verify_credentials"))
        .map_err(|_| failure("credentials", "Stored server address is invalid."))?;
    let me = json_value(get_json(verify_url, &token).await?)?;
    let my_id = me
        .get("id")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty() && s.bytes().all(|b| b.is_ascii_digit()))
        .ok_or_else(|| failure("response", "Mastodon account lacks a valid ID."))?
        .to_owned();
    let path = format!("/api/v1/accounts/{my_id}/following");
    let db_path = archive_dir(&app)
        .map_err(|_| archive_error())?
        .join("archive.sqlite3");
    let origin_for_db = origin.clone();
    let my_id_for_db = my_id.clone();
    let handle_for_db = handle.clone();
    let (identity_id, generation, mut cursor) = tokio::task::spawn_blocking(move || {
        let mut archive = Archive::open(&db_path)?;
        let id = archive.identity("mastodon", &origin_for_db, &my_id_for_db)?;
        archive.bind_handle(id, &handle_for_db)?;
        let (generation, cursor) = archive.follow_scan(id)?;
        Ok::<_, anyhow::Error>((id, generation, cursor))
    })
    .await
    .map_err(|_| archive_error())?
    .map_err(|_| archive_error())?;
    let mut seen_cursors = HashSet::new();
    let mut relationship_available = true;
    for _ in 0..MAX_FOLLOW_PAGES {
        if let Some(value) = &cursor {
            if !seen_cursors.insert(value.clone()) {
                return Err(failure(
                    "pagination",
                    "Following cursor repeated; inventory is partial.",
                ));
            }
        }
        let mut url = Url::parse(&format!("{origin}{path}"))
            .map_err(|_| failure("credentials", "Stored server address is invalid."))?;
        {
            let mut query = url.query_pairs_mut();
            query.append_pair("limit", &FOLLOW_PAGE_SIZE.to_string());
            if let Some(value) = &cursor {
                query.append_pair("max_id", value);
            }
        }
        let response = get_follow_page(&app, &handle, &origin, "following", url, &token).await?;
        let link = response.headers.get("link").cloned();
        let page = parse_following(&json_value(response)?)?;
        let relationship_ids: Vec<String> =
            page.iter().map(|actor| actor.remote_id.clone()).collect();
        let page_count = page.len() as i64;
        let next = following_cursor(link.as_deref(), &origin, &path, page.len())?;
        let db_path = archive_dir(&app)
            .map_err(|_| archive_error())?
            .join("archive.sqlite3");
        let origin_for_db = origin.clone();
        let next_for_db = next.clone();
        tokio::task::spawn_blocking(move || {
            let mut archive = Archive::open(&db_path)?;
            archive.save_follow_page(
                identity_id,
                generation,
                &origin_for_db,
                &page,
                next_for_db.as_deref(),
            )
        })
        .await
        .map_err(|_| archive_error())?
        .map_err(|_| archive_error())?;
        let saved_path = archive_dir(&app)
            .map_err(|_| archive_error())?
            .join("archive.sqlite3");
        let saved_handle = handle.clone();
        let saved_origin = origin.clone();
        tokio::task::spawn_blocking(move || {
            Archive::open(&saved_path)?.record_collector_saved(
                &saved_handle,
                &saved_origin,
                "following",
                page_count,
            )
        })
        .await
        .map_err(|_| archive_error())?
        .map_err(|_| archive_error())?;
        // The following inventory is durable even if this optional evidence
        // read fails. A later pass or ordinary relationship reads can fill it.
        for batch in relationship_ids.chunks(40) {
            if !relationship_available {
                break;
            }
            let mut url = Url::parse(&format!("{origin}/api/v1/accounts/relationships"))
                .map_err(|_| archive_error())?;
            for id in batch {
                url.query_pairs_mut().append_pair("id[]", id);
            }
            let observed = async {
                let body = json_value(
                    get_follow_page(&app, &handle, &origin, "relationships", url, &token).await?,
                )?
                .to_string();
                let db_path = archive_dir(&app)
                    .map_err(|_| archive_error())?
                    .join("archive.sqlite3");
                let handle = handle.clone();
                let origin = origin.clone();
                tokio::task::spawn_blocking(move || {
                    let mut archive = Archive::open(&db_path)?;
                    let saved = archive.observe(&handle, &origin, "relationships", &body)?;
                    archive.record_collector_saved(
                        &handle,
                        &origin,
                        "relationships",
                        saved as i64,
                    )?;
                    Ok::<_, anyhow::Error>(saved)
                })
                .await
                .map_err(|_| archive_error())?
                .map_err(|_| archive_error())
            }
            .await;
            if observed.is_err() {
                diagnostics::record("archive_relationships", "partial", None);
                relationship_available = false;
                break;
            }
            tokio::time::sleep(Duration::from_millis(250)).await;
        }
        cursor = next;
        if cursor.is_none() {
            let db_path = archive_dir(&app)
                .map_err(|_| archive_error())?
                .join("archive.sqlite3");
            let (following, known_zombies, unknown_activity) =
                tokio::task::spawn_blocking(move || {
                    Archive::open(&db_path)?.follow_counts(identity_id)
                })
                .await
                .map_err(|_| archive_error())?
                .map_err(|_| archive_error())?;
            return Ok(FollowReport {
                following,
                known_zombies,
                unknown_activity,
                complete: true,
            });
        }
        tokio::time::sleep(Duration::from_millis(250)).await;
    }
    Err(failure(
        "pagination",
        "Following inventory exceeded the page limit; it is partial.",
    ))
}

/// Inbound evidence is paged independently of any person's post history.
/// A bounded run resumes from its durable cursor on the next app session.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationReport {
    imported: usize,
    complete: bool,
}

/// One saved page of notifications.
struct NotificationPage {
    next: Option<String>,
    saved: usize,
    newest: Option<String>,
    oldest: Option<String>,
}

/// Numeric order for ids too long to trust to a machine integer.
fn id_order(id: &str) -> (usize, &str) {
    let digits = id.trim_start_matches('0');
    (digits.len(), digits)
}

/// Whether a page reaches back to notifications already joined to the past.
fn connects(oldest: Option<&str>, mark: Option<&str>) -> bool {
    matches!((oldest, mark), (Some(oldest), Some(mark)) if id_order(oldest) <= id_order(mark))
}

async fn collect_notification_page(
    app: &tauri::AppHandle,
    handle: &str,
    origin: &str,
    token: &str,
    cursor: Option<&str>,
    save_history_cursor: bool,
) -> Result<NotificationPage, Failure> {
    let path = "/api/v1/notifications";
    let mut url = Url::parse(&format!("{origin}{path}")).map_err(|_| archive_error())?;
    {
        let mut query = url.query_pairs_mut();
        query.append_pair("limit", &NOTIFICATION_PAGE_SIZE.to_string());
        if let Some(value) = cursor {
            query.append_pair("max_id", value);
        }
    }
    let response = get_follow_page(app, handle, origin, "notifications", url, token).await?;
    let link = response.headers.get("link").cloned();
    let value = json_value(response)?;
    let rows = value
        .as_array()
        .ok_or_else(|| failure("response", "Invalid notifications page."))?;
    if rows.len() > NOTIFICATION_PAGE_SIZE
        || rows.iter().any(|row| {
            row.get("id")
                .and_then(Value::as_str)
                .is_none_or(|id| id.is_empty() || !id.bytes().all(|b| b.is_ascii_digit()))
                || row.get("created_at").and_then(Value::as_str).is_none()
                || row.get("type").and_then(Value::as_str).is_none()
                || row
                    .get("account")
                    .and_then(|account| account.get("id"))
                    .and_then(Value::as_str)
                    .is_none_or(|id| {
                        id.is_empty() || id.len() > 64 || !id.bytes().all(|b| b.is_ascii_digit())
                    })
        })
    {
        return Err(failure(
            "response",
            "Invalid notifications page; backfill paused.",
        ));
    }
    let next = following_cursor(link.as_deref(), origin, path, rows.len())
        .map_err(|_| failure("pagination", "Invalid notification cursor from server."))?;
    let ids = || {
        rows.iter()
            .filter_map(|row| row.get("id").and_then(Value::as_str))
    };
    let newest = ids().max_by_key(|id| id_order(id)).map(str::to_owned);
    let oldest = ids().min_by_key(|id| id_order(id)).map(str::to_owned);
    let db_path = archive_dir(app)
        .map_err(|_| archive_error())?
        .join("archive.sqlite3");
    let body = value.to_string();
    let save_handle = handle.to_owned();
    let save_origin = origin.to_owned();
    let next_for_db = next.clone();
    let count = tokio::task::spawn_blocking(move || {
        let mut archive = Archive::open(&db_path)?;
        let count = archive.observe(&save_handle, &save_origin, "notifications", &body)?;
        archive.record_collector_saved(
            &save_handle,
            &save_origin,
            "notifications",
            count as i64,
        )?;
        if save_history_cursor {
            archive.save_notification_cursor(&save_handle, &save_origin, next_for_db.as_deref())?;
        }
        Ok::<_, anyhow::Error>(count)
    })
    .await
    .map_err(|_| archive_error())?
    .map_err(|_| archive_error())?;
    Ok(NotificationPage {
        next,
        saved: count,
        newest,
        oldest,
    })
}

#[tauri::command]
pub async fn archive_collect_notifications(
    app: tauri::AppHandle,
    handle: String,
) -> Result<NotificationReport, Failure> {
    let _permit = ARCHIVE_COLLECTOR
        .try_acquire()
        .map_err(|_| failure("busy", "Another archive collection is running."))?;
    let _job = ActiveJob::start(&handle, 2);
    let (origin, token) = archive_auth(&handle)?;
    let verify_url = Url::parse(&format!("{origin}/api/v1/accounts/verify_credentials"))
        .map_err(|_| archive_error())?;
    let verified = json_value(get_json(verify_url, &token).await?)?.to_string();
    let db_path = archive_dir(&app)
        .map_err(|_| archive_error())?
        .join("archive.sqlite3");
    let cursor_handle = handle.clone();
    let cursor_origin = origin.clone();
    let cursor_path = db_path.clone();
    let (saved_cursor, mark) = tokio::task::spawn_blocking(move || {
        let mut archive = Archive::open(&cursor_path)?;
        archive.observe(&cursor_handle, &cursor_origin, "verify", &verified)?;
        Ok::<_, anyhow::Error>((
            archive.notification_cursor(&cursor_handle, &cursor_origin)?,
            archive.notification_mark(&cursor_handle, &cursor_origin)?,
        ))
    })
    .await
    .map_err(|_| archive_error())?
    .map_err(|_| archive_error())?;
    let mut imported = 0;
    // Read the newest pages first, until they meet what earlier runs joined up.
    // New interactions must not wait for a deep backfill, and stopping short
    // would leave a hole that nothing later fills.
    let mut newest = None;
    let mut fresh_cursor: Option<String> = None;
    let mut fresh_seen = HashSet::new();
    let mut connected = false;
    for _ in 0..MAX_NOTIFICATION_PAGES_PER_RUN {
        let page = collect_notification_page(
            &app,
            &handle,
            &origin,
            &token,
            fresh_cursor.as_deref(),
            false,
        )
        .await?;
        imported += page.saved;
        newest = newest.or(page.newest);
        connected = connects(page.oldest.as_deref(), mark.as_deref());
        fresh_cursor = page.next;
        if connected || fresh_cursor.is_none() {
            break;
        }
        if let Some(value) = &fresh_cursor {
            if !fresh_seen.insert(value.clone()) {
                return Err(failure(
                    "pagination",
                    "Notification cursor repeated; backfill paused.",
                ));
            }
        }
        tokio::time::sleep(Duration::from_secs(1)).await;
    }
    let reached_end = fresh_cursor.is_none();
    if let Some(newest) = newest {
        let (h, o) = (handle.clone(), origin.clone());
        // Not joined: the backfill restarts here and walks down through the
        // gap. Reading to the very end joins everything by definition.
        let restart = (!connected).then_some(fresh_cursor);
        with_archive(&app, move |a| {
            a.save_notification_mark(
                &h,
                &o,
                &newest,
                restart.as_ref().map(|cursor| cursor.as_deref()),
            )
        })
        .await?;
        if !connected {
            return Ok(NotificationReport {
                imported,
                complete: reached_end,
            });
        }
    }
    if saved_cursor == Some(None) {
        return Ok(NotificationReport {
            imported,
            complete: true,
        });
    }
    let mut cursor = saved_cursor.flatten();
    let mut seen_cursors = HashSet::new();
    for _ in 0..MAX_NOTIFICATION_PAGES_PER_RUN {
        if let Some(value) = &cursor {
            if !seen_cursors.insert(value.clone()) {
                return Err(failure(
                    "pagination",
                    "Notification cursor repeated; backfill paused.",
                ));
            }
        }
        let page =
            collect_notification_page(&app, &handle, &origin, &token, cursor.as_deref(), true)
                .await?;
        imported += page.saved;
        cursor = page.next;
        if cursor.is_none() {
            return Ok(NotificationReport {
                imported,
                complete: true,
            });
        }
        tokio::time::sleep(Duration::from_secs(1)).await;
    }
    Ok(NotificationReport {
        imported,
        complete: false,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn new_notifications_connect_only_when_they_reach_the_mark() {
        assert!(!connects(Some("5"), None));
        assert!(!connects(None, Some("5")));
        assert!(!connects(Some("100"), Some("99")));
        assert!(connects(Some("99"), Some("99")));
        assert!(connects(Some("99"), Some("100")));
        // Longer than any integer type, and zero padded.
        assert!(connects(
            Some(&"9".repeat(40)),
            Some(&format!("1{}", "0".repeat(40)))
        ));
        assert!(connects(Some("007"), Some("7")));
    }

    fn actor(id: &str, last_status_at: Option<&str>) -> FollowedActor {
        FollowedActor {
            remote_id: id.into(),
            acct: format!("{id}@example.com"),
            display_name: id.into(),
            last_status_at: last_status_at.map(str::to_owned),
            profile_json: None,
        }
    }

    #[test]
    fn scans_resume_and_keep_accounts_separate() {
        let mut archive = Archive::open(Path::new(":memory:")).unwrap();
        let a = archive
            .identity("mastodon", "https://example.com", "self-a")
            .unwrap();
        archive.bind_handle(a, "native-mastodon:a").unwrap();
        let b = archive
            .identity("mastodon", "https://example.com", "self-b")
            .unwrap();
        archive.bind_handle(b, "native-mastodon:b").unwrap();
        let (gen, cursor) = archive.follow_scan(a).unwrap();
        assert_eq!((gen, cursor), (1, None));
        let mut old = actor("old", Some("2020-01-01T00:00:00Z"));
        old.profile_json = Some(r#"{"id":"old","bot":true}"#.into());
        archive
            .save_follow_page(
                a,
                gen,
                "https://example.com",
                &[old, actor("unknown", None)],
                Some("page-2"),
            )
            .unwrap();
        assert_eq!(archive.follow_scan(a).unwrap(), (1, Some("page-2".into())));
        archive
            .save_follow_page(
                a,
                gen,
                "https://example.com",
                &[actor("shared", Some("2026-11-01T00:00:00Z"))],
                None,
            )
            .unwrap();
        assert_eq!(archive.follow_counts(a).unwrap(), (3, 1, 1));
        let zombies = archive
            .people_members("native-mastodon:a", "https://example.com", "zombies")
            .unwrap();
        assert_eq!(zombies.len(), 1);
        assert_eq!(zombies[0].remote_id, "old");
        assert_eq!(zombies[0].cached_posts, 0);
        assert_eq!(
            archive
                .people_members("native-mastodon:a", "https://example.com", "bots")
                .unwrap()[0]
                .remote_id,
            "old"
        );
        let status = archive
            .follow_status("https://example.com", "native-mastodon:a")
            .unwrap()
            .unwrap();
        assert_eq!(status.following, 3);
        assert!(status.complete);
        assert!(
            archive
                .follow_status("https://example.com", "native-mastodon:b")
                .unwrap()
                .unwrap()
                .following
                == 0
        );
        let (gen_b, _) = archive.follow_scan(b).unwrap();
        archive
            .save_follow_page(
                b,
                gen_b,
                "https://example.com",
                &[actor("shared", None)],
                None,
            )
            .unwrap();
        // Account B's unknown activity cannot inherit A's cached timestamp.
        assert_eq!(archive.follow_counts(b).unwrap(), (1, 0, 1));
        let (next, _) = archive.follow_scan(a).unwrap();
        archive
            .save_follow_page(
                a,
                next,
                "https://example.com",
                &[actor("shared", None)],
                None,
            )
            .unwrap();
        assert_eq!(archive.follow_counts(a).unwrap(), (1, 0, 0));
        assert_eq!(archive.follow_counts(b).unwrap(), (1, 0, 1));
    }

    #[test]
    fn catch_up_stops_at_the_cache_edge_after_the_recount_window() {
        let cutoff = "2026-11-06T00:00:00Z";
        let edge = Some("2026-11-10T00:00:00Z");
        // A short page is the end of the account's history.
        assert!(catch_up_done(12, "2026-11-19T00:00:00Z", cutoff, edge, 1));
        // Inside the recount window: keep reading even past the cache edge.
        assert!(!catch_up_done(40, "2026-11-08T00:00:00Z", cutoff, edge, 1));
        // Past the window but not yet back to the cache: there is a gap to fill.
        assert!(!catch_up_done(
            40,
            "2026-11-12T00:00:00Z",
            "2026-11-15T00:00:00Z",
            edge,
            1
        ));
        // Past both.
        assert!(catch_up_done(40, "2026-11-01T00:00:00Z", cutoff, edge, 1));
        // An empty cache needs a minimum sample before stopping.
        assert!(!catch_up_done(40, "2026-10-01T00:00:00Z", cutoff, None, 2));
        assert!(catch_up_done(40, "2026-10-01T00:00:00Z", cutoff, None, 3));
    }

    #[test]
    fn following_cursor_requires_server_pagination_evidence() {
        let origin = "https://example.com";
        let path = "/api/v1/accounts/42/following";
        let link = format!("<{origin}{path}?limit=80&max_id=123>; rel=\"next\"");
        assert_eq!(
            following_cursor(Some(&link), origin, path, 80).unwrap(),
            Some("123".into())
        );
        assert!(following_cursor(None, origin, path, 80).is_err());
        assert_eq!(following_cursor(None, origin, path, 20).unwrap(), None);
        let notifications = "/api/v1/notifications";
        let notification_link =
            format!("<{origin}{notifications}?limit=80&max_id=456>; rel=\"next\"");
        assert_eq!(
            following_cursor(Some(&notification_link), origin, notifications, 80).unwrap(),
            Some("456".into())
        );
        assert!(following_cursor(
            Some("<https://other.example/api/v1/accounts/42/following?max_id=123>; rel=\"next\""),
            origin,
            path,
            80
        )
        .is_err());
    }
}
