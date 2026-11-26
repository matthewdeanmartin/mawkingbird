//! Reviewed Mastodon account writes: a fixed method+path table, never a tunnel.
//!
//! Every write the shared UI makes is listed in `required_scope`. Anything else
//! (OAuth, sign-up, admin, media upload) is refused here, whatever the renderer asks.
use crate::{
    diagnostics::record,
    mastodon_login::account_credential,
    public_mastodon::{client_for, failure, read_json, validate_url, Failure, PublicResponse},
};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Deserialize;
use serde_json::Value;
use std::time::Duration;
use tokio::sync::Semaphore;
use url::Url;

static WRITES: Semaphore = Semaphore::const_new(8);
const MAX_BODY: usize = 512 * 1024;
const MAX_PICTURE: usize = 16 * 1024 * 1024;
static UPLOADS: Semaphore = Semaphore::const_new(4);

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PictureUpload {
    url: String,
    mime: String,
    data: String,
    #[serde(default)]
    description: String,
}

fn picture_body(input: &PictureUpload) -> Result<(Vec<u8>, String), Failure> {
    let denied = || {
        failure("policy", "Native uploads support PNG, JPEG, GIF and WebP pictures up to 16 MiB. Your server may have a lower limit.")
    };
    if input.data.len() > MAX_PICTURE.div_ceil(3) * 4 || input.description.len() > 64 * 1024 {
        return Err(denied());
    }
    let bytes = STANDARD.decode(&input.data).map_err(|_| denied())?;
    if bytes.is_empty() || bytes.len() > MAX_PICTURE {
        return Err(denied());
    }
    let extension = match input.mime.as_str() {
        "image/png" if bytes.starts_with(b"\x89PNG\r\n\x1a\n") => "png",
        "image/jpeg" if bytes.starts_with(b"\xff\xd8\xff") => "jpg",
        "image/gif" if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") => "gif",
        "image/webp" if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") => "webp",
        _ => return Err(denied()),
    };
    // Random boundary; never incorporate renderer-controlled header values.
    let boundary = format!("mawkingbird-{:032x}", rand::random::<u128>());
    let mut body = format!("--{boundary}\r\nContent-Disposition: form-data; name=\"description\"\r\n\r\n{}\r\n--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"picture.{extension}\"\r\nContent-Type: {}\r\n\r\n", input.description, input.mime).into_bytes();
    body.extend_from_slice(&bytes);
    body.extend_from_slice(format!("\r\n--{boundary}--\r\n").as_bytes());
    Ok((body, format!("multipart/form-data; boundary={boundary}")))
}

fn picture_target(input: &PictureUpload, origin: &str, scopes: &str) -> Result<Url, Failure> {
    if input.url.len() > 8192 || input.url.chars().any(char::is_control) {
        return Err(failure("policy", "Invalid upload destination."));
    }
    let mut target =
        Url::parse(&input.url).map_err(|_| failure("policy", "Invalid upload destination."))?;
    if target.path() != "/api/v2/media" {
        return Err(failure(
            "policy",
            "Only picture attachment uploads are supported.",
        ));
    }
    // Reuse same-origin, HTTPS, scope and query checks for existing media writes.
    target.set_path("/api/v1/media/upload");
    let checked = write_target(
        &AccountWrite {
            url: target.into(),
            method: "PUT".into(),
            body: None,
            form: None,
            idempotency_key: None,
        },
        origin,
        scopes,
    )?;
    let mut target = checked;
    target.set_path("/api/v2/media");
    Ok(target)
}

