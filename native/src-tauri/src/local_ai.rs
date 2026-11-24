//! A local OpenAI-compatible server (Ollama, LM Studio, llama.cpp) as a free
//! alternative to OpenRouter (parity item 1).
//!
//! The user enters exactly one loopback endpoint in Settings; this module
//! allows that exact host and port and nothing else: no LAN, no `.local`, no
//! IP ranges, no other ports, and never through a proxy. It has its own typed
//! command, so the public destination policy (and its `mastomini.local` rule)
//! is unchanged. Only two operations exist: list models and chat completions.
use crate::public_mastodon::{failure, Failure, PublicResponse};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::BTreeMap,
    net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr},
    path::PathBuf,
    sync::{OnceLock, RwLock},
    time::Duration,
};
use tauri::Manager;
use tokio::sync::Semaphore;
use url::Url;

/// Image descriptions send the picture inline; leave room for a large photo.
const MAX_REQUEST: usize = 16 * 1024 * 1024;
const MAX_RESPONSE: usize = 4 * 1024 * 1024;
static REQUESTS: Semaphore = Semaphore::const_new(2);
static ENDPOINT: RwLock<Option<Url>> = RwLock::new(None);
static CONFIG_PATH: OnceLock<PathBuf> = OnceLock::new();

#[derive(Deserialize, Serialize, Default)]
struct Saved {
    endpoint: Option<String>,
}

#[derive(Serialize)]
pub struct LocalAiStatus {
    pub endpoint: Option<String>,
}

/// `http://127.0.0.1:<port>` or `http://localhost:<port>`, and nothing else.
fn endpoint(raw: &str) -> Result<Url, Failure> {
    let denied = || {
        failure(
            "policy",
            "Enter a local address like http://127.0.0.1:11434 or http://localhost:1234.",
        )
    };
    if raw.len() > 64 || raw.chars().any(char::is_control) {
        return Err(denied());
    }
    let url = Url::parse(raw.trim()).map_err(|_| denied())?;
    let port = url.port().ok_or_else(denied)?;
    if url.scheme() != "http"
        || !matches!(url.host_str(), Some("127.0.0.1" | "localhost"))
        || port == 0
        || !url.username().is_empty()
        || url.password().is_some()
        || !matches!(url.path(), "" | "/")
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(denied());
    }
    Url::parse(&format!(
        "http://{}:{port}",
        url.host_str().unwrap_or("127.0.0.1")
    ))
    .map_err(|_| denied())
}

/// Only the two operations the AI features use, with a checked body.
fn operation(path: &str, method: &str, body: Option<&Value>) -> Result<(), Failure> {
    let denied = || failure("policy", "This local AI operation is not supported.");
    match (method, path) {
        ("GET", "/v1/models") if body.is_none() => Ok(()),
        ("POST", "/v1/chat/completions") => {
            let o = body.and_then(Value::as_object).ok_or_else(denied)?;
            if !o.keys().all(|k| {
                matches!(
                    k.as_str(),
                    "model" | "max_tokens" | "messages" | "response_format" | "temperature"
                )
            }) || !o.get("model").and_then(Value::as_str).is_some_and(|s| {
                !s.is_empty() && s.len() <= 256 && !s.chars().any(char::is_control)
            }) || !o
                .get("messages")
                .and_then(Value::as_array)
                .is_some_and(|m| {
                    !m.is_empty()
                        && m.len() <= 8
                        && m.iter().all(|message| {
                            matches!(message["role"].as_str(), Some("user" | "system"))
                                && (message["content"].is_string() || message["content"].is_array())
                        })
                })
                || o.get("max_tokens")
                    .is_some_and(|n| !n.as_u64().is_some_and(|n| (1..=8000).contains(&n)))
            {
                return Err(denied());
            }
            Ok(())
        }
        _ => Err(denied()),
    }
}

