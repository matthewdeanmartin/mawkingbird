//! MiAuth and explicitly allowed Misskey JSON operations.
use crate::{
    diagnostics::record,
    public_mastodon::{failure, Failure, PublicResponse},
    social,
};
use rand::{rngs::OsRng, RngCore};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::time::Duration;
use tauri_plugin_opener::OpenerExt;
use tokio::sync::Semaphore;
static LOGIN: Semaphore = Semaphore::const_new(1);
static REQUESTS: Semaphore = Semaphore::const_new(8);
const PERMISSIONS: &[&str] = &[
    "read:account",
    "read:following",
    "read:notifications",
    "read:reactions",
    "read:favorites",
    "read:mutes",
    "read:blocks",
    "read:channels",
    "read:drive",
    "write:notes",
    "write:reactions",
    "write:votes",
    "write:following",
    "write:mutes",
    "write:blocks",
    "write:channels",
    "write:favorites",
    "write:drive",
    "write:report-abuse",
];
#[derive(Serialize, Deserialize)]
struct Credential {
    origin: String,
    token: String,
}
fn uuid() -> String {
    let mut b = [0u8; 16];
    OsRng.fill_bytes(&mut b);
    b[6] = (b[6] & 15) | 64;
    b[8] = (b[8] & 63) | 128;
    let h: String = b.iter().map(|b| format!("{b:02x}")).collect();
    format!(
        "{}-{}-{}-{}-{}",
        &h[..8],
        &h[8..12],
        &h[12..16],
        &h[16..20],
        &h[20..]
    )
}
fn allowed(endpoint: &str) -> bool {
    matches!(
        endpoint,
        "meta"
            | "emojis"
            | "i"
            | "i/notifications"
            | "notes/timeline"
            | "notes/hybrid-timeline"
            | "notes/local-timeline"
            | "notes/global-timeline"
            | "notes/show"
            | "notes/conversation"
            | "notes/children"
            | "notes/search"
            | "notes/search-by-tag"
            | "users/show"
            | "users/notes"
            | "users/search"
            | "users/relation"
            | "users/followers"
            | "users/following"
            | "hashtags/search"
            | "hashtags/trend"
            | "antennas/list"
            | "antennas/show"
            | "antennas/notes"
            | "users/lists/list"
            | "users/lists/show"
            | "notes/user-list-timeline"
            | "channels/followed"
            | "channels/my-favorites"
            | "channels/featured"
            | "channels/show"
            | "channels/timeline"
            | "clips/list"
            | "clips/show"
            | "clips/notes"
            | "notes/reactions/create"
            | "notes/reactions/delete"
            | "notes/create"
            | "notes/delete"
            | "notes/unrenote"
            | "notes/polls/vote"
            | "following/create"
            | "following/delete"
            | "following/requests/cancel"
            | "following/requests/accept"
            | "following/requests/reject"
            | "mute/create"
            | "mute/delete"
            | "blocking/create"
            | "blocking/delete"
            | "channels/follow"
            | "channels/unfollow"
            | "notes/favorites/create"
            | "notes/favorites/delete"
    )
}
fn payload(endpoint: &str, body: Value) -> Result<Value, Failure> {
    if !allowed(endpoint)
        || !body.is_object()
        || body.to_string().len() > 65536
        || body.get("i").is_some()
    {
        return Err(failure(
            "policy",
            "This Misskey operation is not supported by native transport. See Help > Open logs.",
        ));
    }
    Ok(body)
}
pub async fn nodeinfo(url: String) -> Result<PublicResponse, Failure> {
    let url = social::target(&url)?;
    if url.query().is_some()
        || !matches!(
            url.path(),
            "/.well-known/nodeinfo"
                | "/nodeinfo/2.0"
                | "/nodeinfo/2.1"
                | "/nodeinfo/2.0.json"
                | "/nodeinfo/2.1.json"
        )
    {
        return Err(failure(
            "policy",
            "Only standard NodeInfo discovery is supported.",
        ));
    }
    social::json_request(url, None).await
}
#[tauri::command]
pub async fn misskey_request(
    server: String,
    endpoint: String,
    body: Value,
    handle: Option<String>,
) -> Result<PublicResponse, Failure> {
    let _permit = REQUESTS
        .try_acquire()
        .map_err(|_| failure("busy", "Too many Misskey requests; retry shortly."))?;
    let result = tokio::time::timeout(Duration::from_secs(20), async {
        let base = social::origin(&server)?;
        let mut body = payload(&endpoint, body)?;
        if let Some(handle) = handle {
            if !handle.starts_with("native-misskey:") {
                return Err(failure(
                    "policy",
                    "Expected a native Misskey account reference.",
                ));
            }
            let credential: Credential = social::load(&handle)?;
            if credential.origin != base.origin().ascii_serialization() {
                return Err(failure(
                    "policy",
                    "Misskey credentials belong to another server.",
                ));
            }
            body["i"] = json!(credential.token);
        }
        social::json_request(base.join(&format!("api/{endpoint}")).unwrap(), Some(body)).await
    })
    .await
    .unwrap_or_else(|_| Err(failure("network", "Misskey request timed out.")));
    record(
        "misskey_request",
        result
            .as_ref()
            .map(|_| "complete")
            .unwrap_or_else(|e| e.kind),
        result.as_ref().ok().map(|r| r.status),
    );
    result
}
#[tauri::command]
pub async fn misskey_nodeinfo(url: String) -> Result<PublicResponse, Failure> {
    let _permit = REQUESTS
        .try_acquire()
        .map_err(|_| failure("busy", "Too many discovery requests."))?;
    let result = tokio::time::timeout(Duration::from_secs(20), nodeinfo(url))
        .await
        .unwrap_or_else(|_| Err(failure("network", "NodeInfo request timed out.")));
    record(
        "misskey_discovery",
        result
            .as_ref()
            .map(|_| "complete")
            .unwrap_or_else(|e| e.kind),
        None,
    );
    result
}
fn authorization_url(base: &url::Url, session: &str) -> url::Url {
    let mut authorize = base.join(&format!("miauth/{session}")).unwrap();
    authorize.query_pairs_mut().extend_pairs([
        ("name", "Mawkingbird Native"),
        ("permission", &PERMISSIONS.join(",")),
    ]);
    authorize
}

