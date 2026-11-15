//! Public RSS/Atom reads. No credentials, arbitrary headers, or remote proxy.
use crate::public_mastodon::{client_for, failure, Failure};
use quick_xml::{events::Event, Reader};
use std::time::Duration;
use tokio::sync::Semaphore;
use url::Url;

const MAX_BYTES: usize = 4 * 1024 * 1024;
static QUEUE: Semaphore = Semaphore::const_new(32);
static WORKERS: Semaphore = Semaphore::const_new(4);

pub(crate) fn validate_url(raw: &str) -> Result<Url, Failure> {
    let invalid = || {
        failure(
            "policy",
            "Reading requires a public HTTP(S) URL on its default port.",
        )
    };
    if raw.len() > 8192 || raw.chars().any(char::is_control) {
        return Err(invalid());
    }
    let mut url = Url::parse(raw).map_err(|_| invalid())?;
    if !matches!(url.scheme(), "http" | "https")
        || url.host_str().is_none()
        || url.port().is_some()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err(invalid());
    }
    url.set_fragment(None);
    Ok(url)
}

fn validate_xml(body: &str) -> Result<(), Failure> {
    let invalid = || {
        failure(
            "response",
            "The response is not a supported RSS or Atom feed.",
        )
    };
    if body.len() > MAX_BYTES {
        return Err(failure("response", "Feed exceeded the 4 MiB size limit."));
    }
    let mut reader = Reader::from_str(body);
    reader.config_mut().expand_empty_elements = true;
    let mut depth = 0usize;
    let mut roots = 0usize;
    let mut events = 0usize;
    loop {
        events += 1;
        if events > 250_000 {
            return Err(invalid());
        }
        match reader.read_event().map_err(|_| invalid())? {
            Event::DocType(_) => {
                return Err(failure("response", "Feed document types are blocked."))
            }
            Event::Start(e) | Event::Empty(e) => {
                if depth == 0 {
                    roots += 1;
                    if roots != 1 || !matches!(e.local_name().as_ref(), "rss" | "RDF" | "feed") {
                        return Err(invalid());
                    }
                }
                // Empty elements are expanded by the reader configuration below.
                depth += 1;
                if depth > 128 {
                    return Err(invalid());
                }
            }
            Event::End(_) => {
                depth = depth.checked_sub(1).ok_or_else(invalid)?;
            }
            Event::Eof => break,
            Event::Text(e) if depth == 0 && !e.as_ref().chars().all(char::is_whitespace) => {
                return Err(invalid());
            }
            _ => {}
        }
    }
    if roots != 1 || depth != 0 {
        return Err(invalid());
    }
    Ok(())
}

async fn fetch(raw: &str) -> Result<String, Failure> {
    let _worker = WORKERS
        .acquire()
        .await
        .map_err(|_| failure("busy", "Feed reader is unavailable."))?;
    let mut url = validate_url(raw)?;
    for hop in 0..=3 {
        let response = client_for(&url)
            .await?
            .get(url.clone())
            .header(
                "Accept",
                "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9",
            )
            .header("Accept-Encoding", "gzip, deflate")
            .send()
            .await
            .map_err(|_| failure("network", "Could not reach the feed publisher."))?;
        let status = response.status();
        crate::diagnostics::record("feed_http", "response", Some(status.as_u16()));
        if status.is_redirection() {
            if hop == 3 {
                return Err(failure("response", "Too many feed redirects."));
            }
            let location = response
                .headers()
                .get("location")
                .and_then(|v| v.to_str().ok())
                .ok_or_else(|| failure("response", "Feed redirect has no valid destination."))?;
            let next = url
                .join(location)
                .map_err(|_| failure("policy", "Invalid feed redirect."))?;
            if url.scheme() == "https" && next.scheme() != "https" {
                return Err(failure("policy", "Insecure feed redirect blocked."));
            }
            url = validate_url(next.as_str())?;
            continue;
        }
        if !status.is_success() {
            return Err(failure(
                "http",
                "The feed publisher returned an HTTP error; see native logs for its status.",
            ));
        }
        return read_feed(response).await;
    }
    unreachable!()
}

