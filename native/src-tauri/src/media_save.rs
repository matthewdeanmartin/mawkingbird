//! Save or copy an image the app already shows (parity items 6 and 10).
//!
//! WebView downloads are blocked in the native build, and the renderer has no
//! network access of its own, so both actions re-fetch the image through the
//! native image transport (`images::load`: same HTTPS-only destination checks,
//! private-address blocking, size and format limits, and its short cache).
//! The renderer supplies a URL and a suggested file name; it never supplies a
//! path. The path comes from the OS save dialog, which asks before replacing a
//! file. Alt text travels with the file: XMP in PNG and JPEG, a `.txt` sidecar
//! for formats that cannot carry it.
use crate::{
    images,
    public_mastodon::{failure, Failure},
};
use std::time::Duration;

/// `{account}_{post id}_{n}` from the renderer, reduced to safe characters.
fn file_stem(raw: &str) -> String {
    let stem: String = raw
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || matches!(c, '_' | '-' | '.') {
                c
            } else {
                '_'
            }
        })
        .take(120)
        .collect();
    let stem = stem.trim_matches(['.', '_']).to_string();
    if stem.is_empty() {
        "image".into()
    } else {
        stem
    }
}

fn extension(mime: &str) -> &'static str {
    match mime {
        "image/png" => "png",
        "image/jpeg" => "jpg",
        "image/gif" => "gif",
        "image/webp" => "webp",
        "image/avif" => "avif",
        _ => "img",
    }
}

fn xml_escape(text: &str) -> String {
    text.chars()
        .filter(|c| !c.is_control() || *c == '\n')
        .map(|c| match c {
            '&' => "&amp;".into(),
            '<' => "&lt;".into(),
            '>' => "&gt;".into(),
            '"' => "&quot;".into(),
            c => c.to_string(),
        })
        .collect()
}

fn xmp_packet(alt: &str) -> String {
    format!(
        "<?xpacket begin=\"\u{feff}\" id=\"W5M0MpCehiHzreSzNTczkc9d\"?>\
<x:xmpmeta xmlns:x=\"adobe:ns:meta/\"><rdf:RDF xmlns:rdf=\"http://www.w3.org/1999/02/22-rdf-syntax-ns#\">\
<rdf:Description rdf:about=\"\" xmlns:dc=\"http://purl.org/dc/elements/1.1/\">\
<dc:description><rdf:Alt><rdf:li xml:lang=\"x-default\">{}</rdf:li></rdf:Alt></dc:description>\
</rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end=\"w\"?>",
        xml_escape(alt)
    )
}

/// PNG: an `iTXt` chunk with keyword `XML:com.adobe.xmp`, before `IEND`.
fn png_with_xmp(bytes: &[u8], alt: &str) -> Option<Vec<u8>> {
    let iend = bytes.len().checked_sub(12)?;
    if bytes.get(iend + 4..iend + 8)? != b"IEND" {
        return None;
    }
    let mut data = b"XML:com.adobe.xmp\0\0\0\0\0".to_vec();
    data.extend_from_slice(xmp_packet(alt).as_bytes());
    let mut chunk = (data.len() as u32).to_be_bytes().to_vec();
    let mut crc = flate2::Crc::new();
    crc.update(b"iTXt");
    crc.update(&data);
    chunk.extend_from_slice(b"iTXt");
    chunk.extend_from_slice(&data);
    chunk.extend_from_slice(&crc.sum().to_be_bytes());
    let mut out = bytes[..iend].to_vec();
    out.extend_from_slice(&chunk);
    out.extend_from_slice(&bytes[iend..]);
    Some(out)
}

/// JPEG: an `APP1` XMP segment right after `SOI`.
fn jpeg_with_xmp(bytes: &[u8], alt: &str) -> Option<Vec<u8>> {
    if !bytes.starts_with(&[0xff, 0xd8]) {
        return None;
    }
    let mut payload = b"http://ns.adobe.com/xap/1.0/\0".to_vec();
    payload.extend_from_slice(xmp_packet(alt).as_bytes());
    let length = u16::try_from(payload.len() + 2).ok()?;
    let mut out = vec![0xff, 0xd8, 0xff, 0xe1];
    out.extend_from_slice(&length.to_be_bytes());
    out.extend_from_slice(&payload);
    out.extend_from_slice(&bytes[2..]);
    Some(out)
}

/// The bytes to write, and whether the alt text still needs a sidecar.
fn with_alt(bytes: &[u8], mime: &str, alt: &str) -> (Vec<u8>, bool) {
    if alt.trim().is_empty() {
        return (bytes.to_vec(), false);
    }
    let embedded = match mime {
        "image/png" => png_with_xmp(bytes, alt),
        "image/jpeg" => jpeg_with_xmp(bytes, alt),
        _ => None,
    };
    match embedded {
        Some(out) => (out, false),
        None => (bytes.to_vec(), true),
    }
}

async fn fetch(url: &str) -> Result<std::sync::Arc<images::Image>, Failure> {
    tokio::time::timeout(Duration::from_secs(30), images::load(url))
        .await
        .map_err(|_| failure("timeout", "The image took too long to load."))?
}

/// Save a displayed image through the OS save dialog. Returns the saved file
/// name, or null when the user cancelled.
#[tauri::command]
pub async fn media_save_image(
    app: tauri::AppHandle,
    url: String,
    file_name: String,
    alt: Option<String>,
) -> Result<Option<String>, Failure> {
    let image = fetch(&url).await?;
    let ext = extension(image.mime);
    let name = format!("{}.{ext}", file_stem(&file_name));
    let alt = alt
        .unwrap_or_default()
        .chars()
        .take(5_000)
        .collect::<String>();
    let (bytes, sidecar) = with_alt(&image.bytes, image.mime, &alt);
    let result = save(app, name, ext, bytes, sidecar.then_some(alt)).await;
    crate::diagnostics::record(
        "media_save",
        match &result {
            Ok(Some(_)) => "complete",
            Ok(None) => "cancelled",
            Err(e) => e.kind,
        },
        None,
    );
    result
}

