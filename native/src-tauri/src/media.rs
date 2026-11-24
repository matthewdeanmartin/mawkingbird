//! Public, credential-free file media via bounded single byte ranges.
use crate::public_mastodon::{client_for, failure, Failure};
use std::time::Duration;
use tokio::sync::Semaphore;
const CHUNK: u64 = 2 * 1024 * 1024;
const WHOLE: usize = 8 * 1024 * 1024;
static QUEUE: Semaphore = Semaphore::const_new(24);
static WORKERS: Semaphore = Semaphore::const_new(4);

#[derive(Debug, Clone, Copy)]
enum Range {
    Span(u64, u64),
    Suffix(u64),
}
impl Range {
    fn parse(raw: Option<&str>) -> Result<Self, Failure> {
        let invalid = || failure("range", "Only a single bounded byte range is supported.");
        let Some(raw) = raw else {
            return Ok(Self::Span(0, CHUNK - 1));
        };
        if raw.len() > 96 {
            return Err(invalid());
        }
        let value = raw.strip_prefix("bytes=").ok_or_else(invalid)?;
        let (start, end) = value.split_once('-').ok_or_else(invalid)?;
        let number = |s: &str| -> Result<u64, Failure> {
            if s.is_empty() || !s.bytes().all(|c| c.is_ascii_digit()) {
                return Err(invalid());
            }
            s.parse().map_err(|_| invalid())
        };
        if start.is_empty() {
            let size = number(end)?;
            if size == 0 {
                return Err(invalid());
            }
            return Ok(Self::Suffix(size.min(CHUNK)));
        }
        let start = number(start)?;
        let cap = start.checked_add(CHUNK - 1).ok_or_else(invalid)?;
        let end = if end.is_empty() {
            cap
        } else {
            number(end)?.min(cap)
        };
        if end < start {
            return Err(invalid());
        }
        Ok(Self::Span(start, end))
    }
    fn header(self) -> String {
        match self {
            Self::Span(a, b) => format!("bytes={a}-{b}"),
            Self::Suffix(n) => format!("bytes=-{n}"),
        }
    }
    fn accepts(self, start: u64, end: u64, total: u64) -> bool {
        if start > end || end >= total || total > 16 * 1024 * 1024 * 1024 || end - start >= CHUNK {
            return false;
        }
        match self {
            Self::Span(a, b) => start == a && end <= b,
            Self::Suffix(n) => end + 1 == total && end - start < n,
        }
    }
}

fn mime_allowed(mime: &str) -> bool {
    matches!(
        mime,
        "video/mp4"
            | "audio/mp4"
            | "video/webm"
            | "audio/webm"
            | "audio/mpeg"
            | "audio/ogg"
            | "video/ogg"
            | "application/ogg"
            | "audio/wav"
            | "audio/x-wav"
            | "audio/wave"
            | "audio/flac"
            | "audio/aac"
    )
}

