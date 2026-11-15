//! AT Protocol OAuth, with SDK-managed proofs and an OS-only session store.
use crate::{
    diagnostics::record,
    public_mastodon::{client_for, failure, Failure, PublicResponse},
    social,
};
use atrium_api::{
    agent::{Configure, SessionManager},
    types::string::Did,
};
use atrium_common::store::Store;
use atrium_identity::{
    did::{CommonDidResolver, CommonDidResolverConfig},
    handle::{AppViewHandleResolver, AppViewHandleResolverConfig},
};
use atrium_oauth::{
    store::{
        session::{MemorySessionStore, Session, SessionStore},
        state::MemoryStateStore,
    },
    AtprotoLocalhostClientMetadata, AuthorizeOptions, KnownScope, OAuthClient, OAuthClientConfig,
    OAuthResolverConfig, Scope,
};
use atrium_xrpc::{
    http::{Method, Request, Response},
    HttpClient, InputDataOrBytes, OutputDataOrBytes, XrpcClient, XrpcRequest,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::BTreeMap,
    sync::{Arc, Mutex},
    time::Duration,
};
use tauri_plugin_opener::OpenerExt;
use tokio::sync::Semaphore;

pub static ACCOUNT_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
static LOGIN: Semaphore = Semaphore::const_new(1);
static REQUESTS: Semaphore = Semaphore::const_new(24);
type BoxError = Box<dyn std::error::Error + Send + Sync>;
fn safe_error(message: &'static str) -> BoxError {
    std::io::Error::other(message).into()
}
fn sdk_error(_: impl std::fmt::Display) -> Failure {
    failure("oauth", "Bluesky OAuth failed. Retry sign-in; see Help > Open logs for the failing step and HTTP status.")
}

#[derive(Clone, Default)]
pub struct SafeHttp {
    pending: Arc<Mutex<Option<String>>>,
}
impl HttpClient for SafeHttp {
    async fn send_http(&self, request: Request<Vec<u8>>) -> Result<Response<Vec<u8>>, BoxError> {
        let url = social::target(&request.uri().to_string())
            .map_err(|_| safe_error("OAuth destination blocked"))?;
        if request.body().len() > 65536 || !matches!(*request.method(), Method::GET | Method::POST)
        {
            return Err(safe_error("OAuth request blocked"));
        }
        // The SDK generates the PAR state. Keep it in Rust for strict loopback filtering.
        let pairs: Vec<_> = url::form_urlencoded::parse(request.body()).collect();
        if pairs.iter().any(|(k, _)| k == "code_challenge") {
            if let Some((_, state)) = pairs.iter().find(|(k, _)| k == "state") {
                *self.pending.lock().unwrap() = Some(state.to_string());
            }
        }
        let result = tokio::time::timeout(Duration::from_secs(15), async {
            let client = client_for(&url)
                .await
                .map_err(|_| safe_error("OAuth DNS/network policy failed"))?;
            let (parts, bytes) = request.into_parts();
            let mut response = client
                .request(parts.method, url)
                .headers(parts.headers)
                .body(bytes)
                .send()
                .await
                .map_err(|_| safe_error("OAuth HTTPS request failed"))?;
            let status = response.status();
            record("bluesky_http", "response", Some(status.as_u16()));
            if status.is_redirection()
                || response
                    .content_length()
                    .is_some_and(|n| n > 4 * 1024 * 1024)
            {
                return Err(safe_error("OAuth redirect or size rejected"));
            }
            let mut out = Response::builder().status(status);
            *out.headers_mut().unwrap() = response.headers().clone();
            let mut bytes = Vec::new();
            while let Some(chunk) = response
                .chunk()
                .await
                .map_err(|_| safe_error("OAuth response interrupted"))?
            {
                if bytes.len() + chunk.len() > 4 * 1024 * 1024 {
                    return Err(safe_error("OAuth response too large"));
                }
                bytes.extend_from_slice(&chunk);
            }
            out.body(bytes)
                .map_err(|_| safe_error("OAuth response invalid"))
        })
        .await
        .map_err(|_| safe_error("OAuth request timed out"))?;
        if result.is_err() {
            record("bluesky_http", "failed", None);
        }
        result
    }
}

