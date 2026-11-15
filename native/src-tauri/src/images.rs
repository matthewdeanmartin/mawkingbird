//! Public raster images only. No cookies, provider tokens, renderer headers or disk cache.
use crate::{
    diagnostics::record,
    public_mastodon::{client_for, failure, Failure},
};
use std::{
    collections::VecDeque,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use tokio::sync::Semaphore;
use url::Url;
const MAX_BYTES: usize = 8 * 1024 * 1024;
static QUEUE: Semaphore = Semaphore::const_new(128);
static WORKERS: Semaphore = Semaphore::const_new(8);
struct Image {
    bytes: Vec<u8>,
    mime: &'static str,
}
struct Cached {
    url: String,
    image: Arc<Image>,
    at: Instant,
}
static CACHE: Mutex<VecDeque<Cached>> = Mutex::new(VecDeque::new());
fn destination(raw: &str) -> Result<Url, Failure> {
    let denied = || failure("policy", "Only public HTTPS image URLs are allowed.");
    if raw.len() > 8192 || raw.chars().any(char::is_control) {
        return Err(denied());
    }
    let mut url = Url::parse(raw).map_err(|_| denied())?;
    if url.scheme() != "https"
        || url.host_str().is_none()
        || url.port().is_some()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err(denied());
    }
    url.set_fragment(None);
    Ok(url)
}
fn validate_bytes(bytes: &[u8]) -> Result<&'static str, Failure> {
    let mime = if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        "image/png"
    } else if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        "image/jpeg"
    } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        "image/gif"
    } else if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") {
        "image/webp"
    } else if bytes.get(4..8) == Some(b"ftyp")
        && matches!(bytes.get(8..12), Some(b"avif" | b"avis"))
    {
        "image/avif"
    } else {
        return Err(failure("format", "Only raster images are supported."));
    };
    let size =
        imagesize::blob_size(bytes).map_err(|_| failure("format", "Invalid image dimensions."))?;
    if size.width == 0
        || size.height == 0
        || size.width > 16384
        || size.height > 16384
        || size.width.saturating_mul(size.height) > 40_000_000
    {
        return Err(failure("size", "Image dimensions exceed the limit."));
    }
    Ok(mime)
}
async fn download(mut url: Url) -> Result<Arc<Image>, Failure> {
    for hop in 0..=3 {
        // Every hop resolves and pins PUBLIC addresses, including CDN redirects.
        let mut response = client_for(&url)
            .await?
            .get(url.clone())
            .header(
                "Accept",
                "image/avif,image/webp,image/png,image/jpeg,image/gif",
            )
            .header("Accept-Encoding", "identity")
            .send()
            .await
            .map_err(|_| failure("network", "Image request failed."))?;
        if response.status().is_redirection() {
            if hop == 3 {
                return Err(failure("redirect", "Too many image redirects."));
            }
            let next = response
                .headers()
                .get("location")
                .and_then(|v| v.to_str().ok())
                .ok_or_else(|| failure("redirect", "Missing image redirect."))?;
            let resolved = url
                .join(next)
                .map_err(|_| failure("redirect", "Invalid image redirect."))?;
            url = destination(resolved.as_str())?;
            continue;
        }
        if !response.status().is_success() {
            record("image_http", "upstream", Some(response.status().as_u16()));
            return Err(failure("upstream", "Image server refused the request."));
        }
        if response
            .content_length()
            .is_some_and(|n| n > MAX_BYTES as u64)
        {
            return Err(failure("size", "Image exceeds byte limit."));
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|_| failure("network", "Image transfer interrupted."))?
        {
            if bytes.len() + chunk.len() > MAX_BYTES {
                return Err(failure("size", "Image exceeds byte limit."));
            }
            bytes.extend_from_slice(&chunk);
        }
        let mime = validate_bytes(&bytes)?;
        return Ok(Arc::new(Image { bytes, mime }));
    }
    unreachable!()
}
async fn load(raw: &str) -> Result<Arc<Image>, Failure> {
    let url = destination(raw)?;
    if let Ok(mut cache) = CACHE.lock() {
        cache.retain(|c| c.at.elapsed() < Duration::from_secs(300));
        if let Some(c) = cache.iter().find(|c| c.url == url.as_str()) {
            return Ok(c.image.clone());
        }
    }
    let _worker = WORKERS
        .acquire()
        .await
        .map_err(|_| failure("busy", "Image worker unavailable."))?;
    let image = download(url.clone()).await?;
    if let Ok(mut cache) = CACHE.lock() {
        cache.push_back(Cached {
            url: url.to_string(),
            image: image.clone(),
            at: Instant::now(),
        });
        while cache.len() > 128
            || cache.iter().map(|c| c.image.bytes.len()).sum::<usize>() > 32 * 1024 * 1024
        {
            cache.pop_front();
        }
    }
    Ok(image)
}
pub async fn respond(request: tauri::http::Request<Vec<u8>>) -> tauri::http::Response<Vec<u8>> {
    let result = async {
        if request.method() != "GET" || request.uri().path() != "/" {
            return Err(failure("policy", "Invalid image operation."));
        }
        let query: Vec<_> =
            url::form_urlencoded::parse(request.uri().query().unwrap_or("").as_bytes()).collect();
        if query.len() != 1 || query[0].0 != "url" {
            return Err(failure("policy", "Invalid image request."));
        }
        let _queue = QUEUE
            .try_acquire()
            .map_err(|_| failure("busy", "Image queue is full."))?;
        tokio::time::timeout(Duration::from_secs(30), load(&query[0].1))
            .await
            .map_err(|_| failure("timeout", "Image request timed out."))?
    }
    .await;
    let (status, mime, bytes) = match result {
        Ok(image) => {
            record("image_read", "complete", Some(200));
            (200, image.mime, image.bytes.clone())
        }
        Err(error) => {
            record("image_read", error.kind, None);
            (
                403,
                "text/plain",
                b"Image unavailable; see Help > Open logs.".to_vec(),
            )
        }
    };
    tauri::http::Response::builder()
        .status(status)
        .header("Content-Type", mime)
        .header("X-Content-Type-Options", "nosniff")
        .header("Cache-Control", "no-store")
        .header("Content-Security-Policy", "default-src 'none'; sandbox")
        .header("Access-Control-Allow-Origin", "*")
        .body(bytes)
        .unwrap()
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_non_https_credentials_and_active_content() {
        for raw in [
            "http://example.com/a.png",
            "file:///a.png",
            "https://u:p@example.com/a",
            "https://example.com:444/a",
        ] {
            assert!(destination(raw).is_err());
        }
        assert!(destination("https://cdn.example/a.png?signature=abc").is_ok());
        for data in [
            b"<svg onload='evil()'/>".as_slice(),
            b"<html>not an image</html>",
            b"not a png",
        ] {
            assert!(validate_bytes(data).is_err());
        }
    }
    #[test]
    fn checks_raster_dimensions() {
        // GIF header dimensions are sufficient for the size probe; decoding is WebView's job.
        let mut gif = b"GIF89a\x01\x00\x01\x00\x00\x00\x00".to_vec();
        assert_eq!(validate_bytes(&gif).unwrap(), "image/gif");
        gif[6..10].copy_from_slice(&[255, 255, 255, 255]);
        assert!(validate_bytes(&gif).is_err());
    }
    #[test]
    fn protocol_rejects_private_destinations_and_non_image_operations() {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap()
            .block_on(async {
                for uri in [
                    "native-image://localhost/?url=https%3A%2F%2F127.0.0.1%2Fa.png",
                    "native-image://localhost/?url=https%3A%2F%2F169.254.169.254%2Fa.png",
                    "native-image://localhost/?url=https%3A%2F%2Fexample.com%2Fa&url=second",
                    "native-image://localhost/other?url=https%3A%2F%2Fexample.com%2Fa",
                ] {
                    let request = tauri::http::Request::builder()
                        .uri(uri)
                        .body(Vec::new())
                        .unwrap();
                    assert_eq!(respond(request).await.status(), 403);
                }
                let request = tauri::http::Request::builder()
                    .method("POST")
                    .uri("native-image://localhost/?url=https%3A%2F%2Fexample.com%2Fa")
                    .body(Vec::new())
                    .unwrap();
                assert_eq!(respond(request).await.status(), 403);
            });
    }
}
