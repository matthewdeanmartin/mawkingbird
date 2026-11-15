//! Public HTML only, returned as data for the shared inert article extractor.
use crate::public_mastodon::{client_for, failure, Failure};
use serde::Serialize;
use std::time::Duration;
use tokio::sync::Semaphore;
use url::Url;

const MAX_BYTES: usize = 4 * 1024 * 1024;
static QUEUE: Semaphore = Semaphore::const_new(16);
static WORKERS: Semaphore = Semaphore::const_new(4);

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArticleResponse {
    status: u16,
    final_url: String,
    body: String,
}

fn redirect(current: &Url, location: &str, hop: usize) -> Result<Url, Failure> {
    if hop >= 3 {
        return Err(failure("redirect-loop", "Too many article redirects."));
    }
    let next = current
        .join(location)
        .map_err(|_| failure("policy", "Invalid article redirect."))?;
    let next = crate::feeds::validate_url(next.as_str())?;
    if current.scheme() == "https" && next.scheme() != "https" {
        return Err(failure("policy", "Insecure article redirect blocked."));
    }
    Ok(next)
}

fn decode(bytes: &[u8], content_type: &str) -> Result<String, Failure> {
    let label = content_type.split(';').skip(1).find_map(|part| {
        let (key, value) = part.trim().split_once('=')?;
        key.eq_ignore_ascii_case("charset")
            .then(|| value.trim().trim_matches(['\"', '\'']))
    });
    let (encoding, skip) = if let Some(bom) = encoding_rs::Encoding::for_bom(bytes) {
        bom
    } else {
        (
            match label {
                Some(label) => {
                    encoding_rs::Encoding::for_label(label.as_bytes()).ok_or_else(|| {
                        failure(
                            "encoding",
                            "This article uses an unsupported text encoding.",
                        )
                    })?
                }
                None => encoding_rs::UTF_8,
            },
            0,
        )
    };
    let (text, invalid) = encoding.decode_without_bom_handling(&bytes[skip..]);
    if invalid {
        return Err(failure("encoding", "Article text could not be decoded."));
    }
    if text.len() > MAX_BYTES {
        return Err(failure(
            "too-large",
            "Decoded article exceeded the 4 MiB size limit.",
        ));
    }
    Ok(text.into_owned())
}

async fn read(
    mut response: reqwest::Response,
    final_url: String,
) -> Result<ArticleResponse, Failure> {
    let status = response.status().as_u16();
    // Do not download or expose arbitrary upstream error documents.
    if !(200..300).contains(&status) {
        return Ok(ArticleResponse {
            status,
            final_url,
            body: String::new(),
        });
    }
    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_owned();
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
        return Err(failure(
            "not-html",
            "The site did not return an HTML article.",
        ));
    }
    if response
        .content_length()
        .is_some_and(|n| n > MAX_BYTES as u64)
    {
        return Err(failure(
            "too-large",
            "Article exceeded the 4 MiB size limit.",
        ));
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| failure("network", "Article download was interrupted."))?
    {
        if bytes.len() + chunk.len() > MAX_BYTES {
            return Err(failure(
                "too-large",
                "Article exceeded the 4 MiB size limit.",
            ));
        }
        bytes.extend_from_slice(&chunk);
    }
    let body = decode(&bytes, &content_type)?;
    Ok(ArticleResponse {
        status,
        final_url,
        body,
    })
}

async fn fetch(raw: &str) -> Result<ArticleResponse, Failure> {
    let _worker = WORKERS
        .acquire()
        .await
        .map_err(|_| failure("busy", "Article reader is unavailable."))?;
    let mut url = crate::feeds::validate_url(raw)?;
    for hop in 0..=3 {
        let response = client_for(&url)
            .await?
            .get(url.clone())
            .header("Accept", "text/html, application/xhtml+xml")
            .header("Accept-Encoding", "identity")
            .send()
            .await
            .map_err(|_| failure("network", "Could not reach the article publisher."))?;
        crate::diagnostics::record("article_http", "response", Some(response.status().as_u16()));
        if response.status().is_redirection() {
            let location = response
                .headers()
                .get("location")
                .and_then(|v| v.to_str().ok())
                .ok_or_else(|| failure("policy", "Invalid article redirect."))?;
            url = redirect(&url, location, hop)?;
        } else {
            return read(response, url.to_string()).await;
        }
    }
    unreachable!()
}

