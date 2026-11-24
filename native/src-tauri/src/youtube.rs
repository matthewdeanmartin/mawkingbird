//! Anonymous YouTube web-client reads (search, channel pages, video details,
//! comments) for the shared video client. A scoped transport, not a proxy:
//! one fixed origin, four fixed endpoints, JSON in and JSON out, no cookies,
//! no redirects, no Google identity. Player responses lose their stream URLs
//! here, so playback can only ever happen in the official embed.
//! See mawkingbird/spec/youtube-client.md ("Native transport").
use crate::public_mastodon::{client_for, failure, Failure};
use std::time::Duration;
use tokio::sync::Semaphore;
use url::Url;

const MAX_REQUEST_BYTES: usize = 64 * 1024;
const MAX_RESPONSE_BYTES: usize = 8 * 1024 * 1024;
static QUEUE: Semaphore = Semaphore::const_new(8);
static WORKERS: Semaphore = Semaphore::const_new(2);

/// Fields of a player response that locate or monetise media. Dropped before
/// the renderer sees the JSON.
const PLAYER_STRIPPED: [&str; 4] = ["streamingData", "playerAds", "adPlacements", "adSlots"];

fn endpoint_url(endpoint: &str) -> Result<Url, Failure> {
    if !matches!(endpoint, "search" | "browse" | "player" | "next") {
        return Err(failure("policy", "This YouTube endpoint is not allowed."));
    }
    Url::parse(&format!(
        "https://www.youtube.com/youtubei/v1/{endpoint}?prettyPrint=false"
    ))
    .map_err(|_| failure("policy", "Invalid YouTube endpoint."))
}

/// Only the web-client identification headers youtubei.js sends; anything
/// else (cookies, authorization, origin overrides) is refused, not dropped,
/// so a renderer bug cannot pass silently.
fn client_header(name: &str, value: &str) -> Result<(), Failure> {
    let allowed = match name.to_ascii_lowercase().as_str() {
        "x-youtube-client-name" => value.len() <= 4 && value.bytes().all(|b| b.is_ascii_digit()),
        "x-youtube-client-version" => {
            value.len() <= 32 && value.bytes().all(|b| b.is_ascii_digit() || b == b'.')
        }
        "x-goog-visitor-id" => {
            value.len() <= 128
                && value
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'%' | b'='))
        }
        _ => false,
    };
    if allowed {
        Ok(())
    } else {
        Err(failure(
            "policy",
            "This YouTube request header is not allowed.",
        ))
    }
}

fn request_body(body: &str) -> Result<(), Failure> {
    if body.len() > MAX_REQUEST_BYTES {
        return Err(failure("policy", "YouTube request body is too large."));
    }
    match serde_json::from_str::<serde_json::Value>(body) {
        Ok(serde_json::Value::Object(_)) => Ok(()),
        _ => Err(failure(
            "policy",
            "YouTube request body must be a JSON object.",
        )),
    }
}

fn strip_player(endpoint: &str, text: String) -> Result<String, Failure> {
    if endpoint != "player" {
        return Ok(text);
    }
    let mut value: serde_json::Value = serde_json::from_str(&text)
        .map_err(|_| failure("response", "YouTube returned unreadable video details."))?;
    if let Some(object) = value.as_object_mut() {
        for key in PLAYER_STRIPPED {
            object.remove(key);
        }
    }
    Ok(value.to_string())
}

async fn read(mut response: reqwest::Response) -> Result<String, Failure> {
    if response.status().is_redirection() {
        return Err(failure("policy", "YouTube redirected this request."));
    }
    if !response.status().is_success() {
        crate::diagnostics::record("youtube_http", "status", Some(response.status().as_u16()));
        return Err(failure("upstream", "YouTube refused this request."));
    }
    let mime = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    if mime.split(';').next().map(str::trim) != Some("application/json") {
        return Err(failure("response", "YouTube did not return JSON."));
    }
    if response
        .content_length()
        .is_some_and(|n| n > MAX_RESPONSE_BYTES as u64)
    {
        return Err(failure(
            "too-large",
            "YouTube response exceeded the size limit.",
        ));
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| failure("network", "YouTube response was interrupted."))?
    {
        if bytes.len() + chunk.len() > MAX_RESPONSE_BYTES {
            return Err(failure(
                "too-large",
                "YouTube response exceeded the size limit.",
            ));
        }
        bytes.extend_from_slice(&chunk);
    }
    String::from_utf8(bytes).map_err(|_| failure("response", "YouTube JSON was not UTF-8."))
}

