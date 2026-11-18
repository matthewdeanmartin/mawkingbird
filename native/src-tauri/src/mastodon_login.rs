//! System-browser OAuth. Provider secrets never cross into the renderer.
use crate::{
    diagnostics::record,
    public_mastodon::{client_for, failure, read_json, validate_url, Failure, PublicResponse},
};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use rand::{rngs::OsRng, RngCore};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::time::Duration;
use tauri_plugin_opener::OpenerExt;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
    sync::Semaphore,
};
use url::Url;
static LOGIN: Semaphore = Semaphore::const_new(1);
static READS: Semaphore = Semaphore::const_new(8);
const SERVICE: &str = "com.mawkingbird.native.mastodon";
const PREFIX: &str = "native-mastodon:";
fn random() -> String {
    let mut bytes = [0u8; 32];
    OsRng.fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}
fn origin(server: &str) -> Result<Url, Failure> {
    let mut url = Url::parse(server).map_err(|_| failure("policy", "Invalid server address."))?;
    if url.path() != "/" || url.query().is_some() {
        return Err(failure("policy", "Select the server's HTTPS origin."));
    }
    url.set_path("/api/v1/instance");
    validate_url(url.as_str())?;
    url.set_path("/");
    Ok(url)
}
#[derive(Serialize, Deserialize)]
struct Credential {
    origin: String,
    token: String,
    #[serde(default = "read_scopes")]
    scopes: String,
}
fn read_scopes() -> String {
    "read".into()
}
fn login_scopes(access: &str) -> Result<&'static str, Failure> {
    match access {
        "read" => Ok("read"),
        "full" => Ok("read write follow"),
        _ => Err(failure("policy", "Unsupported native account access.")),
    }
}
fn entry(handle: &str) -> Result<keyring::Entry, Failure> {
    if cfg!(target_os = "android") {
        return Err(failure(
            "unsupported",
            "Saved accounts are not available in the experimental Android reader yet.",
        ));
    }
    let id = handle
        .strip_prefix(PREFIX)
        .filter(|s| {
            s.len() == 43
                && s.bytes()
                    .all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-')
        })
        .ok_or_else(|| {
            failure(
                "policy",
                "Native account reference is invalid. Sign in again.",
            )
        })?;
    keyring::Entry::new(SERVICE, id).map_err(|_| {
        failure(
            "credentials",
            "OS credential storage is unavailable. See Help > Open logs.",
        )
    })
}
fn callback_code(target: &str, state: &str) -> Result<Option<String>, Failure> {
    let url = Url::parse(&format!("http://127.0.0.1{target}"))
        .map_err(|_| failure("callback", "Invalid sign-in callback."))?;
    if url.path() != "/callback" {
        return Ok(None);
    }
    let pairs: Vec<_> = url.query_pairs().collect();
    let values = |key: &str| {
        pairs
            .iter()
            .filter(|(k, _)| k == key)
            .map(|(_, v)| v.to_string())
            .collect::<Vec<_>>()
    };
    if values("state") != [state] {
        return Ok(None);
    }
    if !values("error").is_empty() {
        return Err(failure("cancelled", "Sign-in was declined in the browser."));
    }
    let codes = values("code");
    if codes.len() != 1 || codes[0].is_empty() || codes[0].len() > 2048 {
        return Err(failure(
            "callback",
            "The browser returned an invalid authorization code.",
        ));
    }
    Ok(Some(codes[0].clone()))
}
async fn receive_callback(listener: TcpListener, state: &str) -> Result<String, Failure> {
    loop {
        let (mut stream, _) = listener
            .accept()
            .await
            .map_err(|_| failure("callback", "Could not receive the browser callback."))?;
        let request = tokio::time::timeout(Duration::from_secs(3), async {
            let mut bytes = Vec::new();
            let mut chunk = [0u8; 1024];
            while bytes.len() < 8192 {
                let count = stream.read(&mut chunk).await.ok()?;
                if count == 0 {
                    break;
                }
                bytes.extend_from_slice(&chunk[..count]);
                if bytes.windows(4).any(|v| v == b"\r\n\r\n") {
                    break;
                }
            }
            String::from_utf8(bytes).ok()
        })
        .await
        .ok()
        .flatten();
        let result = request
            .as_deref()
            .and_then(|s| s.lines().next())
            .and_then(|s| s.strip_prefix("GET "))
            .and_then(|s| s.strip_suffix(" HTTP/1.1"))
            .map(|target| callback_code(target, state))
            .unwrap_or(Ok(None));
        let accepted = !matches!(&result, Ok(None));
        let body = if accepted {
            "Sign-in response received. Return to Mawkingbird Native."
        } else {
            "Not a pending Mawkingbird sign-in callback."
        };
        let response = format!("HTTP/1.1 {}\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: {}\r\nCache-Control: no-store\r\nContent-Security-Policy: default-src 'none'\r\nConnection: close\r\n\r\n{}", if accepted {"200 OK"} else {"400 Bad Request"}, body.len(), body);
        let _ = tokio::time::timeout(
            Duration::from_secs(2),
            stream.write_all(response.as_bytes()),
        )
        .await;
        if let Some(code) = result? {
            return Ok(code);
        }
    }
}
async fn post(
    url: Url,
    form: &[(&str, &str)],
    stage: &'static str,
) -> Result<serde_json::Value, Failure> {
    record(stage, "started", None);
    let response = client_for(&url)
        .await?
        .post(url)
        .form(form)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|_| {
            failure(
                "network",
                "Sign-in HTTPS request failed. See Help > Open logs.",
            )
        })?;
    let status = response.status().as_u16();
    record(stage, "response", Some(status));
    let data = read_json(response).await?;
    if !(200..300).contains(&status) {
        return Err(failure(
            "upstream",
            "The server refused this sign-in step. See Help > Open logs for its status.",
        ));
    }
    serde_json::from_str(&data.body).map_err(|_| failure("response", "Invalid sign-in response."))
}
async fn login(app: tauri::AppHandle, server: String, scopes: &str) -> Result<String, Failure> {
    let base = origin(&server)?;
    // Check store availability before asking the user to authorize anything.
    entry(&format!("{PREFIX}{}", random()))?;
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|_| failure("callback", "Could not start the local sign-in callback."))?;
    let redirect = format!(
        "http://127.0.0.1:{}/callback",
        listener
            .local_addr()
            .map_err(|_| failure("callback", "Callback address unavailable."))?
            .port()
    );
    let registration = post(
        base.join("api/v1/apps").unwrap(),
        &[
            ("client_name", "Mawkingbird Native"),
            ("redirect_uris", &redirect),
            ("scopes", scopes),
        ],
        "oauth_register",
    )
    .await?;
    let client_id = registration["client_id"]
        .as_str()
        .ok_or_else(|| failure("response", "Registration did not return a client ID."))?;
    let client_secret = registration["client_secret"].as_str().ok_or_else(|| {
        failure(
            "response",
            "Registration did not return client credentials.",
        )
    })?;
    let state = random();
    let verifier = random();
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    let mut authorize = base.join("oauth/authorize").unwrap();
    authorize.query_pairs_mut().extend_pairs([
        ("client_id", client_id),
        ("redirect_uri", &redirect),
        ("response_type", "code"),
        ("scope", scopes),
        ("state", &state),
        ("code_challenge", &challenge),
        ("code_challenge_method", "S256"),
    ]);
    app.opener()
        .open_url(authorize.as_str(), None::<&str>)
        .map_err(|_| {
            failure(
                "browser",
                "Could not open the system browser. See Help > Open logs.",
            )
        })?;
    record("oauth_browser", "waiting", None);
    let code = receive_callback(listener, &state).await?;
    record("oauth_callback", "verified", None);
    let token = post(
        base.join("oauth/token").unwrap(),
        &[
            ("grant_type", "authorization_code"),
            ("client_id", client_id),
            ("client_secret", client_secret),
            ("redirect_uri", &redirect),
            ("code", &code),
            ("code_verifier", &verifier),
        ],
        "oauth_exchange",
    )
    .await?;
    let granted_scopes = token["scope"].as_str().unwrap_or(scopes).to_string();
    let token = token["access_token"]
        .as_str()
        .filter(|t| !t.is_empty() && t.len() <= 1024)
        .ok_or_else(|| failure("response", "Token exchange returned no usable token."))?;
    let handle = format!("{PREFIX}{}", random());
    let credential = Credential {
        origin: base.origin().ascii_serialization(),
        token: token.into(),
        scopes: granted_scopes,
    };
    entry(&handle)?
        .set_password(&serde_json::to_string(&credential).unwrap())
        .map_err(|_| {
            failure(
                "credentials",
                "Could not save the account in OS credential storage. See Help > Open logs.",
            )
        })?;
    record("oauth_credentials", "stored", None);
    Ok(handle)
}
#[tauri::command]
pub async fn mastodon_login(
    app: tauri::AppHandle,
    server: String,
    access: String,
) -> Result<String, Failure> {
    let _permit = LOGIN
        .try_acquire()
        .map_err(|_| failure("busy", "A sign-in is already waiting in your browser."))?;
    record("oauth_login", "started", None);
    let scopes = login_scopes(&access)?;
    let result = tokio::time::timeout(Duration::from_secs(300), login(app, server, scopes))
        .await
        .unwrap_or_else(|_| {
            Err(failure(
                "timeout",
                "Sign-in timed out. Start again; details are in Help > Open logs.",
            ))
        });
    record(
        "oauth_login",
        result
            .as_ref()
            .map(|_| "complete")
            .unwrap_or_else(|e| e.kind),
        None,
    );
    result
}
fn account_target(raw: &str, expected_origin: &str) -> Result<Url, Failure> {
    if raw.len() > 8192 || raw.chars().any(char::is_control) {
        return Err(failure("policy", "Invalid account URL."));
    }
    let target = Url::parse(raw).map_err(|_| failure("policy", "Invalid account request."))?;
    if target.origin().ascii_serialization() != expected_origin
        || (!target.path().starts_with("/api/v1/") && !target.path().starts_with("/api/v2/"))
    {
        return Err(failure(
            "policy",
            "Account requests must stay on their registered server.",
        ));
    }
    let mut policy_url = target.clone();
    policy_url.set_path("/api/v1/instance");
    if target.query().is_some_and(|q| q.len() > 4096) {
        return Err(failure("policy", "Invalid account query."));
    }
    policy_url.set_query(None);
    validate_url(policy_url.as_str())?;
    if target
        .query_pairs()
        .any(|(k, _)| k.eq_ignore_ascii_case("access_token"))
    {
        return Err(failure("policy", "Credential queries are blocked."));
    }
    Ok(target)
}
fn stored_credential(handle: &str) -> Result<Credential, Failure> {
    serde_json::from_str(&entry(handle)?.get_password().map_err(|_| {
        failure(
            "credentials",
            "Account unavailable in OS credential storage. Sign in again.",
        )
    })?)
    .map_err(|_| failure("credentials", "Stored account is invalid. Sign in again."))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FeedbackPost {
    message: String,
    direct: bool,
    key: String,
    poll: Option<FeedbackPoll>,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct FeedbackPoll {
    options: [String; 2],
    expires_in: u32,
}

fn validate_feedback(post: &FeedbackPost) -> Result<(), Failure> {
    // Direct posts address one account. Extra mentions would expand the audience.
    if post.direct
        && post
            .message
            .split_whitespace()
            .skip(1)
            .any(|word| word.contains(['@', '＠']))
    {
        return Err(failure(
            "policy",
            "Remove extra recipients from private feedback.",
        ));
    }
    if !post.message.starts_with('@')
        || post.message.len() > 100_000
        || post.key.len() != 36
        || !post.key.bytes().all(|b| b.is_ascii_hexdigit() || b == b'-')
        || post.poll.as_ref().is_some_and(|p| {
            post.direct
                || p.expires_in == 0
                || p.options.iter().any(|o| o.is_empty() || o.len() > 256)
        })
    {
        return Err(failure("policy", "Invalid feedback post."));
    }
    Ok(())
}

#[tauri::command]
pub async fn mastodon_feedback(
    handle: String,
    server: String,
    post: FeedbackPost,
) -> Result<(), Failure> {
    let _permit = READS
        .try_acquire()
        .map_err(|_| failure("busy", "Retry shortly."))?;
    let credential = stored_credential(&handle)?;
    let server = origin(&server)?;
    if server.origin().ascii_serialization() != credential.origin
        || !credential
            .scopes
            .split_whitespace()
            .any(|s| matches!(s, "write" | "write:statuses"))
    {
        return Err(failure(
            "reauthorize",
            "Reconnect the posting account with Full access.",
        ));
    }
    validate_feedback(&post)?;
    let target = server.join("api/v1/statuses").unwrap();
    let mut body = serde_json::json!({"status": post.message, "visibility": if post.direct { "direct" } else { "public" }});
    if let Some(poll) = post.poll {
        body["poll"] = serde_json::json!(poll);
    }
    let response = client_for(&target)
        .await?
        .post(target)
        .timeout(Duration::from_secs(15))
        .bearer_auth(credential.token)
        .header("Idempotency-Key", post.key)
        .json(&body)
        .send()
        .await
        .map_err(|_| failure("network", "Feedback request failed."))?;
    if !response.status().is_success() {
        return Err(failure("server", "The server declined the post."));
    }
    Ok(())
}
async fn account_read(url: String, handle: String) -> Result<PublicResponse, Failure> {
    let credential = stored_credential(&handle)?;
    let target = account_target(&url, &credential.origin)?;
    let response = client_for(&target)
        .await?
        .get(target)
        .bearer_auth(credential.token)
        .header("Accept", "application/json")
        .header("Accept-Encoding", "identity")
        .send()
        .await
        .map_err(|_| failure("network", "Account request failed. See Help > Open logs."))?;
    read_json(response).await
}
#[tauri::command]
pub async fn mastodon_account_get(url: String, handle: String) -> Result<PublicResponse, Failure> {
    let _permit = READS
        .try_acquire()
        .map_err(|_| failure("busy", "Too many account requests; retry shortly."))?;
    let result = tokio::time::timeout(Duration::from_secs(15), account_read(url, handle))
        .await
        .unwrap_or_else(|_| Err(failure("timeout", "Account request timed out.")));
    match &result {
        Ok(r) => record("account_read", "complete", Some(r.status)),
        Err(e) => record("account_read", e.kind, None),
    }
    result
}

fn favourite_target(
    credential: &Credential,
    server: &str,
    status_id: &str,
    liked: bool,
) -> Result<Url, Failure> {
    let server = origin(server)?;
    if server.origin().ascii_serialization() != credential.origin
        || status_id.is_empty()
        || status_id.len() > 40
        || !status_id.bytes().all(|b| b.is_ascii_digit())
    {
        return Err(failure(
            "policy",
            "Like requests must target a post on the account's server.",
        ));
    }
    if !credential
        .scopes
        .split_whitespace()
        .any(|scope| scope == "write:favourites" || scope == "write")
    {
        return Err(failure("reauthorize", "Reconnect this account with Full access to enable likes. This login currently has read-only permission."));
    }
    let action = if liked { "favourite" } else { "unfavourite" };
    Ok(server
        .join(&format!("api/v1/statuses/{status_id}/{action}"))
        .unwrap())
}
fn favourite_request(client: reqwest::Client, target: Url, token: &str) -> reqwest::RequestBuilder {
    client
        .post(target)
        .bearer_auth(token)
        .header("Accept", "application/json")
        .header("Accept-Encoding", "identity")
}
async fn favourite(
    handle: String,
    server: String,
    status_id: String,
    liked: bool,
) -> Result<PublicResponse, Failure> {
    let credential = stored_credential(&handle)?;
    let target = favourite_target(&credential, &server, &status_id, liked)?;
    // A typed action, not an arbitrary method/path/body tunnel. Never auto-retry writes.
    let response = favourite_request(client_for(&target).await?, target, &credential.token)
        .send()
        .await
        .map_err(|_| failure("network", "Like request failed. See Help > Open logs."))?;
    read_json(response).await
}
#[tauri::command]
pub async fn mastodon_favourite(
    handle: String,
    server: String,
    status_id: String,
    liked: bool,
) -> Result<PublicResponse, Failure> {
    let _permit = READS
        .try_acquire()
        .map_err(|_| failure("busy", "Too many account requests; retry shortly."))?;
    let result = tokio::time::timeout(
        Duration::from_secs(15),
        favourite(handle, server, status_id, liked),
    )
    .await
    .unwrap_or_else(|_| {
        Err(failure(
            "timeout",
            "Like request timed out. Refresh to check its result before retrying.",
        ))
    });
    let operation = if liked {
        "account_favourite"
    } else {
        "account_unfavourite"
    };
    match &result {
        Ok(r) => record(operation, "complete", Some(r.status)),
        Err(e) => record(operation, e.kind, None),
    }
    result
}
#[tauri::command]
pub fn forget_mastodon_account(handle: String) -> Result<(), Failure> {
    match entry(&handle)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => {
            record("account_forget", "complete", None);
            Ok(())
        }
        Err(_) => {
            record("account_forget", "credentials", None);
            Err(failure(
                "credentials",
                "Could not remove the OS credential. See Help > Open logs.",
            ))
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn callbacks_require_exact_single_state_and_code() {
        assert_eq!(
            callback_code("/callback?state=ours&code=abc", "ours").unwrap(),
            Some("abc".into())
        );
        assert_eq!(
            callback_code("/callback?state=theirs&code=abc", "ours").unwrap(),
            None
        );
        assert_eq!(
            callback_code("/callback?state=ours&state=ours&code=abc", "ours").unwrap(),
            None
        );
        assert!(callback_code("/callback?state=ours&code=a&code=b", "ours").is_err());
        assert!(callback_code("/callback?state=ours&error=access_denied", "ours").is_err());
        assert_eq!(
            callback_code("/other?state=ours&code=abc", "ours").unwrap(),
            None
        );
    }
    #[test]
    fn account_references_and_server_origins_are_constrained() {
        assert!(origin("https://mastodon.social").is_ok());
        for s in [
            "http://example.com",
            "https://a:b@example.com",
            "https://example.com/path",
            "https://example.com/?token=x",
            "https://example.com:444",
        ] {
            assert!(origin(s).is_err());
        }
        for s in [
            "bearer-secret",
            "native-mastodon:../anything",
            "native-mastodon:short",
        ] {
            assert!(entry(s).is_err());
        }
    }
    #[test]
    fn account_reads_cannot_escape_the_stored_origin() {
        let origin = "https://mastodon.social";
        assert!(account_target(
            "https://mastodon.social/api/v1/timelines/home?limit=20",
            origin
        )
        .is_ok());
        for target in [
            "https://evil.example/api/v1/accounts",
            "http://mastodon.social/api/v1/accounts",
            "https://user:pass@mastodon.social/api/v1/accounts",
            "https://mastodon.social/oauth/token",
            "https://mastodon.social/api/v1/accounts?%61ccess_token=secret",
        ] {
            assert!(account_target(target, origin).is_err(), "{target}");
        }
    }
    #[test]
    fn browser_callback_uses_a_real_loopback_socket() {
        tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap().block_on(async {
            let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
            let address = listener.local_addr().unwrap();
            let receiver = tokio::spawn(async move { receive_callback(listener, "expected-state").await });
            for (state, expected_status) in [("wrong", "400"), ("expected-state", "200")] {
                let mut socket = tokio::net::TcpStream::connect(address).await.unwrap();
                socket.write_all(format!("GET /callback?state={state}&code=test-code HTTP/1.1\r\nHost: localhost\r\n\r\n").as_bytes()).await.unwrap();
                let mut response = String::new();
                socket.read_to_string(&mut response).await.unwrap();
                assert!(response.starts_with(&format!("HTTP/1.1 {expected_status}")));
                assert!(!response.contains("test-code"));
            }
            assert_eq!(receiver.await.unwrap().unwrap(), "test-code");
        });
    }
    #[cfg(target_os = "windows")]
    #[test]
    fn windows_credentials_roundtrip_and_delete() {
        let handle = format!("{PREFIX}{}", random());
        let item = entry(&handle).unwrap();
        item.set_password("synthetic-test-secret").unwrap();
        let retrieved = item.get_password();
        item.delete_credential().unwrap();
        assert_eq!(retrieved.unwrap(), "synthetic-test-secret");
        assert!(matches!(item.get_password(), Err(keyring::Error::NoEntry)));
    }
    #[test]
    fn private_feedback_has_one_recipient_and_no_poll() {
        let mut post = FeedbackPost {
            message: "@project@example.org private detail".into(),
            direct: true,
            key: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee".into(),
            poll: None,
        };
        assert!(validate_feedback(&post).is_ok());
        post.message.push_str(" @someone");
        assert!(validate_feedback(&post).is_err());
        post.message = "@project@example.org a feature".into();
        post.poll = Some(FeedbackPoll {
            options: ["Yes".into(), "No".into()],
            expires_in: 7776000,
        });
        assert!(validate_feedback(&post).is_err());
        post.direct = false;
        assert!(validate_feedback(&post).is_ok());
    }

    #[test]
    fn old_credentials_remain_read_only_and_supported_scopes_are_explicit() {
        let old: Credential =
            serde_json::from_str(r#"{"origin":"https://example.com","token":"synthetic"}"#)
                .unwrap();
        assert_eq!(old.scopes, "read");
        assert_eq!(
            favourite_target(&old, "https://example.com", "123", true)
                .unwrap_err()
                .kind,
            "reauthorize"
        );
        assert_eq!(login_scopes("full").unwrap(), "read write follow");
        assert_eq!(login_scopes("read").unwrap(), "read");
        assert!(login_scopes("arbitrary").is_err());
    }
    #[test]
    fn like_transport_posts_and_preserves_server_results() {
        tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap().block_on(async {
            let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
            let address = listener.local_addr().unwrap();
            let server = tokio::spawn(async move {
                for (action, status, body) in [
                    ("favourite", "200 OK", r#"{"id":"123","favourited":true}"#),
                    ("unfavourite", "200 OK", r#"{"id":"123","favourited":false}"#),
                    ("favourite", "429 Too Many Requests", r#"{"error":"slow down"}"#),
                ] {
                    let (mut socket, _) = listener.accept().await.unwrap();
                    let mut bytes = Vec::new();
                    let mut buffer = [0u8;1024];
                    while !bytes.windows(4).any(|v| v == b"\r\n\r\n") {
                        let n = socket.read(&mut buffer).await.unwrap();
                        assert!(n > 0);
                        bytes.extend_from_slice(&buffer[..n]);
                    }
                    let request = String::from_utf8(bytes).unwrap().to_lowercase();
                    assert!(request.starts_with(&format!("post /api/v1/statuses/123/{action} http/1.1")));
                    assert!(request.contains("authorization: bearer synthetic-test-token"));
                    socket.write_all(format!("HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nRetry-After: 10\r\nConnection: close\r\n\r\n{body}", body.len()).as_bytes()).await.unwrap();
                }
            });
            for (action, status, expected) in [("favourite",200,Some(true)), ("unfavourite",200,Some(false)), ("favourite",429,None)] {
                let request = favourite_request(reqwest::Client::builder().no_proxy().timeout(Duration::from_secs(3)).build().unwrap(), Url::parse(&format!("http://{address}/api/v1/statuses/123/{action}")).unwrap(), "synthetic-test-token");
                let result = read_json(request.send().await.unwrap()).await.unwrap();
                assert_eq!(result.status, status);
                assert_eq!(result.headers["retry-after"], "10");
                let body: serde_json::Value = serde_json::from_str(&result.body).unwrap();
                assert_eq!(body["favourited"].as_bool(), expected);
            }
            server.await.unwrap();
        });
    }
    #[test]
    fn like_targets_cannot_escape_the_account_or_choose_another_write() {
        let credential = Credential {
            origin: "https://example.com".into(),
            token: "synthetic".into(),
            scopes: "read write:favourites".into(),
        };
        let full_access = Credential {
            origin: credential.origin.clone(),
            token: "synthetic".into(),
            scopes: login_scopes("full").unwrap().into(),
        };
        assert!(favourite_target(&full_access, "https://example.com", "123", true).is_ok());
        assert!(favourite_target(&full_access, "https://example.com", "123", false).is_ok());
        for (liked, action) in [(true, "favourite"), (false, "unfavourite")] {
            assert_eq!(
                favourite_target(&credential, "https://example.com", "123", liked)
                    .unwrap()
                    .as_str(),
                format!("https://example.com/api/v1/statuses/123/{action}")
            );
        }
        assert!(favourite_target(&credential, "https://other.example", "123", true).is_err());
        for id in ["", "../123", "123/reblog", "123?x=1", "%31", "abc"] {
            assert!(favourite_target(&credential, "https://example.com", id, true).is_err());
        }
        let misleading_scope = Credential {
            scopes: "read write:favourites:other".into(),
            ..credential
        };
        assert_eq!(
            favourite_target(&misleading_scope, "https://example.com", "123", true)
                .unwrap_err()
                .kind,
            "reauthorize"
        );
    }
}