async fn wait_for_approval<F, Fut>(mut check: F, interval: Duration) -> Result<Value, Failure>
where
    F: FnMut() -> Fut,
    Fut: std::future::Future<Output = Result<Value, Failure>>,
{
    loop {
        tokio::time::sleep(interval).await;
        let result = check().await?;
        match result.get("ok").and_then(Value::as_bool) {
            Some(false) => continue,
            Some(true) => return Ok(result),
            None => {
                return Err(failure(
                    "response",
                    "Misskey returned an invalid approval response.",
                ))
            }
        }
    }
}

async fn login(app: tauri::AppHandle, server: String) -> Result<Value, Failure> {
    let base = social::origin(&server)?;
    let discovery =
        social::value(nodeinfo(base.join(".well-known/nodeinfo").unwrap().to_string()).await?)?;
    let href = discovery["links"]
        .as_array()
        .and_then(|links| {
            links.iter().find_map(|link| {
                let rel = link["rel"].as_str()?;
                if !rel.starts_with("http://nodeinfo.diaspora.software/ns/schema/2.")
                    && !rel.starts_with("https://nodeinfo.diaspora.software/ns/schema/2.")
                {
                    return None;
                }
                link["href"].as_str()
            })
        })
        .ok_or_else(|| failure("response", "The server did not publish NodeInfo."))?;
    let info_url = social::target(href)?;
    if info_url.origin() != base.origin() {
        return Err(failure(
            "policy",
            "NodeInfo must stay on the selected server.",
        ));
    }
    let info = social::value(nodeinfo(href.into()).await?)?;
    if info["software"]["name"]
        .as_str()
        .map(str::to_lowercase)
        .as_deref()
        != Some("misskey")
    {
        return Err(failure(
            "policy",
            "Only Misskey itself is supported by this sign-in.",
        ));
    }
    let session = uuid();
    let authorize = authorization_url(&base, &session);
    app.opener()
        .open_url(authorize.as_str(), None::<&str>)
        .map_err(|_| failure("browser", "Could not open the system browser."))?;
    record("misskey_login", "browser_waiting", None);
    // MiAuth's callback is optional. Some servers reject loopback callback URLs
    // before showing approval. Poll only this fresh session; no hosted relay.
    let result = wait_for_approval(
        || async {
            social::value(
                social::json_request(
                    base.join(&format!("api/miauth/{session}/check")).unwrap(),
                    Some(json!({})),
                )
                .await?,
            )
        },
        Duration::from_secs(5),
    )
    .await?;
    record("misskey_login", "approval_received", None);
    let token = result["token"]
        .as_str()
        .filter(|t| !t.is_empty() && t.len() <= 2048)
        .ok_or_else(|| failure("response", "Misskey did not approve this sign-in."))?;
    if result["ok"] != true
        || result["user"]["id"].as_str().is_none()
        || result["user"]["username"].as_str().is_none()
    {
        return Err(failure(
            "response",
            "Misskey returned an invalid sign-in response.",
        ));
    }
    let handle = format!("native-misskey:{}", social::random());
    social::save(
        &handle,
        &Credential {
            origin: base.origin().ascii_serialization(),
            token: token.into(),
        },
    )?;
    // Return only safe profile fields, never the raw provider response/token.
    Ok(
        json!({ "token": handle, "permissions": PERMISSIONS, "user": { "id": result["user"]["id"], "username": result["user"]["username"], "name": result["user"]["name"], "avatarUrl": result["user"]["avatarUrl"], "emojis": result["user"]["emojis"] } }),
    )
}
#[tauri::command]
pub async fn misskey_login(app: tauri::AppHandle, server: String) -> Result<Value, Failure> {
    let _permit = LOGIN
        .try_acquire()
        .map_err(|_| failure("busy", "Misskey sign-in is already open."))?;
    let result = tokio::time::timeout(Duration::from_secs(300), login(app, server))
        .await
        .unwrap_or_else(|_| {
            Err(failure(
                "timeout",
                "Misskey sign-in timed out; start again.",
            ))
        });
    record(
        "misskey_login",
        result
            .as_ref()
            .map(|_| "complete")
            .unwrap_or_else(|e| e.kind),
        None,
    );
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn miauth_approval_url_omits_optional_callback() {
        let base = social::origin("https://misskey.design").unwrap();
        let session = uuid();
        let url = authorization_url(&base, &session);
        assert_eq!(url.path(), format!("/miauth/{session}"));
        assert!(!url.query_pairs().any(|(key, _)| key == "callback"));
        assert!(url
            .query_pairs()
            .any(|(key, value)| key == "permission" && value == PERMISSIONS.join(",")));
    }
    #[test]
    fn approval_polling_waits_then_stops_at_the_single_successful_exchange() {
        tauri::async_runtime::block_on(async {
            let mut attempts = 0;
            let result = wait_for_approval(
                || {
                    attempts += 1;
                    std::future::ready(Ok(if attempts < 3 {
                        json!({"ok":false})
                    } else {
                        json!({"ok":true,"token":"synthetic"})
                    }))
                },
                Duration::from_millis(1),
            )
            .await
            .unwrap();
            assert_eq!(attempts, 3);
            assert_eq!(result["token"], "synthetic");
            let invalid =
                wait_for_approval(|| std::future::ready(Ok(json!({}))), Duration::ZERO).await;
            assert_eq!(invalid.err().unwrap().kind, "response");
            let refused = wait_for_approval(
                || std::future::ready(Err(failure("upstream", "Refused"))),
                Duration::ZERO,
            )
            .await;
            assert_eq!(refused.err().unwrap().kind, "upstream");
            let waiting = wait_for_approval(
                || std::future::ready(Ok(json!({"ok":false}))),
                Duration::from_millis(1),
            );
            assert!(tokio::time::timeout(Duration::from_millis(10), waiting)
                .await
                .is_err());
        });
    }
    #[test]
    fn denies_arbitrary_operations_and_credential_injection() {
        for endpoint in [
            "admin/accounts/delete",
            "miauth/evil/check",
            "../i",
            "i/update",
            "drive/files/create",
        ] {
            assert!(payload(endpoint, json!({})).is_err());
        }
        assert!(payload("notes/timeline", json!({"i":"injected"})).is_err());
        assert!(payload("notes/timeline", json!([])).is_err());
        assert!(payload(
            "notes/reactions/create",
            json!({"noteId":"abc", "reaction":"❤️"})
        )
        .is_ok());
    }
    #[test]
    fn miauth_uses_fresh_uuid_v4() {
        let a = uuid();
        assert_eq!(a.len(), 36);
        assert_eq!(&a[14..15], "4");
        assert_ne!(a, uuid());
    }
    #[cfg(target_os = "windows")]
    #[test]
    fn stored_misskey_credentials_cannot_be_sent_to_another_server() {
        tauri::async_runtime::block_on(async {
            let handle = format!("native-misskey:{}", social::random());
            social::save(
                &handle,
                &Credential {
                    origin: "https://misskey.example".into(),
                    token: "synthetic-test-token".into(),
                },
            )
            .unwrap();
            let result = misskey_request(
                "https://another.example".into(),
                "notes/timeline".into(),
                json!({}),
                Some(handle.clone()),
            )
            .await;
            social::forget_social_account(handle).await.unwrap();
            assert_eq!(result.err().unwrap().kind, "policy");
        });
    }
}