#[tauri::command]
pub async fn mastodon_picture_upload(
    handle: String,
    input: PictureUpload,
) -> Result<PublicResponse, Failure> {
    let _permit = UPLOADS.try_acquire().map_err(|_| {
        failure(
            "busy",
            "Four pictures are already uploading. Wait for them to finish and try again.",
        )
    })?;
    let (origin, token, scopes) = account_credential(&handle)?;
    let target = picture_target(&input, &origin, &scopes)?;
    let (body, content_type) = picture_body(&input)?;
    let client = client_for(&target).await?;
    let response = client
        .post(target.clone())
        .bearer_auth(&token)
        .header("Content-Type", content_type)
        .header("Accept", "application/json")
        .header("Accept-Encoding", "identity")
        .timeout(Duration::from_secs(120))
        .body(body)
        .send()
        .await
        .map_err(|_| {
            failure(
                "network",
                "Picture upload failed or timed out. Check your connection before trying again.",
            )
        })?;
    let uploaded = read_json(response).await?;
    tokio::time::timeout(
        Duration::from_secs(90),
        finish_picture(&client, &target, &token, uploaded, Duration::from_secs(2)),
    )
    .await
    .unwrap_or_else(|_| {
        Err(failure(
            "timeout",
            "The picture was uploaded but is still processing. Wait before trying again.",
        ))
    })
}

