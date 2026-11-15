//! Shared native social boundary. No renderer-selected headers or credentials.
use crate::{
    diagnostics::record,
    public_mastodon::{client_for, failure, Failure, PublicResponse},
};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use rand::{rngs::OsRng, RngCore};
use serde::{de::DeserializeOwned, Serialize};
use std::{
    collections::BTreeMap,
    io::{Read, Write},
    time::Duration,
};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
};
use url::Url;

pub fn random() -> String {
    let mut bytes = [0; 32];
    OsRng.fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}
pub fn target(raw: &str) -> Result<Url, Failure> {
    let url = crate::feeds::validate_url(raw)?;
    if url.scheme() != "https" {
        return Err(failure("policy", "Social accounts require HTTPS."));
    }
    Ok(url)
}
pub fn origin(raw: &str) -> Result<Url, Failure> {
    let url = target(raw)?;
    if url.path() != "/" || url.query().is_some() {
        return Err(failure("policy", "Select the server's HTTPS origin."));
    }
    Ok(url)
}
fn entry(handle: &str) -> Result<keyring::Entry, Failure> {
    if cfg!(target_os = "android") {
        return Err(failure(
            "unsupported",
            "Saved accounts are not available in the experimental Android reader yet.",
        ));
    }
    let (provider, id) = handle
        .split_once(':')
        .ok_or_else(|| failure("policy", "Invalid native account reference."))?;
    if !matches!(
        provider,
        "native-bluesky" | "native-misskey" | "native-connector" | "native-rentry" | "native-hugo"
    ) || id.len() != 43
        || !id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
    {
        return Err(failure("policy", "Invalid native account reference."));
    }
    keyring::Entry::new(&format!("com.mawkingbird.{provider}"), id).map_err(|_| {
        failure(
            "credentials",
            "OS credential storage is unavailable. See Help > Open logs.",
        )
    })
}

/// Remove a partially exchanged OAuth session on error, cancellation or timeout.
pub struct PendingCredential(pub String, pub bool);
impl Drop for PendingCredential {
    fn drop(&mut self) {
        if !self.1 {
            if let Ok(entry) = entry(&self.0) {
                let _ = entry.delete_credential();
            }
        }
    }
}
pub fn save<T: Serialize>(handle: &str, value: &T) -> Result<(), Failure> {
    let bytes = serde_json::to_vec(value)
        .map_err(|_| failure("credentials", "Could not encode native account."))?;
    if bytes.len() > 32768 {
        return Err(failure(
            "credentials",
            "Native account record is too large.",
        ));
    }
    // Compression keeps OAuth JWT/key material within Windows credential limits.
    let mut encoder = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
    encoder
        .write_all(&bytes)
        .map_err(|_| failure("credentials", "Could not encode native account."))?;
    let bytes = encoder
        .finish()
        .map_err(|_| failure("credentials", "Could not encode native account."))?;
    entry(handle)?.set_secret(&bytes).map_err(|_| {
        failure(
            "credentials",
            "Could not save native account in the OS store. See Help > Open logs.",
        )
    })
}
pub fn load<T: DeserializeOwned>(handle: &str) -> Result<T, Failure> {
    let bytes = entry(handle)?.get_secret().map_err(|_| {
        failure(
            "credentials",
            "Native credentials are unavailable. Unlock the OS store or sign in again.",
        )
    })?;
    let mut decoded = Vec::new();
    flate2::read::GzDecoder::new(bytes.as_slice())
        .take(32769)
        .read_to_end(&mut decoded)
        .map_err(|_| failure("credentials", "Native account record is invalid."))?;
    if decoded.len() > 32768 {
        return Err(failure(
            "credentials",
            "Native account record is too large.",
        ));
    }
    serde_json::from_slice(&decoded)
        .map_err(|_| failure("credentials", "Native account record is invalid."))
}
pub fn delete_credential(handle: &str) -> Result<(), Failure> {
    match entry(handle)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => Err(failure(
            "credentials",
            "Could not remove native credentials. See Help > Open logs.",
        )),
    }
}
#[tauri::command]
pub async fn forget_social_account(handle: String) -> Result<(), Failure> {
    if handle.starts_with("native-connector:")
        || handle.starts_with("native-rentry:")
        || handle.starts_with("native-hugo:")
    {
        return Err(failure(
            "policy",
            "Use connector removal for connector credentials.",
        ));
    }
    // Serialize removal with refresh, so an in-flight response cannot resurrect a token.
    let _guard = crate::bluesky::ACCOUNT_LOCK.lock().await;
    let result = delete_credential(&handle);
    record(
        "social_forget",
        if result.is_ok() {
            "complete"
        } else {
            "credentials"
        },
        None,
    );
    result
}

pub async fn json_request(
    url: Url,
    body: Option<serde_json::Value>,
) -> Result<PublicResponse, Failure> {
    let client = client_for(&url).await?;
    let request = if let Some(body) = body {
        client.post(url).json(&body)
    } else {
        client.get(url)
    };
    let response = request
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|_| {
            failure(
                "network",
                "Native social request failed. See Help > Open logs.",
            )
        })?;
    let status = response.status().as_u16();
    record("social_http", "response", Some(status));
    if status == 204 {
        return Ok(PublicResponse {
            status,
            headers: BTreeMap::new(),
            body: "null".into(),
        });
    }
    crate::public_mastodon::read_json(response).await
}
pub fn value(response: PublicResponse) -> Result<serde_json::Value, Failure> {
    if !(200..300).contains(&response.status) {
        return Err(failure(
            "upstream",
            "The provider refused this sign-in step. See Help > Open logs for its status.",
        ));
    }
    serde_json::from_str(&response.body)
        .map_err(|_| failure("response", "Invalid social response."))
}