fn client(url: &Url) -> Result<reqwest::Client, Failure> {
    let port = url
        .port()
        .ok_or_else(|| failure("policy", "Missing local AI port."))?;
    let host = url.host_str().unwrap_or("127.0.0.1");
    // Loopback only, pinned: "localhost" never goes to a resolver, and the
    // proxy setting never applies to this client.
    let addresses = [
        SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), port),
        SocketAddr::new(IpAddr::V6(Ipv6Addr::LOCALHOST), port),
    ];
    reqwest::Client::builder()
        .no_proxy()
        .resolve_to_addrs(host, &addresses)
        .redirect(reqwest::redirect::Policy::none())
        .retry(reqwest::retry::never())
        .connect_timeout(Duration::from_secs(3))
        // Local models can be slow, especially on the first request.
        .timeout(Duration::from_secs(180))
        .user_agent("MawkingbirdNative/0.1 (local AI)")
        .build()
        .map_err(|_| failure("network", "Could not initialize the local AI transport."))
}

pub fn init(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let path = app.path().app_config_dir()?.join("local_ai.json");
    let saved = std::fs::read(&path)
        .ok()
        .and_then(|bytes| serde_json::from_slice::<Saved>(&bytes).ok())
        .unwrap_or_default();
    let url = saved.endpoint.as_deref().and_then(|raw| endpoint(raw).ok());
    if let Ok(mut current) = ENDPOINT.write() {
        *current = url;
    }
    let _ = CONFIG_PATH.set(path);
    Ok(())
}

fn current() -> Option<Url> {
    ENDPOINT.read().ok().and_then(|e| e.clone())
}

#[tauri::command]
pub fn local_ai_status() -> LocalAiStatus {
    LocalAiStatus {
        endpoint: current().map(|u| u.as_str().trim_end_matches('/').to_string()),
    }
}

/// Save (or clear, with null) the one endpoint the local AI command may reach.
#[tauri::command]
pub fn local_ai_set_endpoint(endpoint_url: Option<String>) -> Result<LocalAiStatus, Failure> {
    let url = match endpoint_url
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        Some(raw) => Some(endpoint(raw)?),
        None => None,
    };
    if let Some(path) = CONFIG_PATH.get() {
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let saved = Saved {
            endpoint: url.as_ref().map(|u| u.to_string()),
        };
        std::fs::write(path, serde_json::to_vec(&saved).unwrap_or_default())
            .map_err(|_| failure("storage", "Could not save the local AI setting."))?;
    }
    if let Ok(mut current) = ENDPOINT.write() {
        *current = url;
    }
    Ok(local_ai_status())
}