async fn finish_picture(
    client: &reqwest::Client,
    target: &Url,
    token: &str,
    mut response: PublicResponse,
    delay: Duration,
) -> Result<PublicResponse, Failure> {
    if !(200..300).contains(&response.status) {
        return Ok(response);
    }
    let uploaded: Value = serde_json::from_str(&response.body)
        .map_err(|_| failure("response", "Invalid picture upload response."))?;
    if uploaded["url"].as_str().is_some_and(|url| !url.is_empty()) {
        return Ok(response);
    }
    let media_id = uploaded["id"]
        .as_str()
        .filter(|value| id(value))
        .ok_or_else(|| failure("response", "Missing uploaded picture ID."))?;
    let mut poll = target.clone();
    poll.set_path(&format!("/api/v1/media/{media_id}"));
    for _ in 0..30 {
        tokio::time::sleep(delay).await;
        let next = client
            .get(poll.clone())
            .bearer_auth(token)
            .header("Accept", "application/json")
            .timeout(Duration::from_secs(15))
            .send()
            .await
            .map_err(|_| failure("network", "Could not check uploaded picture processing."))?;
        if next.status().as_u16() == 206 {
            continue;
        }
        response = read_json(next).await?;
        if !(200..300).contains(&response.status) {
            return Ok(response);
        }
        let value: Value = serde_json::from_str(&response.body)
            .map_err(|_| failure("response", "Invalid picture processing response."))?;
        if value["url"].as_str().is_some_and(|url| !url.is_empty()) {
            return Ok(response);
        }
    }
    Err(failure(
        "timeout",
        "The picture was uploaded but is still processing. Wait before trying again.",
    ))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AccountWrite {
    url: String,
    method: String,
    #[serde(default)]
    body: Option<Value>,
    /// Text form fields, for the endpoints documented as form-encoded.
    #[serde(default)]
    form: Option<Vec<(String, String)>>,
    #[serde(default)]
    idempotency_key: Option<String>,
}

fn id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 64
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

/// A percent-encoded name (hashtag, emoji); never a path separator in disguise.
fn name(value: &str) -> bool {
    let lower = value.to_ascii_lowercase();
    !value.is_empty()
        && value.len() <= 512
        && !["%2f", "%5c", "%00", "%2e"]
            .iter()
            .any(|bad| lower.contains(bad))
}

/// The OAuth scope a permitted write needs, or `None` when it is not permitted.
fn required_scope(method: &str, path: &str) -> Option<&'static str> {
    let parts: Vec<_> = path.strip_prefix("/api/")?.split('/').collect();
    Some(match (method, parts.as_slice()) {
        // Reuse attachments when redrafting: update their alt text and focal point.
        // Creating/uploading media remains outside this command.
        ("PUT", ["v1", "media", m]) if id(m) => "write:media",
        ("POST", ["v1", "statuses"]) => "write:statuses",
        ("PUT" | "DELETE", ["v1", "statuses", s]) if id(s) => "write:statuses",
        ("POST", ["v1", "statuses", s, action]) if id(s) => match *action {
            "favourite" | "unfavourite" => "write:favourites",
            "reblog" | "unreblog" => "write:statuses",
            "bookmark" | "unbookmark" => "write:bookmarks",
            "pin" | "unpin" => "write:accounts",
            "mute" | "unmute" => "write:mutes",
            "translate" => "read:statuses",
            _ => return None,
        },
        ("PUT", ["v1", "statuses", s, "interaction_policy"]) if id(s) => "write:statuses",
        ("POST", ["v1", "statuses", s, "quotes", q, "revoke"]) if id(s) && id(q) => {
            "write:statuses"
        }
        ("PUT" | "DELETE", ["v1", "scheduled_statuses", s]) if id(s) => "write:statuses",
        ("POST", ["v1", "polls", p, "votes"]) if id(p) => "write:statuses",
        ("POST", ["v1", "markers"]) => "write:statuses",
        ("POST", ["v1", "accounts", a, action]) if id(a) => match *action {
            "follow" | "unfollow" | "remove_from_followers" => "write:follows",
            "mute" | "unmute" => "write:mutes",
            "block" | "unblock" => "write:blocks",
            "note" | "endorse" | "unendorse" | "pin" | "unpin" => "write:accounts",
            _ => return None,
        },
        ("PATCH", ["v1", "accounts", "update_credentials"] | ["v1", "profile"]) => "write:accounts",
        ("DELETE", ["v1", "profile", "avatar" | "header"]) => "write:accounts",
        ("DELETE", ["v1", "suggestions", a]) if id(a) => "read",
        ("POST", ["v1", "follow_requests", a, "authorize" | "reject"]) if id(a) => "write:follows",
        ("POST", ["v1", "tags", t, "follow" | "unfollow"]) if name(t) => "write:follows",
        ("POST", ["v1", "tags", t, "feature" | "unfeature"]) if name(t) => "write:accounts",
        ("POST", ["v1", "lists"]) => "write:lists",
        ("PUT" | "DELETE", ["v1", "lists", l]) if id(l) => "write:lists",
        ("POST" | "DELETE", ["v1", "lists", l, "accounts"]) if id(l) => "write:lists",
        ("POST", ["v1", "collections"]) => "write:collections",
        ("PATCH" | "DELETE", ["v1", "collections", c]) if id(c) => "write:collections",
        ("POST", ["v1", "collections", c, "items"]) if id(c) => "write:collections",
        ("DELETE", ["v1", "collections", c, "items", i]) if id(c) && id(i) => "write:collections",
        ("POST", ["v1", "collections", c, "items", i, "revoke"]) if id(c) && id(i) => {
            "write:collections"
        }
        ("POST", ["v1", "notifications", n, "dismiss"]) if id(n) => "write:notifications",
        ("POST", ["v1", "conversations", c, "read" | "unread"]) if id(c) => "write:conversations",
        ("DELETE", ["v1", "conversations", c]) if id(c) => "write:conversations",
        ("POST", ["v1", "reports"]) => "write:reports",
        ("POST", ["v1", "announcements", a, "dismiss"]) if id(a) => "write:accounts",
        ("PUT" | "DELETE", ["v1", "announcements", a, "reactions", e]) if id(a) && name(e) => {
            "write:favourites"
        }
        ("POST", ["v1", "annual_reports", y, "generate"]) if id(y) => "write:accounts",
        ("POST" | "DELETE", ["v1", "domain_blocks"]) => "write:blocks",
        ("POST", ["v2", "filters"]) => "write:filters",
        ("DELETE", ["v2", "filters", "keywords" | "statuses", f]) if id(f) => "write:filters",
        ("POST", ["v2", "filters", f, "keywords" | "statuses"]) if id(f) => "write:filters",
        ("PUT" | "DELETE", ["v2", "filters", f]) if id(f) => "write:filters",
        _ => return None,
    })
}

fn granted(scopes: &str, needed: &str) -> bool {
    let top = needed.split(':').next().unwrap_or(needed);
    scopes.split_whitespace().any(|scope| {
        scope == needed
            || scope == top
            // Mastodon's older umbrella scope for relationships.
            || scope == "follow"
                && matches!(needed, "write:follows" | "write:mutes" | "write:blocks")
    })
}

