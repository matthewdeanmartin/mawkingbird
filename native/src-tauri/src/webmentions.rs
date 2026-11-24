//! Bounded public endpoint discovery and uncredentialed webmention delivery.
use crate::public_mastodon::{client_for, failure, Failure};
use serde::Serialize;
use tokio::sync::Semaphore;
use url::{Host, Url};

static REQUESTS: Semaphore = Semaphore::const_new(4);
const PAGE_LIMIT: usize = 2 * 1024 * 1024;
const REPLY_LIMIT: usize = 64 * 1024;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Discovery {
    status: u16,
    final_url: String,
    link: Option<String>,
    body: String,
}

#[derive(Serialize)]
pub struct Delivery {
    status: u16,
    body: String,
}

fn target(raw: &str) -> Result<Url, Failure> {
    let url = Url::parse(raw).map_err(|_| failure("policy", "Invalid webmention URL."))?;
    if raw.len() > 8192 || url.fragment().is_some() {
        return Err(failure("policy", "Invalid webmention URL."));
    }
    match url.host() {
        Some(Host::Domain(host))
            if host != "localhost"
                && !host.ends_with(".localhost")
                && !host.ends_with(".local") => {}
        _ => return Err(failure("policy", "Webmention URLs must use a public host.")),
    }
    crate::feeds::validate_url(raw)
}

async fn read(mut response: reqwest::Response, limit: usize) -> Result<String, Failure> {
    if response
        .content_length()
        .is_some_and(|size| size > limit as u64)
    {
        return Err(failure("too-large", "Webmention response is too large."));
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| failure("network", "Webmention response was interrupted."))?
    {
        if bytes.len() + chunk.len() > limit {
            return Err(failure("too-large", "Webmention response is too large."));
        }
        bytes.extend_from_slice(&chunk);
    }
    String::from_utf8(bytes).map_err(|_| failure("encoding", "Webmention response is not UTF-8."))
}

#[tauri::command]
pub async fn webmention_discover(url: String) -> Result<Discovery, Failure> {
    let _permit = REQUESTS
        .try_acquire()
        .map_err(|_| failure("busy", "Too many webmention requests."))?;
    let mut url = target(&url)?;
    for hop in 0..=3 {
        let response = client_for(&url)
            .await?
            .get(url.clone())
            .header("Accept", "text/html, application/xhtml+xml")
            .send()
            .await
            .map_err(|_| failure("network", "Could not read the target site."))?;
        if response.status().is_redirection() {
            if hop == 3 {
                return Err(failure("policy", "Too many webmention redirects."));
            }
            let location = response
                .headers()
                .get("location")
                .and_then(|v| v.to_str().ok())
                .ok_or_else(|| failure("response", "Invalid webmention redirect."))?;
            let next = target(
                url.join(location)
                    .map_err(|_| failure("policy", "Invalid webmention redirect."))?
                    .as_str(),
            )?;
            if url.scheme() == "https" && next.scheme() != "https" {
                return Err(failure("policy", "Insecure webmention redirect blocked."));
            }
            url = next;
            continue;
        }
        let status = response.status().as_u16();
        let link = response
            .headers()
            .get("link")
            .and_then(|v| v.to_str().ok())
            .map(str::to_owned);
        if !(200..300).contains(&status) {
            return Ok(Discovery {
                status,
                final_url: url.to_string(),
                link: None,
                body: String::new(),
            });
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
        if !matches!(mime.as_str(), "text/html" | "application/xhtml+xml") {
            return Err(failure("response", "Target site did not return HTML."));
        }
        let body = read(response, PAGE_LIMIT).await?;
        return Ok(Discovery {
            status,
            final_url: url.to_string(),
            link,
            body,
        });
    }
    unreachable!()
}

#[tauri::command]
pub async fn webmention_send(
    endpoint: String,
    source: String,
    target_url: String,
) -> Result<Delivery, Failure> {
    let _permit = REQUESTS
        .try_acquire()
        .map_err(|_| failure("busy", "Too many webmention requests."))?;
    let endpoint = target(&endpoint)?;
    let source = target(&source)?;
    let target_url = target(&target_url)?;
    if source.as_str().len() + target_url.as_str().len() > 4000 {
        return Err(failure("policy", "Webmention URLs are too long."));
    }
    let response = client_for(&endpoint)
        .await?
        .post(endpoint)
        .form(&[("source", source.as_str()), ("target", target_url.as_str())])
        .send()
        .await
        .map_err(|_| failure("network", "Could not send the webmention."))?;
    if response.status().is_redirection() {
        return Err(failure(
            "policy",
            "Webmention endpoint redirects are blocked.",
        ));
    }
    let status = response.status().as_u16();
    let body = read(response, REPLY_LIMIT).await?;
    Ok(Delivery { status, body })
}

#[cfg(test)]
mod tests {
    use super::target;

    #[test]
    fn webmentions_reject_local_and_credentialed_urls() {
        assert!(target("https://example.com/post").is_ok());
        for raw in [
            "http://127.0.0.1/",
            "http://localhost/",
            "https://user:pass@example.com/",
            "file:///etc/passwd",
            "https://example.com/#fragment",
        ] {
            assert!(target(raw).is_err(), "{raw}");
        }
    }
}
