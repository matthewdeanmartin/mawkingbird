//! Bounded wire decompression and explicit XML character decoding.
use crate::public_mastodon::{failure, Failure};
use encoding_rs::{Encoding, UTF_16BE, UTF_16LE, UTF_8};
use flate2::read::{MultiGzDecoder, ZlibDecoder};
use quick_xml::{events::Event, Reader};
use std::io::Read;
pub const LIMIT: usize = 4 * 1024 * 1024;

fn bounded(reader: impl Read) -> Result<Vec<u8>, Failure> {
    let mut out = Vec::new();
    reader
        .take((LIMIT + 1) as u64)
        .read_to_end(&mut out)
        .map_err(|_| failure("encoding", "Feed compression is invalid or incomplete."))?;
    if out.len() > LIMIT {
        return Err(failure("size", "Expanded feed exceeds 4 MiB."));
    }
    Ok(out)
}

pub fn decode(wire: &[u8], compression: &str, content_type: &str) -> Result<String, Failure> {
    if wire.len() > LIMIT {
        return Err(failure("size", "Feed exceeds 4 MiB."));
    }
    let bytes = match compression.trim().to_ascii_lowercase().as_str() {
        "" | "identity" => wire.to_vec(),
        "gzip" | "x-gzip" => bounded(MultiGzDecoder::new(wire))?,
        "deflate" => bounded(ZlibDecoder::new(wire))?,
        _ => {
            return Err(failure(
                "encoding",
                "This feed uses unsupported HTTP compression.",
            ))
        }
    };
    let header = content_type.split(';').skip(1).find_map(|part| {
        let (key, value) = part.trim().split_once('=')?;
        key.eq_ignore_ascii_case("charset")
            .then(|| value.trim().trim_matches(['"', '\'']))
    });
    // Read only the ASCII XML declaration, not legacy-encoded article text.
    let declaration = if bytes.starts_with(b"<?xml ") {
        bytes[..bytes.len().min(1024)]
            .windows(2)
            .position(|w| w == b"?>")
            .and_then(|end| std::str::from_utf8(&bytes[..end + 2]).ok())
            .and_then(|prefix| match Reader::from_str(prefix).read_event() {
                Ok(Event::Decl(decl)) => {
                    decl.encoding().and_then(Result::ok).map(|s| s.into_owned())
                }
                _ => None,
            })
    } else {
        None
    };
    let (encoding, skip) = if let Some(bom) = Encoding::for_bom(&bytes) {
        bom
    } else if let Some(label) = header.or(declaration.as_deref()) {
        (
            Encoding::for_label(label.as_bytes())
                .ok_or_else(|| failure("encoding", "Unsupported feed character encoding."))?,
            0,
        )
    } else if bytes.starts_with(&[0, b'<', 0, b'?']) {
        (UTF_16BE, 0)
    } else if bytes.starts_with(&[b'<', 0, b'?', 0]) {
        (UTF_16LE, 0)
    } else {
        (UTF_8, 0)
    };
    let (text, invalid) = encoding.decode_without_bom_handling(&bytes[skip..]);
    if invalid {
        return Err(failure(
            "encoding",
            "Feed text could not be decoded without data loss.",
        ));
    }
    if text.len() > LIMIT {
        return Err(failure("size", "Decoded feed exceeds 4 MiB."));
    }
    // IPC carries Unicode. Remove the obsolete byte-encoding declaration so the
    // existing XML parser sees the same text on every WebView.
    let text = text.into_owned();
    if text.starts_with("<?xml ") {
        if let Some(end) = text.find("?>") {
            return Ok(text[end + 2..].to_owned());
        }
    }
    Ok(text)
}

#[cfg(test)]
mod tests {
    use super::*;
    use flate2::{
        write::{GzEncoder, ZlibEncoder},
        Compression,
    };
    use std::io::Write;
    #[test]
    fn compression_and_legacy_encodings_preserve_text() {
        let xml = b"<?xml version=\"1.0\" encoding=\"iso-8859-1\"?><rss><channel><title>caf\xe9</title></channel></rss>";
        for encoding in ["gzip", "deflate", "identity"] {
            let wire = match encoding {
                "gzip" => {
                    let mut e = GzEncoder::new(Vec::new(), Compression::default());
                    e.write_all(xml).unwrap();
                    e.finish().unwrap()
                }
                "deflate" => {
                    let mut e = ZlibEncoder::new(Vec::new(), Compression::default());
                    e.write_all(xml).unwrap();
                    e.finish().unwrap()
                }
                _ => xml.to_vec(),
            };
            assert!(decode(&wire, encoding, "application/rss+xml")
                .unwrap()
                .contains("café"));
        }
        let utf16: Vec<u8> = [0xff, 0xfe]
            .into_iter()
            .chain(
                "<rss>日本語</rss>"
                    .encode_utf16()
                    .flat_map(u16::to_le_bytes),
            )
            .collect();
        assert_eq!(decode(&utf16, "", "").unwrap(), "<rss>日本語</rss>");
        assert_eq!(
            decode(b"<rss>caf\xe9</rss>", "", "text/xml; charset=windows-1252").unwrap(),
            "<rss>café</rss>"
        );
    }
    #[test]
    fn malformed_unknown_and_expansive_inputs_fail_explicitly() {
        assert!(decode(b"broken", "gzip", "").is_err());
        assert!(decode(b"<rss/>", "br", "").is_err());
        assert!(decode(b"<rss/>", "", "text/xml; charset=invented").is_err());
        assert!(decode(b"\xff", "", "text/xml; charset=utf-8").is_err());
        let mut e = GzEncoder::new(Vec::new(), Compression::best());
        e.write_all(&vec![b'x'; LIMIT + 1]).unwrap();
        assert_eq!(
            decode(&e.finish().unwrap(), "gzip", "").unwrap_err().kind,
            "size"
        );
        assert_eq!(
            decode(
                &vec![233; LIMIT / 2 + 1],
                "",
                "text/xml; charset=iso-8859-1"
            )
            .unwrap_err()
            .kind,
            "size"
        );
    }
}