#[tauri::command]
pub async fn public_article_get(url: String) -> Result<ArticleResponse, Failure> {
    let result = async {
        let _queue = QUEUE
            .try_acquire()
            .map_err(|_| failure("busy", "Too many pending articles; retry shortly."))?;
        tokio::time::timeout(Duration::from_secs(20), fetch(&url))
            .await
            .map_err(|_| failure("upstream-timeout", "Article request timed out."))?
    }
    .await;
    crate::diagnostics::record(
        "article_read",
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
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    #[test]
    fn article_encodings_are_explicit_and_lossless() {
        assert_eq!(
            decode(&[99, 97, 102, 233], "text/html; charset=iso-8859-1").unwrap(),
            "café"
        );
        assert_eq!(decode("café".as_bytes(), "text/html").unwrap(), "café");
        assert!(decode(&[255], "text/html; charset=utf-8").is_err());
        assert!(decode(b"text", "text/html; charset=made-up").is_err());
        assert_eq!(
            decode(
                &vec![233; MAX_BYTES / 2 + 1],
                "text/html; charset=iso-8859-1"
            )
            .unwrap_err()
            .kind,
            "too-large"
        );
    }

    #[test]
    fn redirect_policy_preserves_public_transport_constraints() {
        let url = Url::parse("https://example.org/old").unwrap();
        assert_eq!(
            redirect(&url, "/new", 0).unwrap().as_str(),
            "https://example.org/new"
        );
        for location in [
            "http://example.org/new",
            "file:///secret",
            "https://user:pass@example.org/",
            "https://example.org:444/",
        ] {
            assert!(redirect(&url, location, 0).is_err());
        }
        assert_eq!(redirect(&url, "/new", 3).unwrap_err().kind, "redirect-loop");
    }

    #[test]
    fn response_limits_and_status_survive_real_http_transport() {
        tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap().block_on(async {
            for (status, mime, body, expected) in [
                (200, "text/html; charset=utf-8", "<html><article>Text</article></html>", None),
                (200, "image/svg+xml", "<svg/>", Some("not-html")),
                (200, "text/html", "", None),
                (200, "text/html", "", Some("too-large")),
                (429, "application/json", "{\"error\":\"limited\"}", None),
            ] {
                let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
                let address = listener.local_addr().unwrap();
                let size = if expected == Some("too-large") { MAX_BYTES + 1 } else { body.len() };
                let wire = format!("HTTP/1.1 {status} Test\r\nContent-Type: {mime}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", size);
                let server = tokio::spawn(async move {
                    let (mut socket, _) = listener.accept().await.unwrap();
                    let mut request = [0; 4096];
                    socket.read(&mut request).await.unwrap();
                    socket.write_all(wire.as_bytes()).await.unwrap();
                });
                // Only this response-decoding fixture bypasses destination validation.
                let response = reqwest::Client::builder().no_proxy().build().unwrap()
                    .get(format!("http://{address}/")).send().await.unwrap();
                let result = read(response, "https://example.org/final".into()).await;
                if let Some(kind) = expected { assert_eq!(result.unwrap_err().kind, kind); }
                else {
                    let result = result.unwrap();
                    assert_eq!(result.status, status);
                    assert_eq!(result.final_url, "https://example.org/final");
                    assert_eq!(result.body, if status == 200 { body } else { "" });
                }
                server.await.unwrap();
            }
            assert_eq!(fetch("http://127.0.0.1/article").await.unwrap_err().kind, "policy");
        });
    }
}
