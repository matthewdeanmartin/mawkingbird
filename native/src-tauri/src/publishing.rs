//! Anonymous publishing. Fixed endpoints, no redirects, no automatic write retries.
use crate::{
    diagnostics::record,
    public_mastodon::{client_for, failure, Failure, PublicResponse},
    social,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::BTreeMap;
use tokio::sync::Semaphore;
use url::Url;
static REQUESTS: Semaphore = Semaphore::const_new(4);
const MAX_BYTES: usize = 2 * 1024 * 1024;
fn denied() -> Failure {
    failure("policy", "This publishing operation is not supported.")
}
fn slug_ok(slug: &str) -> bool {
    !slug.is_empty()
        && slug.len() <= 100
        && slug
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}
fn short_target(provider: &str, destination: &str, slug: Option<&str>) -> Result<Url, Failure> {
    if destination.len() > 32768 || destination.chars().any(char::is_control) {
        return Err(denied());
    }
    crate::feeds::validate_url(destination)?;
    let base = match provider {
        "tinyurl" => "https://tinyurl.com/api-create.php",
        "isgd" => "https://is.gd/create.php",
        _ => return Err(denied()),
    };
    let mut url = Url::parse(base).unwrap();
    if provider == "isgd" {
        url.query_pairs_mut().append_pair("format", "json");
    }
    url.query_pairs_mut().append_pair("url", destination);
    if let Some(slug) = slug {
        if provider != "isgd"
            || !(5..=30).contains(&slug.len())
            || !slug.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_')
        {
            return Err(denied());
        }
        url.query_pairs_mut().append_pair("shorturl", slug);
    }
    Ok(url)
}
async fn bounded(mut response: reqwest::Response) -> Result<PublicResponse, Failure> {
    let status = response.status().as_u16();
    record("publishing_http", "response", Some(status));
    if response.status().is_redirection() {
        return Err(failure("policy", "Publishing redirects are blocked."));
    }
    if response
        .content_length()
        .is_some_and(|n| n > MAX_BYTES as u64)
    {
        return Err(failure(
            "response",
            "Publishing response exceeded the size limit.",
        ));
    }
    let mut headers = BTreeMap::new();
    for name in ["content-type", "retry-after"] {
        if let Some(value) = response.headers().get(name).and_then(|v| v.to_str().ok()) {
            headers.insert(name.into(), value.into());
        }
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| {
        failure(
            "network",
            "Publishing response was interrupted. Check your history before trying again.",
        )
    })? {
        if bytes.len() + chunk.len() > MAX_BYTES {
            return Err(failure(
                "response",
                "Publishing response exceeded the size limit.",
            ));
        }
        bytes.extend_from_slice(&chunk);
    }
    let body = String::from_utf8(bytes)
        .map_err(|_| failure("response", "Publishing response was not UTF-8."))?;
    Ok(PublicResponse {
        status,
        headers,
        body,
    })
}
fn short_response(provider: &str, mut response: PublicResponse) -> Result<PublicResponse, Failure> {
    if !(200..300).contains(&response.status) {
        response.body = "The shortener refused this request. Try again later.".into();
        return Ok(response);
    }
    if provider == "tinyurl" {
        let url = Url::parse(response.body.trim())
            .map_err(|_| failure("upstream", "TinyURL did not return a short link."))?;
        if url.scheme() != "https"
            || url.host_str() != Some("tinyurl.com")
            || url.port().is_some()
            || !url.username().is_empty()
            || url.password().is_some()
            || !slug_ok(url.path().trim_start_matches('/'))
            || url.query().is_some()
            || url.fragment().is_some()
        {
            return Err(failure("response", "TinyURL returned an invalid link."));
        }
        response.body = url.to_string();
    } else {
        // is.gd sometimes returns its documented database failure as text with 200.
        if response.body.contains("database") && response.body.contains("failed") {
            return Err(failure(
                "upstream",
                "is.gd could not store this link. Choose another shortener.",
            ));
        }
        let value: Value = serde_json::from_str(&response.body)
            .map_err(|_| failure("response", "is.gd did not return JSON."))?;
        if let Some(link) = value["shorturl"].as_str() {
            let url = Url::parse(link).map_err(|_| denied())?;
            if url.scheme() != "https"
                || url.host_str() != Some("is.gd")
                || url.port().is_some()
                || !url.username().is_empty()
                || url.password().is_some()
                || !slug_ok(url.path().trim_start_matches('/'))
                || url.query().is_some()
                || url.fragment().is_some()
            {
                return Err(failure("response", "is.gd returned an invalid link."));
            }
        } else if !value["errorcode"].is_number() {
            return Err(failure("response", "is.gd returned an invalid response."));
        }
    }
    Ok(response)
}
#[tauri::command]
pub async fn shorten_link(
    provider: String,
    destination: String,
    slug: Option<String>,
) -> Result<PublicResponse, Failure> {
    let result = async {
        let _permit = REQUESTS
            .try_acquire()
            .map_err(|_| failure("busy", "Too many publishing requests."))?;
        let url = short_target(&provider, &destination, slug.as_deref())?;
        let response = client_for(&url)
            .await?
            .get(url)
            .header("Accept", "application/json, text/plain")
            .send()
            .await
            .map_err(|_| {
                failure(
                    "network",
                    "The shortener could not be reached. The request was not retried.",
                )
            })?;
        short_response(&provider, bounded(response).await?)
    }
    .await;
    if let Err(error) = &result {
        record("shorten_link", error.kind, None);
    }
    result
}
#[derive(Serialize, Deserialize)]
struct RentryKey {
    slug: String,
    edit_code: String,
}
fn owned(handle: &str, slug: &str) -> Result<RentryKey, Failure> {
    if !handle.starts_with("native-rentry:") || !slug_ok(slug) {
        return Err(denied());
    }
    let key: RentryKey = social::load(handle)?;
    if key.slug != slug {
        return Err(denied());
    }
    Ok(key)
}
fn api_ok(value: &Value) -> bool {
    value["status"] == "200" || value["status"] == 200
}
fn rentry_result(slug: &str, handle: &str) -> PublicResponse {
    PublicResponse {
        status: 200,
        headers: BTreeMap::new(),
        body:
            json!({"status":"200", "url":format!("https://rentry.co/{slug}"), "edit_code":handle})
                .to_string(),
    }
}
#[tauri::command]
pub async fn rentry_request(
    action: String,
    slug: Option<String>,
    handle: Option<String>,
    text: Option<String>,
) -> Result<PublicResponse, Failure> {
    let result = async {
        let _permit = REQUESTS.try_acquire().map_err(|_| failure("busy", "Too many publishing requests."))?;
        if !matches!(action.as_str(), "new" | "edit" | "delete" | "raw") { return Err(denied()); }
        if matches!(action.as_str(), "new" | "edit") {
            if !text.as_ref().is_some_and(|s| !s.trim().is_empty() && s.len() <= 1024 * 1024) { return Err(failure("policy", "Paste text must be nonempty and at most 1 MiB.")); }
        } else if text.is_some() { return Err(denied()); }
        let (slug, handle, key) = if action == "new" {
            if slug.is_some() || handle.is_some() { return Err(denied()); }
            let slug = social::random().to_ascii_lowercase().replace('_', "-");
            let handle = format!("native-rentry:{slug}");
            let key = RentryKey { slug: slug.clone(), edit_code: social::random() };
            // Save the chosen edit code BEFORE publishing. If a response is lost,
            // the OS entry still identifies the page by its known URL slug.
            social::save(&handle, &key)?;
            (slug, handle, Some(key))
        } else {
            let slug = slug.ok_or_else(denied)?;
            if !slug_ok(&slug) { return Err(denied()); }
            if action == "raw" {
                if handle.is_some() { return Err(denied()); }
                (slug, String::new(), None)
            } else {
                let handle = handle.ok_or_else(denied)?;
                let key = owned(&handle, &slug)?;
                (slug, handle, Some(key))
            }
        };
        let url = Url::parse(&if action == "new" { "https://rentry.co/api/new".into() } else { format!("https://rentry.co/api/{action}/{slug}") }).unwrap();
        let client = client_for(&url).await?;
        let request = if action == "raw" { client.get(url) } else {
            let mut form = vec![("edit_code", key.as_ref().unwrap().edit_code.as_str())];
            if action == "new" { form.push(("url", slug.as_str())); }
            if let Some(text) = &text { form.push(("text", text.as_str())); }
            client.post(url).form(&form)
        };
        let response = request.header("Accept", "application/json").send().await.map_err(|_| failure("network", "Rentry did not confirm the request. It was not retried; a new paste may already exist. Its edit code remains saved on this device."))?;
        let response = bounded(response).await?;
        let value: Value = serde_json::from_str(&response.body).map_err(|_| failure("response", "Rentry did not return JSON. No request was retried."))?;
        // A repeated delete after OS-store failure may find the page already gone.
        let gone = action == "delete" && (value["status"] == "404" || value["status"] == 404);
        let success = (200..300).contains(&response.status) && (api_ok(&value) || gone);
        if !success {
            if action == "new" && response.status < 500 && matches!(value["status"].as_str(), Some("400" | "403" | "404")) { let _ = social::delete_credential(&handle); }
            return Err(failure("upstream", "Rentry refused this request. Check the paste and try again later."));
        }
        if action == "new" {
            let expected = format!("https://rentry.co/{slug}");
            if !matches!(value["url"].as_str(), Some(s) if s == expected || s == slug)
                || value["edit_code"].as_str() != Some(key.as_ref().unwrap().edit_code.as_str()) {
                return Err(failure("response", "Rentry returned unexpected paste details. No request was retried."));
            }
        }
        if action == "delete" { social::delete_credential(&handle)?; }
        if action == "raw" {
            let content = value["content"].as_str().ok_or_else(|| failure("response", "Rentry returned no paste text."))?;
            return Ok(PublicResponse { status: 200, headers: BTreeMap::new(), body: json!({"status":"200", "content":content}).to_string() });
        }
        Ok(rentry_result(&slug, if action == "delete" { "" } else { &handle }))
    }.await;
    if let Err(error) = &result {
        record("rentry_request", error.kind, None);
    }
    result
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn shortening_targets_are_fixed_and_nested_urls_are_encoded_once() {
        let url = short_target("tinyurl", "https://example.com/a?q=one&b=two#part", None).unwrap();
        assert_eq!(url.host_str(), Some("tinyurl.com"));
        assert_eq!(
            url.query_pairs().collect::<Vec<_>>(),
            vec![(
                "url".into(),
                "https://example.com/a?q=one&b=two#part".into()
            )]
        );
        for destination in [
            "file:///secret",
            "javascript:alert(1)",
            "https://u:secret@example.com/",
        ] {
            assert!(short_target("tinyurl", destination, None).is_err());
        }
        assert!(short_target("evil", "https://example.com", None).is_err());
        assert!(short_target("isgd", "https://example.com", Some("../escape")).is_err());
        assert!(short_target("tinyurl", "https://example.com", Some("alias")).is_err());
    }
    #[test]
    fn provider_responses_are_checked_without_following_returned_links() {
        let response = |body: &str| PublicResponse {
            status: 200,
            headers: BTreeMap::new(),
            body: body.into(),
        };
        assert!(short_response("tinyurl", response("https://tinyurl.com/abc123")).is_ok());
        for body in [
            "https://tinyurl.com.evil.test/abc",
            "<html>Challenge</html>",
            "https://u:p@tinyurl.com/abc",
            "https://tinyurl.com/abc?secret=x",
        ] {
            assert!(short_response("tinyurl", response(body)).is_err());
        }
        assert!(short_response("isgd", response("Error, database insert failed")).is_err());
        assert!(short_response("isgd", response(r#"{"shorturl":"https://evil.test/x"}"#)).is_err());
        assert!(short_response(
            "isgd",
            response(r#"{"errorcode":3,"errormessage":"Rate limited"}"#)
        )
        .is_ok());
    }
    #[cfg(target_os = "windows")]
    #[test]
    fn edit_capabilities_stay_in_the_os_store_and_are_bound_to_one_slug() {
        let slug = social::random().to_ascii_lowercase().replace('_', "-");
        let handle = format!("native-rentry:{slug}");
        social::save(
            &handle,
            &RentryKey {
                slug: slug.clone(),
                edit_code: "secret-edit-code".into(),
            },
        )
        .unwrap();
        assert_eq!(owned(&handle, &slug).unwrap().edit_code, "secret-edit-code");
        assert!(owned(&handle, "different").is_err());
        assert!(!rentry_result(&slug, &handle)
            .body
            .contains("secret-edit-code"));
        assert!(rentry_result(&slug, &handle).body.contains(&handle));
        social::delete_credential(&handle).unwrap();
        assert!(owned(&handle, &slug).is_err());
    }
}