#[derive(Serialize, Deserialize)]
struct Credential {
    redirect: String,
    session: Session,
}
#[derive(Clone)]
struct OsStore {
    handle: String,
    redirect: String,
    memory: MemorySessionStore,
}
impl Store<Did, Session> for OsStore {
    type Error = std::io::Error;
    async fn get(&self, key: &Did) -> Result<Option<Session>, Self::Error> {
        self.memory
            .get(key)
            .await
            .map_err(|_| std::io::Error::other("Session lookup failed"))
    }
    async fn set(&self, key: Did, value: Session) -> Result<(), Self::Error> {
        if key != value.token_set.sub {
            return Err(std::io::Error::other("Session subject mismatch"));
        }
        social::save(
            &self.handle,
            &Credential {
                redirect: self.redirect.clone(),
                session: value.clone(),
            },
        )
        .map_err(|_| std::io::Error::other("OS session persistence failed"))?;
        self.memory
            .set(key, value)
            .await
            .map_err(|_| std::io::Error::other("Session update failed"))
    }
    async fn del(&self, key: &Did) -> Result<(), Self::Error> {
        self.memory
            .del(key)
            .await
            .map_err(|_| std::io::Error::other("Session removal failed"))
    }
    async fn clear(&self) -> Result<(), Self::Error> {
        self.memory
            .clear()
            .await
            .map_err(|_| std::io::Error::other("Session removal failed"))
    }
}
impl SessionStore for OsStore {}
type Client = OAuthClient<
    MemoryStateStore,
    OsStore,
    CommonDidResolver<SafeHttp>,
    AppViewHandleResolver<SafeHttp>,
    SafeHttp,
>;
fn client(store: OsStore, http: SafeHttp) -> Result<Client, Failure> {
    let shared = Arc::new(http.clone());
    OAuthClient::new(OAuthClientConfig {
        client_metadata: AtprotoLocalhostClientMetadata {
            redirect_uris: Some(vec![store.redirect.clone()]),
            scopes: Some(vec![
                Scope::Known(KnownScope::Atproto),
                Scope::Known(KnownScope::TransitionGeneric),
            ]),
        },
        keys: None,
        state_store: MemoryStateStore::default(),
        session_store: store,
        resolver: OAuthResolverConfig {
            did_resolver: CommonDidResolver::new(CommonDidResolverConfig {
                plc_directory_url: "https://plc.directory".into(),
                http_client: shared.clone(),
            }),
            handle_resolver: AppViewHandleResolver::new(AppViewHandleResolverConfig {
                service_url: "https://public.api.bsky.app".into(),
                http_client: shared,
            }),
            authorization_server_metadata: Default::default(),
            protected_resource_metadata: Default::default(),
        },
        http_client: http,
    })
    .map_err(sdk_error)
}

