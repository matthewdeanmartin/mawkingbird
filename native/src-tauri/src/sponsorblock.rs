//! SponsorBlock's crowd-sourced skip segments for the Watch page. Privacy-
//! preserving by design: the renderer sends only the first four hex digits of
//! the SHA-256 of a video ID, and SponsorBlock answers for every video sharing
//! that prefix. One fixed host, path and category list. Read-only: nothing is
//! ever submitted or voted. See mawkingbird/spec/youtube-client.md (S4).
use crate::public_mastodon::{client_for, failure, Failure};
use std::time::Duration;
use url::Url;

const MAX_RESPONSE_BYTES: usize = 512 * 1024;
/// Mirrors `SPONSOR_CATEGORIES` in the client's `sponsor-block.ts`.
const CATEGORIES: &str = r#"["sponsor","selfpromo","interaction","intro","outro"]"#;

fn prefix_valid(prefix: &str) -> bool {
    prefix.len() == 4
        && prefix
            .bytes()
            .all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'))
}

fn segments_url(prefix: &str) -> Result<Url, Failure> {
    if !prefix_valid(prefix) {
        return Err(failure("policy", "Invalid SponsorBlock hash prefix."));
    }
    Url::parse_with_params(
        &format!("https://sponsor.ajay.app/api/skipSegments/{prefix}"),
        &[("categories", CATEGORIES)],
    )
    .map_err(|_| failure("policy", "Invalid SponsorBlock request."))
}

async fn read(mut response: reqwest::Response) -> Result<String, Failure> {
    // No segments for any video with this prefix is a 404, not an error.
    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok("[]".into());
    }
    if response.status().is_redirection() {
        return Err(failure("policy", "SponsorBlock redirected this request."));
    }
    if !response.status().is_success() {
        return Err(failure("upstream", "SponsorBlock refused this request."));
    }
    let mime = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .split(';')
        .next()
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase();
    if mime != "application/json" {
        return Err(failure("response", "SponsorBlock did not return JSON."));
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| failure("network", "SponsorBlock response was interrupted."))?
    {
        if bytes.len() + chunk.len() > MAX_RESPONSE_BYTES {
            return Err(failure(
                "too-large",
                "SponsorBlock response exceeded the size limit.",
            ));
        }
        bytes.extend_from_slice(&chunk);
    }
    String::from_utf8(bytes).map_err(|_| failure("response", "SponsorBlock JSON was not UTF-8."))
}

#[tauri::command]
pub async fn sponsorblock_segments(prefix: String) -> Result<String, Failure> {
    let result = async {
        let url = segments_url(&prefix)?;
        let request = client_for(&url)
            .await?
            .get(url)
            .header("Accept", "application/json")
            .header("Accept-Encoding", "identity")
            .send();
        let response = tokio::time::timeout(Duration::from_secs(10), request)
            .await
            .map_err(|_| failure("upstream-timeout", "SponsorBlock request timed out."))?
            .map_err(|_| failure("network", "Could not reach SponsorBlock."))?;
        read(response).await
    }
    .await;
    crate::diagnostics::record(
        "sponsorblock_read",
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
    fn only_a_hash_prefix_reaches_the_fixed_endpoint() {
        let url = segments_url("a1b2").unwrap();
        assert_eq!(
            url.origin().ascii_serialization(),
            "https://sponsor.ajay.app"
        );
        assert_eq!(url.path(), "/api/skipSegments/a1b2");
        let categories: String = url
            .query_pairs()
            .find(|(k, _)| k == "categories")
            .map(|(_, v)| v.into_owned())
            .unwrap();
        assert_eq!(categories, CATEGORIES);
        assert_eq!(url.query_pairs().count(), 1);
        // A full video ID, upper case, other lengths or path tricks are refused.
        for bad in [
            "",
            "abc",
            "abcde",
            "A1B2",
            "dQw4w9WgXcQ",
            "../a",
            "a1b?",
            "a1 2",
        ] {
            assert_eq!(segments_url(bad).unwrap_err().kind, "policy", "{bad}");
        }
    }
}