async fn fetch(
    endpoint: &str,
    body: String,
    headers: Vec<(String, String)>,
) -> Result<String, Failure> {
    let url = endpoint_url(endpoint)?;
    request_body(&body)?;
    for (name, value) in &headers {
        client_header(name, value)?;
    }
    let _worker = WORKERS
        .acquire()
        .await
        .map_err(|_| failure("busy", "YouTube reader is unavailable."))?;
    let mut request = client_for(&url)
        .await?
        .post(url)
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .header("Accept-Encoding", "identity")
        .body(body);
    for (name, value) in headers {
        request = request.header(name, value);
    }
    let response = request
        .send()
        .await
        .map_err(|_| failure("network", "Could not reach YouTube."))?;
    strip_player(endpoint, read(response).await?)
}

#[tauri::command]
pub async fn youtube_innertube(
    endpoint: String,
    body: String,
    headers: Vec<(String, String)>,
) -> Result<String, Failure> {
    let result = async {
        let _queue = QUEUE
            .try_acquire()
            .map_err(|_| failure("busy", "Too many pending YouTube requests; retry shortly."))?;
        tokio::time::timeout(Duration::from_secs(20), fetch(&endpoint, body, headers))
            .await
            .map_err(|_| failure("upstream-timeout", "YouTube request timed out."))?
    }
    .await;
    crate::diagnostics::record(
        "youtube_read",
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
    fn only_the_four_web_client_endpoints_on_one_origin() {
        for endpoint in ["search", "browse", "player", "next"] {
            let url = endpoint_url(endpoint).unwrap();
            assert_eq!(
                url.origin().ascii_serialization(),
                "https://www.youtube.com"
            );
            assert_eq!(url.path(), format!("/youtubei/v1/{endpoint}"));
        }
        for endpoint in [
            "",
            "get_watch",
            "account/account_menu",
            "like/like",
            "subscription/subscribe",
            "comment/create_comment",
            "../search",
            "search/../like/like",
            "search?x=1",
            "SEARCH",
        ] {
            assert_eq!(
                endpoint_url(endpoint).unwrap_err().kind,
                "policy",
                "{endpoint}"
            );
        }
    }

    #[test]
    fn identity_and_cookie_headers_are_refused() {
        assert!(client_header("X-YouTube-Client-Name", "1").is_ok());
        assert!(client_header("x-youtube-client-version", "2.20261117.01.00").is_ok());
        assert!(client_header("x-goog-visitor-id", "Cgt4eF9hYmMxMjM0NSiA%3D%3D").is_ok());
        for (name, value) in [
            ("cookie", "SID=1"),
            ("authorization", "Bearer x"),
            ("origin", "https://evil.test"),
            ("host", "evil.test"),
            ("x-goog-authuser", "0"),
            ("x-youtube-client-version", "2.0\r\nCookie: SID=1"),
            ("x-youtube-client-name", "WEB"),
            ("x-goog-visitor-id", "a b"),
        ] {
            assert!(client_header(name, value).is_err(), "{name}");
        }
    }

    #[test]
    fn request_bodies_are_bounded_json_objects() {
        assert!(request_body(r#"{"query":"technology connections"}"#).is_ok());
        assert!(request_body("[]").is_err());
        assert!(request_body("query=x").is_err());
        let huge = format!(r#"{{"q":"{}"}}"#, "x".repeat(MAX_REQUEST_BYTES));
        assert!(request_body(&huge).is_err());
    }

    #[test]
    fn player_responses_never_carry_stream_urls() {
        let raw = r#"{"videoDetails":{"videoId":"abc","lengthSeconds":"60"},
            "streamingData":{"formats":[{"url":"https://rr1.googlevideo.com/x"}]},
            "playerAds":[1],"adPlacements":[2],"adSlots":[3],
            "microformat":{"playerMicroformatRenderer":{"isFamilySafe":true}}}"#;
        let stripped = strip_player("player", raw.to_owned()).unwrap();
        assert!(!stripped.contains("googlevideo"));
        assert!(!stripped.contains("streamingData"));
        assert!(!stripped.contains("playerAds"));
        assert!(stripped.contains("isFamilySafe"));
        // Other endpoints pass through untouched (no parse cost on search pages).
        assert_eq!(
            strip_player("search", "not json".into()).unwrap(),
            "not json"
        );
        assert!(strip_player("player", "not json".into()).is_err());
    }
}