async fn login(app: tauri::AppHandle, identifier: String) -> Result<Value, Failure> {
    if identifier.len() > 2048 || identifier.chars().any(char::is_control) {
        return Err(failure("policy", "Invalid Bluesky identifier."));
    }
    let (listener, redirect) = social::listener().await?;
    let handle = format!("native-bluesky:{}", social::random());
    let mut pending = social::PendingCredential(handle.clone(), false);
    let store = OsStore {
        handle: handle.clone(),
        redirect,
        memory: MemorySessionStore::default(),
    };
    let http = SafeHttp::default();
    let client = client(store.clone(), http.clone())?;
    record("bluesky_login", "discovery_par", None);
    let authorize = client
        .authorize(
            identifier,
            AuthorizeOptions {
                scopes: vec![
                    Scope::Known(KnownScope::Atproto),
                    Scope::Known(KnownScope::TransitionGeneric),
                ],
                ..Default::default()
            },
        )
        .await
        .map_err(sdk_error)?;
    let authorize = social::target(&authorize)?;
    let state = http
        .pending
        .lock()
        .unwrap()
        .clone()
        .ok_or_else(|| failure("oauth", "Bluesky provider did not complete PAR."))?;
    app.opener()
        .open_url(authorize.as_str(), None::<&str>)
        .map_err(|_| failure("browser", "Could not open the system browser."))?;
    record("bluesky_login", "browser_waiting", None);
    let query = social::callback(listener, "state", &state).await?;
    if url::form_urlencoded::parse(query.as_bytes()).any(|(k, _)| k == "error") {
        return Err(failure("cancelled", "Bluesky sign-in was declined."));
    }
    let params = serde_html_form::from_str(&query).map_err(sdk_error)?;
    record("bluesky_login", "callback_exchange", None);
    let (session, _) = client.callback(params).await.map_err(sdk_error)?;
    let did = session
        .did()
        .await
        .ok_or_else(|| failure("oauth", "Bluesky returned no identity."))?;
    let profile = session
        .send_xrpc::<_, Value, Value, Value>(&XrpcRequest {
            method: Method::GET,
            nsid: "app.bsky.actor.getProfile".into(),
            parameters: Some(vec![("actor", did.as_str())]),
            input: None,
            encoding: None,
        })
        .await
        .map_err(sdk_error)?;
    let OutputDataOrBytes::Data(profile) = profile else {
        return Err(failure("response", "Bluesky returned an invalid profile."));
    };
    // SDK verifies the token subject's DID document/PDS/issuer before creating session.
    if profile["did"].as_str() != Some(did.as_str()) {
        return Err(failure(
            "response",
            "Bluesky profile identity did not match the authorized account.",
        ));
    }
    pending.1 = true;
    Ok(
        json!({ "nativeHandle": handle, "profile": { "service": session.base_uri(), "did": did.as_str(), "handle": profile["handle"], "displayName": profile["displayName"], "avatar": profile["avatar"] } }),
    )
}
#[tauri::command]
pub async fn bluesky_login(app: tauri::AppHandle, identifier: String) -> Result<Value, Failure> {
    let _permit = LOGIN
        .try_acquire()
        .map_err(|_| failure("busy", "Bluesky sign-in is already open."))?;
    let result = tokio::time::timeout(Duration::from_secs(300), login(app, identifier))
        .await
        .unwrap_or_else(|_| {
            Err(failure(
                "timeout",
                "Bluesky sign-in timed out; start again.",
            ))
        });
    record(
        "bluesky_login",
        result
            .as_ref()
            .map(|_| "complete")
            .unwrap_or_else(|e| e.kind),
        None,
    );
    result
}