fn write_target(input: &AccountWrite, origin: &str, scopes: &str) -> Result<Url, Failure> {
    let denied = || {
        failure(
            "policy",
            "This action is not supported by Mawkingbird Native yet.",
        )
    };
    if input.url.len() > 8192 || input.url.chars().any(char::is_control) {
        return Err(denied());
    }
    let target = Url::parse(&input.url).map_err(|_| denied())?;
    if target.origin().ascii_serialization() != origin || target.fragment().is_some() {
        return Err(failure(
            "policy",
            "Account requests must stay on their registered server.",
        ));
    }
    let mut server = target.clone();
    server.set_path("/api/v1/instance");
    server.set_query(None);
    validate_url(server.as_str())?;
    let needed = required_scope(&input.method, target.path()).ok_or_else(denied)?;
    // Unblocking a domain names it in the query; no other write takes one.
    if target.query().is_some() {
        let keys: Vec<_> = target.query_pairs().map(|(k, _)| k.into_owned()).collect();
        if !(input.method == "DELETE"
            && target.path() == "/api/v1/domain_blocks"
            && keys == ["domain"])
        {
            return Err(denied());
        }
    }
    if input.body.is_some() && input.form.is_some()
        || input
            .body
            .as_ref()
            .is_some_and(|b| !b.is_object() || b.to_string().len() > MAX_BODY)
        || input
            .form
            .as_ref()
            .is_some_and(|f| f.iter().map(|(k, v)| k.len() + v.len()).sum::<usize>() > MAX_BODY)
        || input.idempotency_key.as_ref().is_some_and(|key| {
            key.is_empty() || key.len() > 128 || !key.bytes().all(|b| b.is_ascii_graphic())
        })
    {
        return Err(failure("policy", "Invalid account request."));
    }
    if !granted(scopes, needed) {
        return Err(failure(
            "reauthorize",
            "This login is read-only. Reconnect this account with Full access.",
        ));
    }
    Ok(target)
}

fn write_request(
    client: reqwest::Client,
    target: Url,
    token: &str,
    input: &AccountWrite,
) -> Result<reqwest::RequestBuilder, Failure> {
    let method = match input.method.as_str() {
        "POST" => reqwest::Method::POST,
        "PUT" => reqwest::Method::PUT,
        "PATCH" => reqwest::Method::PATCH,
        "DELETE" => reqwest::Method::DELETE,
        _ => return Err(failure("policy", "Invalid account request.")),
    };
    let mut request = client
        .request(method, target)
        .timeout(Duration::from_secs(30))
        .bearer_auth(token)
        .header("Accept", "application/json")
        .header("Accept-Encoding", "identity");
    if let Some(key) = &input.idempotency_key {
        request = request.header("Idempotency-Key", key);
    }
    if let Some(body) = &input.body {
        request = request.json(body);
    } else if let Some(form) = &input.form {
        request = request.form(form);
    }
    Ok(request)
}

/// Keep this device's archive in step with what the account just did.
async fn observe(app: tauri::AppHandle, handle: String, target: &Url, method: &str, body: &str) {
    let parts: Vec<_> = target.path().trim_start_matches('/').split('/').collect();
    match (method, parts.as_slice()) {
        ("DELETE", ["api", "v1", "statuses", status]) => {
            crate::archive::observe_delete(
                app,
                handle,
                target.origin().ascii_serialization(),
                (*status).to_string(),
            )
            .await;
        }
        ("POST", ["api", "v1", "accounts", account, "follow" | "unfollow" | "block"]) => {
            crate::archive::observe_follow(
                app,
                handle,
                target.origin().ascii_serialization(),
                (*account).to_string(),
                body.to_string(),
            )
            .await;
        }
        ("POST", ["api", "v1", "statuses"]) | ("PUT", ["api", "v1", "statuses", _]) => {
            let Ok(value) = serde_json::from_str::<Value>(body) else {
                return;
            };
            // A scheduled post is not a post yet.
            let (Some(status), None) = (value["id"].as_str(), value.get("scheduled_at")) else {
                return;
            };
            if let Ok(url) = target.join(&format!("/api/v1/statuses/{status}")) {
                crate::archive::observe_read(app, handle, url.into(), body.to_string()).await;
            }
        }
        _ => {}
    }
}