#[tauri::command]
pub async fn local_ai_request(
    path: String,
    method: String,
    body: Option<String>,
) -> Result<PublicResponse, Failure> {
    let base = current().ok_or_else(|| {
        failure(
            "not_configured",
            "Set up Local AI in Settings → Connections first.",
        )
    })?;
    if body.as_ref().is_some_and(|b| b.len() > MAX_REQUEST) {
        return Err(failure("policy", "The request is too large for local AI."));
    }
    let parsed = match body.as_deref() {
        Some(raw) => Some(
            serde_json::from_str::<Value>(raw)
                .map_err(|_| failure("policy", "This local AI operation is not supported."))?,
        ),
        None => None,
    };
    operation(&path, &method, parsed.as_ref())?;
    let _permit = REQUESTS
        .try_acquire()
        .map_err(|_| failure("busy", "Local AI is still working on the last request."))?;
    let url = base
        .join(&path)
        .map_err(|_| failure("policy", "This local AI operation is not supported."))?;
    let mut request = client(&base)?
        .request(
            reqwest::Method::from_bytes(method.as_bytes())
                .map_err(|_| failure("policy", "Invalid method."))?,
            url,
        )
        .header("Accept", "application/json");
    if let Some(body) = body {
        request = request
            .header("Content-Type", "application/json")
            .body(body);
    }
    let result = async {
        let mut response = request.send().await.map_err(|error| {
            if error.is_timeout() {
                failure("timeout", "The local AI server took too long to answer.")
            } else {
                failure(
                    "not_running",
                    "The local AI server isn't running. Start it (for example Ollama or LM Studio) and try again.",
                )
            }
        })?;
        let status = response.status().as_u16();
        let mut bytes = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|_| failure("network", "The local AI answer was interrupted."))?
        {
            if bytes.len() + chunk.len() > MAX_RESPONSE {
                return Err(failure("response", "The local AI answer was too large."));
            }
            bytes.extend_from_slice(&chunk);
        }
        // Errors are passed on as the server wrote them: the UI shows the
        // model's own message (for example when it can't read images).
        let body = String::from_utf8_lossy(&bytes).into_owned();
        Ok(PublicResponse {
            status,
            headers: BTreeMap::new(),
            body,
        })
    }
    .await;
    crate::diagnostics::record(
        "local_ai",
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
    use serde_json::json;

    #[test]
    fn allows_only_one_exact_loopback_host_and_port() {
        for ok in [
            "http://127.0.0.1:11434",
            "http://localhost:1234",
            "http://127.0.0.1:11434/",
            " http://localhost:8080 ",
        ] {
            assert!(endpoint(ok).is_ok(), "{ok}");
        }
        for bad in [
            "http://127.0.0.1",          // no port
            "https://127.0.0.1:11434",   // not plain local HTTP
            "http://192.168.1.10:11434", // LAN
            "http://10.0.0.2:11434",
            "http://mastomini.local:11434", // .local is not loopback
            "http://ollama.local:11434",
            "http://127.0.0.2:11434", // other loopback addresses
            "http://[::1]:11434",
            "http://localhost.evil.example:1234",
            "http://user:pw@127.0.0.1:11434",
            "http://127.0.0.1:11434/v1", // a path smuggled into the base
            "http://127.0.0.1:11434/?x=1",
            "http://example.com:11434",
            "file:///etc/passwd",
        ] {
            assert!(endpoint(bad).is_err(), "{bad}");
        }
        assert_eq!(
            endpoint("http://localhost:1234/").unwrap().as_str(),
            "http://localhost:1234/"
        );
    }

    #[test]
    fn only_models_and_chat_completions() {
        assert!(operation("/v1/models", "GET", None).is_ok());
        let chat =
            json!({"model":"llama3","max_tokens":200,"messages":[{"role":"user","content":"hi"}]});
        assert!(operation("/v1/chat/completions", "POST", Some(&chat)).is_ok());
        let image = json!({"model":"llava","messages":[{"role":"user","content":[
            {"type":"text","text":"describe"},
            {"type":"image_url","image_url":{"url":"data:image/png;base64,AA=="}}
        ]}]});
        assert!(operation("/v1/chat/completions", "POST", Some(&image)).is_ok());
        for (path, method, body) in [
            ("/v1/models", "POST", None),
            ("/v1/embeddings", "POST", Some(chat.clone())),
            ("/api/pull", "POST", Some(json!({"name":"x"}))),
            ("/v1/chat/completions", "GET", None),
            (
                "/v1/chat/completions",
                "POST",
                Some(json!({"model":"m","messages":[],"stream":true})),
            ),
            (
                "/v1/chat/completions",
                "POST",
                Some(json!({"model":"","messages":[{"role":"user","content":"x"}]})),
            ),
            (
                "/v1/chat/completions",
                "POST",
                Some(json!({"model":"m","messages":[{"role":"assistant","content":"x"}]})),
            ),
        ] {
            assert!(
                operation(path, method, body.as_ref()).is_err(),
                "{method} {path}"
            );
        }
    }

    #[test]
    fn refused_connection_is_reported_as_not_running() {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap()
            .block_on(async {
                // Find a free port and leave it closed.
                let port = std::net::TcpListener::bind("127.0.0.1:0")
                    .unwrap()
                    .local_addr()
                    .unwrap()
                    .port();
                *ENDPOINT.write().unwrap() =
                    Some(endpoint(&format!("http://127.0.0.1:{port}")).unwrap());
                let error = local_ai_request("/v1/models".into(), "GET".into(), None)
                    .await
                    .err()
                    .unwrap();
                assert_eq!(error.kind, "not_running");
                *ENDPOINT.write().unwrap() = None;
                let error = local_ai_request("/v1/models".into(), "GET".into(), None)
                    .await
                    .err()
                    .unwrap();
                assert_eq!(error.kind, "not_configured");
            });
    }
}