#[cfg(desktop)]
async fn save(
    app: tauri::AppHandle,
    name: String,
    ext: &'static str,
    bytes: Vec<u8>,
    sidecar: Option<String>,
) -> Result<Option<String>, Failure> {
    use tauri_plugin_dialog::DialogExt;
    let chosen = tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .set_file_name(&name)
            .add_filter("Image", &[ext])
            .blocking_save_file()
    })
    .await
    .map_err(|_| failure("dialog", "The save dialog could not open."))?;
    let Some(path) = chosen.and_then(|p| p.into_path().ok()) else {
        return Ok(None);
    };
    // The dialog has already asked before replacing an existing file.
    std::fs::write(&path, &bytes).map_err(|_| failure("storage", "Could not save the image."))?;
    if let Some(alt) = sidecar {
        let text = path.with_extension(format!("{ext}.txt"));
        if !text.exists() {
            let _ = std::fs::write(text, alt);
        }
    }
    Ok(path.file_name().map(|n| n.to_string_lossy().into_owned()))
}

#[cfg(not(desktop))]
async fn save(
    _app: tauri::AppHandle,
    _name: String,
    _ext: &'static str,
    _bytes: Vec<u8>,
    _sidecar: Option<String>,
) -> Result<Option<String>, Failure> {
    Err(failure(
        "unsupported",
        "Saving images isn't available here yet.",
    ))
}

/// Copy a displayed image (not its address) to the OS clipboard. Animated GIFs
/// copy their first frame.
#[tauri::command]
pub async fn media_copy_image(url: String) -> Result<(), Failure> {
    let image = fetch(&url).await?;
    let result = copy(image).await;
    crate::diagnostics::record(
        "media_copy",
        result
            .as_ref()
            .map(|_| "complete")
            .unwrap_or_else(|e| e.kind),
        None,
    );
    result
}

#[cfg(desktop)]
async fn copy(image: std::sync::Arc<images::Image>) -> Result<(), Failure> {
    tauri::async_runtime::spawn_blocking(move || {
        let decoded = image::load_from_memory(&image.bytes)
            .map_err(|_| failure("format", "Couldn't copy this image."))?
            .into_rgba8();
        let (width, height) = decoded.dimensions();
        arboard::Clipboard::new()
            .and_then(|mut clipboard| {
                clipboard.set_image(arboard::ImageData {
                    width: width as usize,
                    height: height as usize,
                    bytes: std::borrow::Cow::Owned(decoded.into_raw()),
                })
            })
            .map_err(|_| failure("clipboard", "Couldn't copy this image."))
    })
    .await
    .map_err(|_| failure("clipboard", "Couldn't copy this image."))?
}

#[cfg(not(desktop))]
async fn copy(_image: std::sync::Arc<images::Image>) -> Result<(), Failure> {
    Err(failure(
        "unsupported",
        "Copying images isn't available here yet.",
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn png_1x1() -> Vec<u8> {
        let mut out = std::io::Cursor::new(Vec::new());
        image::RgbaImage::new(1, 1)
            .write_to(&mut out, image::ImageFormat::Png)
            .unwrap();
        out.into_inner()
    }

    #[test]
    fn file_names_are_safe_and_never_paths() {
        assert_eq!(
            file_stem("alice@example.social_1234_1"),
            "alice_example.social_1234_1"
        );
        assert_eq!(file_stem("../../etc/passwd"), "etc_passwd");
        assert_eq!(file_stem("C:\\Windows\\x"), "C__Windows_x");
        assert_eq!(file_stem(""), "image");
        assert_eq!(file_stem("..."), "image");
        assert!(file_stem(&"a".repeat(500)).len() <= 120);
    }

    #[test]
    fn alt_text_goes_into_png_and_jpeg_xmp_and_a_sidecar_otherwise() {
        let original = png_1x1();
        let (png, sidecar) = with_alt(&original, "image/png", "A <cat> & a dog");
        assert!(!sidecar);
        let text = String::from_utf8_lossy(&png);
        assert!(text.contains("XML:com.adobe.xmp"));
        assert!(text.contains("A &lt;cat&gt; &amp; a dog"));
        assert!(png.ends_with(&original[original.len() - 12..]));
        // Still a valid PNG the decoder accepts.
        assert!(image::load_from_memory(&png).is_ok());

        let jpeg = [0xff, 0xd8, 0xff, 0xd9];
        let (out, sidecar) = with_alt(&jpeg, "image/jpeg", "alt");
        assert!(!sidecar);
        assert_eq!(&out[..4], &[0xff, 0xd8, 0xff, 0xe1]);
        assert!(out.ends_with(&[0xff, 0xd9]));

        let (_, sidecar) = with_alt(b"GIF89a....", "image/gif", "alt");
        assert!(sidecar);
        let (_, sidecar) = with_alt(b"GIF89a....", "image/gif", "  ");
        assert!(!sidecar);
    }

    #[test]
    fn refuses_unapproved_hosts_and_non_images() {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap()
            .block_on(async {
                for url in [
                    "http://example.com/a.png",
                    "https://127.0.0.1/a.png",
                    "https://169.254.169.254/latest",
                    "file:///C:/Windows/win.ini",
                    "https://u:p@example.com/a.png",
                ] {
                    assert!(media_copy_image(url.into()).await.is_err(), "{url}");
                }
            });
    }
}