async fn read_feed(mut response: reqwest::Response) -> Result<String, Failure> {
    if response
        .content_length()
        .is_some_and(|n| n > MAX_BYTES as u64)
    {
        return Err(failure("response", "Feed exceeded the 4 MiB size limit."));
    }
    let compression = response
        .headers()
        .get("content-encoding")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_owned();
    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_owned();
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| failure("network", "Feed download was interrupted."))?
    {
        if bytes.len() + chunk.len() > MAX_BYTES {
            return Err(failure("response", "Feed exceeded the 4 MiB size limit."));
        }
        bytes.extend_from_slice(&chunk);
    }
    let body = crate::feed_encoding::decode(&bytes, &compression, &content_type)?;
    validate_xml(&body)?;
    Ok(body)
}

#[tauri::command]
pub async fn public_feed_get(url: String) -> Result<String, Failure> {
    let result = async {
        let _queue = QUEUE
            .try_acquire()
            .map_err(|_| failure("busy", "Too many pending feeds; retry shortly."))?;
        tokio::time::timeout(Duration::from_secs(20), fetch(&url))
            .await
            .map_err(|_| failure("network", "Feed request timed out."))?
    }
    .await;
    crate::diagnostics::record(
        "feed_read",
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
    fn reads_compressed_legacy_xml_over_real_http() {
        use std::io::Write;
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap().block_on(async {
            let mut encoder = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
            encoder.write_all(b"<?xml version=\"1.0\" encoding=\"iso-8859-1\"?><rss><channel><title>caf\xe9</title></channel></rss>").unwrap();
            let body = encoder.finish().unwrap();
            let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
            let address = listener.local_addr().unwrap();
            let server = tokio::spawn(async move {
                let (mut socket, _) = listener.accept().await.unwrap();
                let mut request = [0;4096]; socket.read(&mut request).await.unwrap();
                socket.write_all(format!("HTTP/1.1 200 OK\r\nContent-Type: application/rss+xml\r\nContent-Encoding: gzip\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",body.len()).as_bytes()).await.unwrap();
                socket.write_all(&body).await.unwrap();
            });
            let response = reqwest::Client::builder().no_proxy().build().unwrap()
                .get(format!("http://{address}/")).send().await.unwrap();
            let result = read_feed(response).await.unwrap();
            assert!(result.contains("<title>café</title>"));
            validate_xml(&result).unwrap();
            server.await.unwrap();
        });
    }

    #[test]
    fn feed_urls_are_public_transport_only() {
        for url in ["https://example.org/feed?q=a", "http://example.org/rss"] {
            assert!(validate_url(url).is_ok());
        }
        for url in [
            "file:///a",
            "https://user:pass@example.org/rss",
            "https://example.org:444/rss",
            "https://example.org/\n",
        ] {
            assert!(validate_url(url).is_err(), "{url}");
        }
    }

    #[test]
    fn accepts_feed_formats_and_rejects_active_or_expansive_xml() {
        for xml in [
            "<rss><channel><title>Feed</title><item/></channel></rss>",
            "<feed xmlns=\"http://www.w3.org/2005/Atom\"><entry/></feed>",
            "<rdf:RDF xmlns:rdf=\"urn:rdf\"><channel/></rdf:RDF>",
        ] {
            assert!(validate_xml(xml).is_ok(), "{xml}");
        }
        for xml in [
            "<html><body>Not a feed</body></html>",
            "<!DOCTYPE rss [<!ENTITY x SYSTEM 'file:///secret'>]><rss>&x;</rss>",
            "<rss>",
            "<rss></feed>",
            "<rss/><rss/>",
            "",
        ] {
            assert!(validate_xml(xml).is_err(), "{xml}");
        }
        assert!(validate_xml(&format!("<rss>{}</rss>", "<a>".repeat(129))).is_err());
        assert!(validate_xml(&" ".repeat(MAX_BYTES + 1)).is_err());
    }

    #[test]
    fn local_network_is_denied_before_a_feed_request() {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        runtime.block_on(async {
            for url in ["http://127.0.0.1/rss", "https://192.168.1.1/rss"] {
                assert_eq!(fetch(url).await.unwrap_err().kind, "policy");
            }
        });
    }
}