fn operation(
    url: &url::Url,
    method: &str,
    body: &Option<Value>,
    did: Option<&str>,
) -> Result<String, Failure> {
    let nsid = url.path().strip_prefix("/xrpc/").unwrap_or("");
    let read = matches!(
        nsid,
        "app.bsky.feed.getTimeline"
            | "app.bsky.feed.getAuthorFeed"
            | "app.bsky.feed.getPostThread"
            | "app.bsky.feed.getPosts"
            | "app.bsky.feed.getLikes"
            | "app.bsky.feed.getQuotes"
            | "app.bsky.feed.getRepostedBy"
            | "app.bsky.feed.getActorLikes"
            | "app.bsky.feed.searchPosts"
            | "app.bsky.actor.getProfile"
            | "app.bsky.actor.getProfiles"
            | "app.bsky.actor.searchActors"
            | "app.bsky.actor.searchActorsTypeahead"
            | "app.bsky.actor.getPreferences"
            | "app.bsky.actor.getSuggestions"
            | "app.bsky.feed.getActorFeeds"
            | "app.bsky.feed.getFeedGenerators"
            | "app.bsky.feed.getFeedGenerator"
            | "app.bsky.feed.getSuggestedFeeds"
            | "app.bsky.feed.getFeed"
            | "app.bsky.feed.getListFeed"
            | "app.bsky.graph.getList"
            | "app.bsky.graph.getLists"
            | "app.bsky.graph.getFollows"
            | "app.bsky.graph.getFollowers"
            | "app.bsky.graph.getSuggestedFollowsByActor"
            | "app.bsky.graph.getRelationships"
            | "app.bsky.graph.getBlocks"
            | "app.bsky.graph.getMutes"
            | "app.bsky.notification.listNotifications"
            | "app.bsky.notification.getUnreadCount"
            | "app.bsky.labeler.getServices"
            | "app.bsky.unspecced.getPopularFeedGenerators"
            | "app.bsky.unspecced.getTrendingTopics"
            | "app.bsky.unspecced.getTrends"
            | "com.atproto.identity.resolveHandle"
            | "com.atproto.repo.getRecord"
            | "com.atproto.repo.listRecords"
    );
    if method == "GET" && body.is_none() && read {
        return Ok(nsid.into());
    }
    if method == "POST" && did.is_some() && url.query().is_none() {
        if let Some(body) = body
            .as_ref()
            .filter(|b| b.is_object() && b.to_string().len() <= 65536)
        {
            if matches!(
                nsid,
                "app.bsky.notification.updateSeen"
                    | "app.bsky.graph.muteActor"
                    | "app.bsky.graph.unmuteActor"
            ) {
                return Ok(nsid.into());
            }
            if matches!(
                nsid,
                "com.atproto.repo.createRecord"
                    | "com.atproto.repo.deleteRecord"
                    | "com.atproto.repo.putRecord"
            ) && body["repo"].as_str() == did
                && matches!(
                    body["collection"].as_str(),
                    Some(
                        "app.bsky.feed.like"
                            | "app.bsky.feed.repost"
                            | "app.bsky.feed.post"
                            | "app.bsky.graph.follow"
                            | "app.bsky.graph.block"
                    )
                )
            {
                return Ok(nsid.into());
            }
        }
    }
    Err(failure(
        "policy",
        "This Bluesky operation is not supported by native transport. See Help > Open logs.",
    ))
}
async fn request(
    url: String,
    method: String,
    body: Option<Value>,
    handle: Option<String>,
    labelers: Vec<String>,
) -> Result<PublicResponse, Failure> {
    let url = social::target(&url)?;
    if labelers.len() > 20 || labelers.iter().any(|v| v.len() > 256) {
        return Err(failure("policy", "Invalid labeler selection."));
    }
    let Some(handle) = handle else {
        operation(&url, &method, &body, None)?;
        if url.origin().ascii_serialization() != "https://public.api.bsky.app" {
            return Err(failure(
                "policy",
                "Anonymous Bluesky reads use its public AppView.",
            ));
        }
        return social::json_request(url, None).await;
    };
    if !handle.starts_with("native-bluesky:") {
        return Err(failure(
            "policy",
            "Expected a native Bluesky account reference.",
        ));
    }
    let credential: Credential = social::load(&handle)?;
    let did = credential.session.token_set.sub.clone();
    if url.origin() != social::origin(&credential.session.token_set.aud)?.origin() {
        return Err(failure(
            "policy",
            "Bluesky credentials belong to another PDS.",
        ));
    }
    let nsid = operation(&url, &method, &body, Some(did.as_str()))?;
    let store = OsStore {
        handle,
        redirect: credential.redirect,
        memory: MemorySessionStore::default(),
    };
    store
        .memory
        .set(did.clone(), credential.session)
        .await
        .map_err(sdk_error)?;
    let client = client(store, SafeHttp::default())?;
    let session = client.restore(&did).await.map_err(sdk_error)?;
    let labelers = labelers
        .into_iter()
        .map(|d| d.parse::<Did>().map(|d| (d, false)))
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| failure("policy", "Invalid labeler DID."))?;
    session.configure_labelers_header(Some(labelers));
    let result = session
        .send_xrpc::<_, Value, Value, Value>(&XrpcRequest {
            method: if method == "GET" {
                Method::GET
            } else {
                Method::POST
            },
            nsid,
            parameters: Some(
                url.query_pairs()
                    .map(|(k, v)| (k.into_owned(), v.into_owned()))
                    .collect::<Vec<_>>(),
            ),
            input: body.map(InputDataOrBytes::Data),
            encoding: Some("application/json".into()),
        })
        .await;
    let (status, body) = match result {
        Ok(OutputDataOrBytes::Data(body)) => (200, body.to_string()),
        Ok(OutputDataOrBytes::Bytes(bytes)) if bytes.is_empty() => (204, "null".into()),
        Ok(_) => return Err(failure("response", "Expected Bluesky JSON.")),
        Err(atrium_xrpc::Error::XrpcResponse(error)) => (
            error.status.as_u16(),
            serde_json::to_string(&error.error).unwrap_or("null".into()),
        ),
        Err(atrium_xrpc::Error::Authentication(_)) => {
            (401, json!({"error":"AuthenticationRequired"}).to_string())
        }
        Err(error) => return Err(sdk_error(error)),
    };
    Ok(PublicResponse {
        status,
        body,
        headers: BTreeMap::new(),
    })
}
#[tauri::command]
pub async fn bluesky_request(
    url: String,
    method: String,
    body: Option<Value>,
    handle: Option<String>,
    labelers: Vec<String>,
) -> Result<PublicResponse, Failure> {
    let _permit = REQUESTS
        .try_acquire()
        .map_err(|_| failure("busy", "Too many Bluesky requests; retry shortly."))?;
    // One refresh owner across all IPC requests, including logout. No token races.
    let result = tokio::time::timeout(Duration::from_secs(60), async {
        let _guard = ACCOUNT_LOCK.lock().await;
        request(url, method, body, handle, labelers).await
    })
    .await
    .unwrap_or_else(|_| Err(failure("network", "Bluesky request timed out.")));
    record(
        "bluesky_request",
        result
            .as_ref()
            .map(|_| "complete")
            .unwrap_or_else(|e| e.kind),
        result.as_ref().ok().map(|r| r.status),
    );
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn sdk_http_cannot_contact_private_destinations() {
        tauri::async_runtime::block_on(async {
            for url in [
                "https://127.0.0.1/xrpc/a",
                "http://example.com/",
                "https://user:secret@example.com/",
                "https://example.com:8443/",
            ] {
                assert!(SafeHttp::default()
                    .send_http(Request::builder().uri(url).body(Vec::new()).unwrap())
                    .await
                    .is_err());
            }
        });
    }
    #[test]
    #[ignore = "Explicit live provider preflight; creates an unapproved PAR, never opens a browser or signs in"]
    fn live_oauth_discovery_and_par() {
        tauri::async_runtime::block_on(async {
            let (_, redirect) = social::listener().await.unwrap();
            let http = SafeHttp::default();
            let store = OsStore {
                handle: format!("native-bluesky:{}", social::random()),
                redirect,
                memory: MemorySessionStore::default(),
            };
            let client = client(store, http.clone()).unwrap();
            let url = client
                .authorize(
                    "https://bsky.social",
                    AuthorizeOptions {
                        scopes: vec![
                            Scope::Known(KnownScope::Atproto),
                            Scope::Known(KnownScope::TransitionGeneric),
                        ],
                        ..Default::default()
                    },
                )
                .await;
            // Failure debug output from SDK can contain URLs/state, so do not print it.
            assert!(
                url.is_ok(),
                "Live Bluesky discovery/PAR failed; inspect sanitized HTTP-stage diagnostics"
            );
            let url = social::target(&url.unwrap()).unwrap();
            assert_eq!(url.host_str(), Some("bsky.social"));
            assert!(http
                .pending
                .lock()
                .unwrap()
                .as_ref()
                .is_some_and(|s| !s.is_empty()));
        });
    }
    #[test]
    fn restricts_xrpc_writes_to_owned_social_records() {
        let url =
            url::Url::parse("https://pds.example/xrpc/com.atproto.repo.createRecord").unwrap();
        assert!(operation(
            &url,
            "POST",
            &Some(json!({"repo":"did:plc:mine", "collection":"app.bsky.feed.like"})),
            Some("did:plc:mine")
        )
        .is_ok());
        assert!(operation(
            &url,
            "POST",
            &Some(json!({"repo":"did:plc:other", "collection":"app.bsky.feed.like"})),
            Some("did:plc:mine")
        )
        .is_err());
        assert!(operation(
            &url,
            "POST",
            &Some(json!({"repo":"did:plc:mine", "collection":"app.bsky.actor.profile"})),
            Some("did:plc:mine")
        )
        .is_err());
        assert!(operation(&url, "GET", &None, Some("did:plc:mine")).is_err());
    }
}
