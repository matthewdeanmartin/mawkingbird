//! One fixed Wikidata question for the video client: which Mastodon address
//! (P4033) belongs to the item with this YouTube channel ID (P2397)? The
//! renderer supplies only a validated channel ID; the SPARQL is built here, so
//! no arbitrary query, host or path can be sent. Public data, no identity.
//! See mawkingbird/spec/youtube-client.md (CreatorLinks).
use crate::public_mastodon::{client_for, failure, Failure};
use std::time::Duration;
use url::Url;

const MAX_RESPONSE_BYTES: usize = 256 * 1024;

fn channel_id_valid(id: &str) -> bool {
    id.len() == 24
        && id.starts_with("UC")
        && id[2..]
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

/// The SPARQL text for one channel. Exported shape is mirrored by the web
/// build (`creator-links.ts`, `wikidataQuery`).
fn query(channel_id: &str) -> String {
    format!(
        "SELECT ?item ?mastodon WHERE {{ ?item wdt:P2397 \"{channel_id}\" . OPTIONAL {{ ?item wdt:P4033 ?mastodon }} }} LIMIT 5"
    )
}

fn query_url(channel_id: &str) -> Result<Url, Failure> {
    if !channel_id_valid(channel_id) {
        return Err(failure("policy", "Invalid YouTube channel ID."));
    }
    Url::parse_with_params(
        "https://query.wikidata.org/sparql",
        &[("format", "json"), ("query", &query(channel_id))],
    )
    .map_err(|_| failure("policy", "Invalid Wikidata query."))
}

async fn read(mut response: reqwest::Response) -> Result<String, Failure> {
    if response.status().is_redirection() {
        return Err(failure("policy", "Wikidata redirected this request."));
    }
    if !response.status().is_success() {
        return Err(failure("upstream", "Wikidata refused this request."));
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
    if !matches!(
        mime.as_str(),
        "application/sparql-results+json" | "application/json"
    ) {
        return Err(failure("response", "Wikidata did not return JSON."));
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| failure("network", "Wikidata response was interrupted."))?
    {
        if bytes.len() + chunk.len() > MAX_RESPONSE_BYTES {
            return Err(failure(
                "too-large",
                "Wikidata response exceeded the size limit.",
            ));
        }
        bytes.extend_from_slice(&chunk);
    }
    String::from_utf8(bytes).map_err(|_| failure("response", "Wikidata JSON was not UTF-8."))
}

#[tauri::command]
pub async fn wikidata_channel_creator(channel_id: String) -> Result<String, Failure> {
    let result = async {
        let url = query_url(&channel_id)?;
        let request = client_for(&url)
            .await?
            .get(url)
            .header("Accept", "application/sparql-results+json")
            .header("Accept-Encoding", "identity")
            .send();
        let response = tokio::time::timeout(Duration::from_secs(15), request)
            .await
            .map_err(|_| failure("upstream-timeout", "Wikidata request timed out."))?
            .map_err(|_| failure("network", "Could not reach Wikidata."))?;
        read(response).await
    }
    .await;
    crate::diagnostics::record(
        "wikidata_read",
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
    fn only_a_channel_id_reaches_the_fixed_query() {
        let url = query_url("UCy0tKL1T7wFoYcxCe0xjN6Q").unwrap();
        assert_eq!(
            url.origin().ascii_serialization(),
            "https://query.wikidata.org"
        );
        assert_eq!(url.path(), "/sparql");
        let sent: String = url
            .query_pairs()
            .find(|(k, _)| k == "query")
            .map(|(_, v)| v.into_owned())
            .unwrap();
        assert_eq!(sent, query("UCy0tKL1T7wFoYcxCe0xjN6Q"));
        assert!(sent.contains("wdt:P2397 \"UCy0tKL1T7wFoYcxCe0xjN6Q\""));
        assert!(sent.contains("wdt:P4033"));
        for bad in [
            "",
            "UCshort",
            "UCy0tKL1T7wFoYcxCe0xjN6QX",
            "UCy0tKL1T7wFoYcxCe0xj\"} }",
            "UCy0tKL1T7wFoYcxCe0x N6Q",
            "XXy0tKL1T7wFoYcxCe0xjN6Q",
            "UCy0tKL1T7wFoYcxCe0xjN6Ä",
        ] {
            assert_eq!(query_url(bad).unwrap_err().kind, "policy", "{bad}");
        }
    }
}