struct Part {
    status: u16,
    mime: String,
    range: Option<String>,
    bytes: Vec<u8>,
}
async fn read(mut response: reqwest::Response, requested: Range) -> Result<Part, Failure> {
    let status = response.status().as_u16();
    if !matches!(status, 200 | 206) {
        return Err(failure("upstream", "Media publisher refused this request."));
    }
    if response
        .headers()
        .get("content-encoding")
        .is_some_and(|h| h != "identity")
    {
        return Err(failure(
            "encoding",
            "Compressed media responses are not supported.",
        ));
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
    if !mime_allowed(&mime) {
        return Err(failure(
            "format",
            "Only supported audio/video files may use media transport.",
        ));
    }
    let (range, expected) = if status == 206 {
        let invalid = || failure("range", "Media publisher returned an invalid byte range.");
        let raw = response
            .headers()
            .get("content-range")
            .and_then(|v| v.to_str().ok())
            .ok_or_else(invalid)?;
        let (span, total) = raw
            .strip_prefix("bytes ")
            .and_then(|s| s.split_once('/'))
            .ok_or_else(invalid)?;
        let (start, end) = span.split_once('-').ok_or_else(invalid)?;
        let start: u64 = start.parse().map_err(|_| invalid())?;
        let end: u64 = end.parse().map_err(|_| invalid())?;
        let total: u64 = total.parse().map_err(|_| invalid())?;
        if !requested.accepts(start, end, total) {
            return Err(invalid());
        }
        (
            Some(format!("bytes {start}-{end}/{total}")),
            Some((end - start + 1) as usize),
        )
    } else {
        (None, None)
    };
    let limit = expected.unwrap_or(WHOLE);
    if response.content_length().is_some_and(|n| n > limit as u64) {
        return Err(failure(
            "size",
            "Media response exceeds the bounded download limit.",
        ));
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| failure("network", "Media download was interrupted."))?
    {
        if bytes.len() + chunk.len() > limit {
            return Err(failure(
                "size",
                "Media response exceeds the bounded download limit.",
            ));
        }
        bytes.extend_from_slice(&chunk);
    }
    if expected.is_some_and(|n| n != bytes.len()) {
        return Err(failure("range", "Media range was incomplete."));
    }
    if status == 200 {
        // Small origins that ignore Range can still seek: slice their bounded
        // full response locally and return honest range metadata to the player.
        let total = bytes.len() as u64;
        if total == 0 {
            return Err(failure("format", "Empty media response."));
        }
        let (start, end) = match requested {
            Range::Span(start, end) => (start, end.min(total - 1)),
            Range::Suffix(size) => (total.saturating_sub(size), total - 1),
        };
        if start >= total {
            return Err(failure(
                "range",
                "Requested range is outside this media file.",
            ));
        }
        return Ok(Part {
            status: 206,
            mime,
            range: Some(format!("bytes {start}-{end}/{total}")),
            bytes: bytes[start as usize..=end as usize].to_vec(),
        });
    }
    Ok(Part {
        status,
        mime,
        range,
        bytes,
    })
}

async fn fetch(raw: &str, range: Range) -> Result<Part, Failure> {
    let _worker = WORKERS
        .acquire()
        .await
        .map_err(|_| failure("busy", "Media reader unavailable."))?;
    let mut url = crate::feeds::validate_url(raw)?;
    for hop in 0..=3 {
        let response = client_for(&url)
            .await?
            .get(url.clone())
            .header("Accept", "video/*, audio/*, application/ogg")
            .header("Accept-Encoding", "identity")
            .header("Range", range.header())
            .send()
            .await
            .map_err(|_| failure("network", "Could not reach media publisher."))?;
        crate::diagnostics::record("media_http", "response", Some(response.status().as_u16()));
        if !response.status().is_redirection() {
            return read(response, range).await;
        }
        if hop == 3 {
            return Err(failure("redirect", "Too many media redirects."));
        }
        let target = response
            .headers()
            .get("location")
            .and_then(|v| v.to_str().ok())
            .ok_or_else(|| failure("redirect", "Invalid media redirect."))?;
        let next = url
            .join(target)
            .map_err(|_| failure("redirect", "Invalid media redirect."))?;
        if url.scheme() == "https" && next.scheme() != "https" {
            return Err(failure("policy", "Insecure media redirect blocked."));
        }
        url = crate::feeds::validate_url(next.as_str())?;
    }
    unreachable!()
}

pub async fn respond(request: tauri::http::Request<Vec<u8>>) -> tauri::http::Response<Vec<u8>> {
    let result = async {
        if request.method() != "GET" || request.uri().path() != "/" {
            return Err(failure("policy", "Invalid media operation."));
        }
        let query: Vec<_> =
            url::form_urlencoded::parse(request.uri().query().unwrap_or("").as_bytes()).collect();
        if query.len() != 1 || query[0].0 != "url" {
            return Err(failure("policy", "Invalid media destination."));
        }
        let range = Range::parse(
            request
                .headers()
                .get("range")
                .map(|v| v.to_str())
                .transpose()
                .map_err(|_| failure("range", "Invalid range header."))?,
        )?;
        let _queue = QUEUE
            .try_acquire()
            .map_err(|_| failure("busy", "Media queue is full."))?;
        tokio::time::timeout(Duration::from_secs(20), fetch(&query[0].1, range))
            .await
            .map_err(|_| failure("timeout", "Media request timed out."))?
    }
    .await;
    let mut reply = tauri::http::Response::builder()
        .header("X-Content-Type-Options", "nosniff")
        .header("Cache-Control", "no-store")
        .header("Content-Security-Policy", "default-src 'none'; sandbox")
        .header("Access-Control-Allow-Origin", "*");
    match result {
        Ok(part) => {
            crate::diagnostics::record("media_read", "complete", Some(part.status));
            reply = reply
                .status(part.status)
                .header("Content-Type", part.mime)
                .header("Content-Length", part.bytes.len())
                .header("Accept-Ranges", "bytes");
            if let Some(range) = part.range {
                reply = reply.header("Content-Range", range);
            }
            reply.body(part.bytes).unwrap()
        }
        Err(e) => {
            crate::diagnostics::record("media_read", e.kind, None);
            reply
                .status(if e.kind == "range" { 416 } else { 403 })
                .header("Content-Type", "text/plain")
                .body(b"Media unavailable; see Help > Open logs.".to_vec())
                .unwrap()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn validates_actual_http_range_bodies_and_refusals() {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap().block_on(async {
            for (status, mime, range, length, body, error) in [
                (206, "video/mp4", "bytes 2-4/10", 3, "abc", None),
                (206, "video/mp4", "bytes 0-2/10", 3, "abc", Some("range")),
                (206, "video/mp4", "bytes 2-4/10", 2, "ab", Some("range")),
                (200, "text/html", "", 3, "abc", Some("format")),
                (200, "audio/mpeg", "", WHOLE + 1, "", Some("size")),
                (200, "audio/mpeg", "", 3, "abc", None),
                (403, "text/html", "", 0, "", Some("upstream")),
            ] {
                let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
                let address = listener.local_addr().unwrap();
                let wire = format!("HTTP/1.1 {status} Test\r\nContent-Type: {mime}\r\nContent-Range: {range}\r\nContent-Length: {length}\r\nConnection: close\r\n\r\n{body}");
                let server = tokio::spawn(async move {
                    let (mut socket, _) = listener.accept().await.unwrap();
                    let mut bytes = [0; 4096];
                    let read = socket.read(&mut bytes).await.unwrap();
                    assert!(read > 0, "fixture expected a request");
                    socket.write_all(wire.as_bytes()).await.unwrap();
                });
                // Only response parsing uses loopback. The production DNS policy
                // is unchanged and separately rejects this destination.
                let response = reqwest::Client::builder().no_proxy().build().unwrap()
                    .get(format!("http://{address}/")).send().await.unwrap();
                let result = read(response, Range::Span(2,4)).await;
                match error {
                    Some(kind) => assert_eq!(result.err().unwrap().kind, kind),
                    None => { let part = result.unwrap(); assert_eq!(part.status,206); assert_eq!(part.bytes, if status == 200 { b"c".as_slice() } else { body.as_bytes() }); }
                }
                server.await.unwrap();
            }
        });
    }
    #[test]
    fn range_requests_are_single_and_bounded() {
        assert_eq!(
            Range::parse(Some("bytes=0-")).unwrap().header(),
            "bytes=0-2097151"
        );
        assert_eq!(
            Range::parse(Some("bytes=10-30")).unwrap().header(),
            "bytes=10-30"
        );
        assert_eq!(
            Range::parse(Some("bytes=-100")).unwrap().header(),
            "bytes=-100"
        );
        for raw in [
            "items=0-",
            "bytes=0-1,4-5",
            "bytes=4-1",
            "bytes=-0",
            "bytes=+1-2",
            "bytes=18446744073709551615-",
        ] {
            assert!(Range::parse(Some(raw)).is_err(), "{raw}");
        }
        assert!(!Range::Span(0, 100).accepts(1, 20, 1000));
        assert!(!Range::Span(0, 100).accepts(0, CHUNK, CHUNK + 1));
        assert!(!mime_allowed("text/html"));
        assert!(!mime_allowed("application/vnd.apple.mpegurl"));
    }
    #[test]
    fn private_and_non_get_media_are_denied() {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap()
            .block_on(async {
                for (method, uri) in [
                    (
                        "GET",
                        "native-media://localhost/?url=https%3A%2F%2F127.0.0.1%2Fa.mp4",
                    ),
                    (
                        "POST",
                        "native-media://localhost/?url=https%3A%2F%2Fexample.com%2Fa.mp4",
                    ),
                    ("GET", "native-media://localhost/?url=a&url=b"),
                ] {
                    assert_eq!(
                        respond(
                            tauri::http::Request::builder()
                                .method(method)
                                .uri(uri)
                                .body(vec![])
                                .unwrap()
                        )
                        .await
                        .status(),
                        403
                    );
                }
            });
    }
}