/// Ignore unrelated/duplicate callbacks; only the active opaque state can finish.
pub fn callback_query(target: &str, key: &str, expected: &str) -> Option<String> {
    if !target.starts_with("/callback?") || target.len() > 8192 {
        return None;
    }
    let url = Url::parse(&format!("http://127.0.0.1{target}")).ok()?;
    let values: Vec<_> = url
        .query_pairs()
        .filter(|(k, _)| k == key)
        .map(|(_, v)| v.into_owned())
        .collect();
    if values != [expected] {
        return None;
    }
    for name in ["code", "iss", "error"] {
        if url.query_pairs().filter(|(k, _)| k == name).count() > 1 {
            return None;
        }
    }
    url.query().map(str::to_owned)
}
pub async fn callback(listener: TcpListener, key: &str, expected: &str) -> Result<String, Failure> {
    loop {
        let (mut stream, _) = listener
            .accept()
            .await
            .map_err(|_| failure("callback", "Could not receive sign-in callback."))?;
        let query = tokio::time::timeout(Duration::from_secs(3), async {
            let mut bytes = Vec::new();
            let mut chunk = [0; 1024];
            while bytes.len() < 8192 {
                let count = stream.read(&mut chunk).await.ok()?;
                if count == 0 {
                    break;
                }
                bytes.extend_from_slice(&chunk[..count]);
                if bytes.windows(4).any(|w| w == b"\r\n\r\n") {
                    break;
                }
            }
            let request = std::str::from_utf8(&bytes).ok()?;
            let target = request
                .lines()
                .next()?
                .strip_prefix("GET ")?
                .strip_suffix(" HTTP/1.1")?;
            callback_query(target, key, expected)
        })
        .await
        .ok()
        .flatten();
        let body = if query.is_some() {
            "Sign-in response received. Return to Mawkingbird Native."
        } else {
            "Not a pending sign-in callback."
        };
        let response = format!("HTTP/1.1 {}\r\nContent-Type: text/plain\r\nContent-Length: {}\r\nCache-Control: no-store\r\nContent-Security-Policy: default-src 'none'\r\nConnection: close\r\n\r\n{}", if query.is_some() { "200 OK" } else { "400 Bad Request" }, body.len(), body);
        let _ = tokio::time::timeout(
            Duration::from_secs(2),
            stream.write_all(response.as_bytes()),
        )
        .await;
        if let Some(query) = query {
            return Ok(query);
        }
    }
}
pub async fn listener() -> Result<(TcpListener, String), Failure> {
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|_| failure("callback", "Could not start sign-in callback."))?;
    let port = listener
        .local_addr()
        .map_err(|_| failure("callback", "Callback address unavailable."))?
        .port();
    Ok((listener, format!("http://127.0.0.1:{port}/callback")))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn callbacks_bind_exact_state_and_reject_duplicates() {
        assert!(callback_query(
            "/callback?state=ours&code=code&iss=https%3A%2F%2Fbsky.social",
            "state",
            "ours"
        )
        .is_some());
        for target in [
            "/callback?state=wrong&code=code",
            "/callback?state=ours&state=ours&code=code",
            "/callback?state=ours&code=a&code=b",
            "/callback?state=ours&iss=a&iss=b",
            "https://evil/callback?state=ours&code=code",
        ] {
            assert!(callback_query(target, "state", "ours").is_none());
        }
        assert!(callback_query("/callback?session=ours", "session", "ours").is_some());
    }
    #[test]
    fn callback_uses_real_loopback_socket() {
        tauri::async_runtime::block_on(async {
            let (listener, redirect) = listener().await.unwrap();
            let address = listener.local_addr().unwrap();
            let task = tokio::spawn(async move { callback(listener, "session", "expected").await });
            for state in ["wrong", "expected"] {
                let mut socket = tokio::net::TcpStream::connect(address).await.unwrap();
                socket
                    .write_all(
                        format!(
                            "GET /callback?session={state} HTTP/1.1\r\nHost: localhost\r\n\r\n"
                        )
                        .as_bytes(),
                    )
                    .await
                    .unwrap();
                let mut response = Vec::new();
                socket.read_to_end(&mut response).await.unwrap();
                assert!(String::from_utf8(response)
                    .unwrap()
                    .starts_with(if state == "wrong" {
                        "HTTP/1.1 400"
                    } else {
                        "HTTP/1.1 200"
                    }));
            }
            assert_eq!(task.await.unwrap().unwrap(), "session=expected");
            assert!(redirect.starts_with("http://127.0.0.1:"));
        });
    }
    #[cfg(target_os = "windows")]
    #[test]
    fn compressed_os_credentials_roundtrip_and_delete() {
        for provider in ["native-misskey", "native-bluesky"] {
            let handle = format!("{provider}:{}", random());
            let secret = serde_json::json!({"access": random(), "refresh": random(), "key": random(), "metadata": "x".repeat(4096)});
            save(&handle, &secret).unwrap();
            assert_eq!(load::<serde_json::Value>(&handle).unwrap(), secret);
            tauri::async_runtime::block_on(forget_social_account(handle.clone())).unwrap();
            assert!(load::<serde_json::Value>(&handle).is_err());
        }
        assert!(entry("native-mastodon:wrong-provider").is_err());
    }
}