async fn write(
    app: tauri::AppHandle,
    handle: String,
    input: AccountWrite,
) -> Result<PublicResponse, Failure> {
    let (origin, token, scopes) = account_credential(&handle)?;
    let target = write_target(&input, &origin, &scopes)?;
    // Never retried here: a lost answer does not mean a lost write.
    let response = write_request(client_for(&target).await?, target.clone(), &token, &input)?
        .send()
        .await
        .map_err(|error| {
            if error.is_timeout() && !error.is_connect() {
                failure(
                    "timeout",
                    "The server took too long to answer. Refresh to check before trying again.",
                )
            } else {
                failure("network", "Could not reach your Mastodon server.")
            }
        })?;
    let response = read_json(response).await?;
    if (200..300).contains(&response.status) {
        observe(app, handle, &target, &input.method, &response.body).await;
    }
    Ok(response)
}

#[tauri::command]
pub async fn mastodon_account_write(
    app: tauri::AppHandle,
    handle: String,
    input: AccountWrite,
) -> Result<PublicResponse, Failure> {
    // Queue briefly: giving up here means nothing was sent.
    let _permit = tokio::time::timeout(Duration::from_secs(10), WRITES.acquire())
        .await
        .ok()
        .and_then(Result::ok)
        .ok_or_else(|| failure("busy", "Too many account requests; retry shortly."))?;
    let result = write(app, handle, input).await;
    match &result {
        Ok(r) => record("account_write", "complete", Some(r.status)),
        Err(e) => record("account_write", e.kind, None),
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::{
        io::{AsyncReadExt, AsyncWriteExt},
        net::TcpListener,
    };
    const ORIGIN: &str = "https://example.com";
    const FULL: &str = "read write follow";

    #[test]
    fn pictures_are_bounded_typed_and_stay_on_the_authenticated_server() {
        let mut picture = PictureUpload {
            url: format!("{ORIGIN}/api/v2/media"),
            mime: "image/png".into(),
            data: STANDARD.encode(b"\x89PNG\r\n\x1a\nsynthetic picture bytes"),
            description: "A fox\r\nin snow".into(),
        };
        let (body, content_type) = picture_body(&picture).unwrap();
        assert!(content_type.starts_with("multipart/form-data; boundary="));
        assert!(body.windows(8).any(|w| w == b"\x89PNG\r\n\x1a\n"));
        let text = String::from_utf8_lossy(&body);
        assert!(text.contains("name=\"description\"\r\n\r\nA fox\r\nin snow"));
        assert!(text.contains("filename=\"picture.png\""));
        assert!(picture_target(&picture, ORIGIN, "write:media").is_ok());
        assert_eq!(
            picture_target(&picture, ORIGIN, "read").unwrap_err().kind,
            "reauthorize"
        );
        for url in [
            "https://other.example/api/v2/media",
            "https://example.com/api/v2/media?token=x",
            "https://user:pass@example.com/api/v2/media",
            "https://example.com/api/v1/accounts/update_credentials",
            "http://example.com/api/v2/media",
        ] {
            picture.url = url.into();
            assert!(picture_target(&picture, ORIGIN, FULL).is_err(), "{url}");
        }
        picture.mime = "image/jpeg".into();
        assert!(picture_body(&picture).is_err());
        picture.mime = "image/png".into();
        picture.data = "a".repeat(MAX_PICTURE.div_ceil(3) * 4 + 1);
        assert!(picture_body(&picture).is_err());
    }

    #[test]
    fn picture_processing_polls_after_202_and_handles_empty_206() {
        tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap().block_on(async {
            let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
            let address = listener.local_addr().unwrap();
            let server = tokio::spawn(async move {
                for answer in ["HTTP/1.1 206 Partial Content\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".to_string(), {
                    let body = r#"{"id":"abc","url":"https://cdn.example/p.png"}"#;
                    format!("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len())
                }] {
                    let (mut socket, _) = listener.accept().await.unwrap();
                    let mut bytes = vec![0; 8192];
                    let n = socket.read(&mut bytes).await.unwrap();
                    let request = String::from_utf8_lossy(&bytes[..n]);
                    assert!(request.starts_with("GET /api/v1/media/abc HTTP/1.1"));
                    assert!(request.to_lowercase().contains("authorization: bearer synthetic-token"));
                    socket.write_all(answer.as_bytes()).await.unwrap();
                }
            });
            let client = reqwest::Client::builder().no_proxy().build().unwrap();
            let target = Url::parse(&format!("http://{address}/api/v2/media")).unwrap();
            let response = PublicResponse { status: 202, body: r#"{"id":"abc","url":null}"#.into(), headers: Default::default() };
            let ready = finish_picture(&client, &target, "synthetic-token", response, Duration::ZERO).await.unwrap();
            assert_eq!(ready.status, 200);
            server.await.unwrap();
        });
    }

    fn input(method: &str, path: &str) -> AccountWrite {
        AccountWrite {
            url: format!("{ORIGIN}{path}"),
            method: method.into(),
            body: None,
            form: None,
            idempotency_key: None,
        }
    }

    #[test]
    fn every_shared_ui_write_is_permitted() {
        for (method, path) in [
            ("POST", "/api/v1/statuses"),
            ("PUT", "/api/v1/statuses/1"),
            ("PUT", "/api/v1/media/1"),
            ("DELETE", "/api/v1/statuses/1"),
            ("DELETE", "/api/v1/statuses/01HXYZABC"),
            ("POST", "/api/v1/statuses/1/reblog"),
            ("POST", "/api/v1/statuses/1/unreblog"),
            ("POST", "/api/v1/statuses/1/bookmark"),
            ("POST", "/api/v1/statuses/1/unbookmark"),
            ("POST", "/api/v1/statuses/1/pin"),
            ("POST", "/api/v1/statuses/1/unpin"),
            ("POST", "/api/v1/statuses/1/mute"),
            ("POST", "/api/v1/statuses/1/unmute"),
            ("POST", "/api/v1/statuses/1/favourite"),
            ("POST", "/api/v1/statuses/1/translate"),
            ("PUT", "/api/v1/statuses/1/interaction_policy"),
            ("POST", "/api/v1/statuses/1/quotes/2/revoke"),
            ("PUT", "/api/v1/scheduled_statuses/1"),
            ("DELETE", "/api/v1/scheduled_statuses/1"),
            ("POST", "/api/v1/polls/1/votes"),
            ("POST", "/api/v1/markers"),
            ("POST", "/api/v1/accounts/1/follow"),
            ("POST", "/api/v1/accounts/1/unfollow"),
            ("POST", "/api/v1/accounts/1/remove_from_followers"),
            ("POST", "/api/v1/accounts/1/note"),
            ("POST", "/api/v1/accounts/1/endorse"),
            ("POST", "/api/v1/accounts/1/unpin"),
            ("POST", "/api/v1/accounts/1/mute"),
            ("POST", "/api/v1/accounts/1/block"),
            ("PATCH", "/api/v1/accounts/update_credentials"),
            ("PATCH", "/api/v1/profile"),
            ("DELETE", "/api/v1/profile/avatar"),
            ("DELETE", "/api/v1/suggestions/1"),
            ("POST", "/api/v1/follow_requests/1/authorize"),
            ("POST", "/api/v1/tags/caf%C3%A9/follow"),
            ("POST", "/api/v1/tags/music/feature"),
            ("POST", "/api/v1/lists"),
            ("PUT", "/api/v1/lists/1"),
            ("DELETE", "/api/v1/lists/1/accounts"),
            ("POST", "/api/v1/collections"),
            ("PATCH", "/api/v1/collections/1"),
            ("DELETE", "/api/v1/collections/1/items/2"),
            ("POST", "/api/v1/collections/1/items/2/revoke"),
            ("POST", "/api/v1/notifications/1/dismiss"),
            ("POST", "/api/v1/conversations/1/read"),
            ("DELETE", "/api/v1/conversations/1"),
            ("POST", "/api/v1/reports"),
            ("POST", "/api/v1/announcements/1/dismiss"),
            ("PUT", "/api/v1/announcements/1/reactions/%F0%9F%91%8D"),
            ("POST", "/api/v1/annual_reports/2025/generate"),
            ("POST", "/api/v1/domain_blocks"),
            ("DELETE", "/api/v1/domain_blocks?domain=bad.example"),
            ("POST", "/api/v2/filters"),
            ("PUT", "/api/v2/filters/1"),
            ("POST", "/api/v2/filters/1/keywords"),
            ("DELETE", "/api/v2/filters/keywords/1"),
            ("DELETE", "/api/v2/filters/statuses/1"),
        ] {
            assert!(
                write_target(&input(method, path), ORIGIN, FULL).is_ok(),
                "{method} {path}"
            );
        }
    }

    #[test]
    fn other_writes_hosts_and_queries_are_refused() {
        for (method, path) in [
            ("GET", "/api/v1/statuses/1"),
            ("POST", "/oauth/token"),
            ("POST", "/oauth/revoke"),
            ("POST", "/api/v1/apps"),
            ("POST", "/api/v1/accounts"),
            ("POST", "/api/v2/media"),
            ("POST", "/api/v1/media"),
            ("DELETE", "/api/v1/media/1"),
            ("PUT", "/api/v1/media/"),
            ("PUT", "/api/v1/media/a%2Fb"),
            ("PUT", "/api/v1/media/1?access_token=x"),
            ("POST", "/api/v1/admin/accounts/1/action"),
            ("DELETE", "/api/v1/accounts/1"),
            ("DELETE", "/api/v1/statuses"),
            ("DELETE", "/api/v1/statuses/"),
            ("DELETE", "/api/v1/statuses/1/"),
            ("DELETE", "/api/v1/statuses/1?delete_media=true"),
            ("DELETE", "/api/v1/statuses/%31"),
            ("POST", "/api/v1/statuses/1/reblog?access_token=x"),
            ("POST", "/api/v1/statuses/1/anything"),
            ("POST", "/api/v1/tags/a%2Fb/follow"),
            ("POST", "/api/v1/tags/../follow"),
            ("DELETE", "/api/v1/domain_blocks?domain=a&domain=b"),
        ] {
            let error = write_target(&input(method, path), ORIGIN, FULL).unwrap_err();
            assert_eq!(error.kind, "policy", "{method} {path}");
        }
        for url in [
            "https://other.example/api/v1/statuses",
            "http://example.com/api/v1/statuses",
            "https://example.com:444/api/v1/statuses",
            "https://example.com/api/v1/statuses#x",
            "https://user:pass@example.com/api/v1/statuses",
        ] {
            let mut write = input("POST", "");
            write.url = url.into();
            assert!(write_target(&write, ORIGIN, FULL).is_err(), "{url}");
        }
    }

    #[test]
    fn bodies_and_keys_are_bounded() {
        let mut both = input("POST", "/api/v1/lists");
        both.body = Some(serde_json::json!({}));
        both.form = Some(vec![]);
        assert!(write_target(&both, ORIGIN, FULL).is_err());
        let mut array = input("POST", "/api/v1/statuses");
        array.body = Some(serde_json::json!([1]));
        assert!(write_target(&array, ORIGIN, FULL).is_err());
        let mut large = input("POST", "/api/v1/statuses");
        large.body = Some(serde_json::json!({ "status": "x".repeat(MAX_BODY) }));
        assert!(write_target(&large, ORIGIN, FULL).is_err());
        let mut key = input("POST", "/api/v1/statuses");
        key.idempotency_key = Some("bad\r\nkey".into());
        assert!(write_target(&key, ORIGIN, FULL).is_err());
    }

    #[test]
    fn read_only_and_narrow_grants_are_respected() {
        let kind = |method: &str, path: &str, scopes: &str| {
            write_target(&input(method, path), ORIGIN, scopes)
                .err()
                .map(|e| e.kind)
        };
        let delete = ("DELETE", "/api/v1/statuses/1");
        assert_eq!(kind(delete.0, delete.1, "read"), Some("reauthorize"));
        assert_eq!(
            kind(delete.0, delete.1, "read write:favourites"),
            Some("reauthorize")
        );
        assert_eq!(kind(delete.0, delete.1, "write:statuses"), None);
        assert_eq!(kind("PUT", "/api/v1/media/1", "write:media"), None);
        assert_eq!(kind("PUT", "/api/v1/media/1", "write"), None);
        for scopes in ["read", "write:statuses", "follow"] {
            assert_eq!(kind("PUT", "/api/v1/media/1", scopes), Some("reauthorize"));
        }
        assert_eq!(kind(delete.0, delete.1, "follow"), Some("reauthorize"));
        assert_eq!(kind("POST", "/api/v1/accounts/1/follow", "follow"), None);
        assert_eq!(kind("POST", "/api/v1/statuses/1/translate", "read"), None);
    }

    #[test]
    fn method_body_form_and_key_reach_the_server_once() {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap()
            .block_on(async {
                let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
                let address = listener.local_addr().unwrap();
                let server = tokio::spawn(async move {
                    let mut seen = Vec::new();
                    for _ in 0..4 {
                        let (mut socket, _) = listener.accept().await.unwrap();
                        let mut bytes = vec![0u8; 8192];
                        let mut filled = 0;
                        loop {
                            let n = socket.read(&mut bytes[filled..]).await.unwrap();
                            assert!(n > 0, "fixture expected a request");
                            filled += n;
                            let text = String::from_utf8_lossy(&bytes[..filled]).to_string();
                            let Some((head, body)) = text.split_once("\r\n\r\n") else {
                                continue;
                            };
                            let expected = head
                                .to_lowercase()
                                .lines()
                                .find_map(|l| {
                                    l.strip_prefix("content-length: ")
                                        .and_then(|v| v.parse::<usize>().ok())
                                })
                                .unwrap_or(0);
                            if body.len() >= expected {
                                seen.push(text);
                                break;
                            }
                        }
                        socket
                            .write_all(b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}")
                            .await
                            .unwrap();
                    }
                    seen
                });
                let mut post = input("POST", "");
                post.body = Some(serde_json::json!({"status":"hello"}));
                post.idempotency_key = Some("key-1".into());
                let mut list = input("PUT", "");
                list.form = Some(vec![("title".into(), "A & B".into())]);
                let mut media = input("PUT", "");
                media.body = Some(serde_json::json!({"description":"A fox in snow", "focus":"0.2,-0.3"}));
                for (write, path) in [
                    (input("DELETE", ""), "/api/v1/statuses/9"),
                    (post, "/api/v1/statuses"),
                    (list, "/api/v1/lists/3"),
                    (media, "/api/v1/media/7"),
                ] {
                    let client = reqwest::Client::builder().no_proxy().build().unwrap();
                    let target = Url::parse(&format!("http://{address}{path}")).unwrap();
                    let response = write_request(client, target, "synthetic-token", &write)
                        .unwrap()
                        .send()
                        .await
                        .unwrap();
                    assert_eq!(read_json(response).await.unwrap().status, 200);
                }
                let seen = server.await.unwrap();
                assert!(seen[0].starts_with("DELETE /api/v1/statuses/9 HTTP/1.1"));
                assert!(seen[0]
                    .to_lowercase()
                    .contains("authorization: bearer synthetic-token"));
                assert!(seen[1].starts_with("POST /api/v1/statuses HTTP/1.1"));
                assert!(seen[1].to_lowercase().contains("idempotency-key: key-1"));
                assert!(seen[1].ends_with(r#"{"status":"hello"}"#));
                assert!(seen[2].starts_with("PUT /api/v1/lists/3 HTTP/1.1"));
                assert!(seen[2].ends_with("title=A+%26+B"));
                assert!(seen[3].starts_with("PUT /api/v1/media/7 HTTP/1.1"));
                let (_, body) = seen[3].split_once("\r\n\r\n").unwrap();
                assert_eq!(serde_json::from_str::<Value>(body).unwrap(), serde_json::json!({
                    "description": "A fox in snow", "focus": "0.2,-0.3"
                }));
            });
    }
}
