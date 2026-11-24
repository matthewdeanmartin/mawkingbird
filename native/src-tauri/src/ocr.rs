//! Read text in an image the user attached, to draft its alt text (parity item 4).
//!
//! Windows only, through `Windows.Media.Ocr` and the `windows` crate's safe
//! WinRT projections: this module adds no `unsafe` (the host's one unsafe COM
//! block stays in `windows_network.rs`). Recognition runs on this computer and
//! makes no network request. The renderer sends bytes the user already
//! attached; the same raster checks as the image transport apply.
use crate::public_mastodon::{failure, Failure};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Serialize;

const MAX_BYTES: usize = 8 * 1024 * 1024;

#[derive(Serialize, Debug)]
pub struct OcrText {
    pub text: String,
    /// BCP-47 tag of the recognizer that read it, e.g. `en-US`.
    pub language: Option<String>,
}

#[cfg(target_os = "windows")]
mod platform {
    use super::OcrText;
    use windows::{
        core::Result,
        Graphics::Imaging::{BitmapAlphaMode, BitmapDecoder, BitmapPixelFormat, SoftwareBitmap},
        Media::Ocr::OcrEngine,
        Storage::Streams::{DataWriter, InMemoryRandomAccessStream},
    };

    pub fn available() -> bool {
        OcrEngine::TryCreateFromUserProfileLanguages().is_ok()
    }

    pub fn recognize(bytes: &[u8]) -> Result<Option<OcrText>> {
        let Ok(engine) = OcrEngine::TryCreateFromUserProfileLanguages() else {
            return Ok(None);
        };
        let stream = InMemoryRandomAccessStream::new()?;
        let writer = DataWriter::CreateDataWriter(&stream)?;
        writer.WriteBytes(bytes)?;
        writer.StoreAsync()?.join()?;
        writer.FlushAsync()?.join()?;
        writer.DetachStream()?;
        stream.Seek(0)?;
        let decoder = BitmapDecoder::CreateAsync(&stream)?.join()?;
        let mut bitmap = decoder.GetSoftwareBitmapAsync()?.join()?;
        // The recognizer wants Gray8 or premultiplied/straight BGRA8.
        if bitmap.BitmapPixelFormat()? != BitmapPixelFormat::Bgra8 {
            bitmap = SoftwareBitmap::ConvertWithAlpha(
                &bitmap,
                BitmapPixelFormat::Bgra8,
                BitmapAlphaMode::Premultiplied,
            )?;
        }
        let limit = OcrEngine::MaxImageDimension()?;
        if bitmap.PixelWidth()? as u32 > limit || bitmap.PixelHeight()? as u32 > limit {
            return Ok(Some(OcrText {
                text: String::new(),
                language: None,
            }));
        }
        let result = engine.RecognizeAsync(&bitmap)?.join()?;
        let text = result.Text()?.to_string_lossy();
        let language = engine
            .RecognizerLanguage()
            .and_then(|l| l.LanguageTag())
            .map(|t| t.to_string_lossy())
            .ok();
        Ok(Some(OcrText { text, language }))
    }
}

#[cfg(not(target_os = "windows"))]
mod platform {
    use super::OcrText;
    pub fn available() -> bool {
        false
    }
    pub fn recognize(_bytes: &[u8]) -> Result<Option<OcrText>, ()> {
        Ok(None)
    }
}

/// Whether this computer has a text recognizer; the button only shows when it does.
#[tauri::command]
pub async fn ocr_available() -> bool {
    tauri::async_runtime::spawn_blocking(platform::available)
        .await
        .unwrap_or(false)
}

/// Read the text in an attached image. `image` is the file's bytes, base64.
#[tauri::command]
pub async fn ocr_read_image(image: String) -> Result<OcrText, Failure> {
    if image.len() > MAX_BYTES * 4 / 3 + 4 {
        return Err(failure("size", "The image is too large to read."));
    }
    let bytes = STANDARD
        .decode(image.as_bytes())
        .map_err(|_| failure("format", "The image could not be read."))?;
    if bytes.len() > MAX_BYTES {
        return Err(failure("size", "The image is too large to read."));
    }
    crate::images::validate_bytes(&bytes)?;
    let result = tauri::async_runtime::spawn_blocking(move || platform::recognize(&bytes))
        .await
        .map_err(|_| failure("ocr", "Text recognition failed."))?
        .map_err(|_| failure("ocr", "This computer couldn't read text in the image."))?
        .ok_or_else(|| failure("unsupported", "This computer has no text recognizer."));
    crate::diagnostics::record(
        "ocr",
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
    fn rejects_non_images_and_oversized_input() {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap()
            .block_on(async {
                let svg = STANDARD.encode(b"<svg onload='x'/>");
                assert_eq!(ocr_read_image(svg).await.err().unwrap().kind, "format");
                assert_eq!(
                    ocr_read_image("not base64!".into())
                        .await
                        .err()
                        .unwrap()
                        .kind,
                    "format"
                );
                let huge = "A".repeat(MAX_BYTES * 2);
                assert_eq!(ocr_read_image(huge).await.err().unwrap().kind, "size");
            });
    }

    /// Needs a Windows OCR language pack, which every desktop install has for
    /// its display language. Skips, loudly, where none is installed (CI images).
    #[cfg(target_os = "windows")]
    #[test]
    fn reads_known_text_from_a_fixture() {
        if !platform::available() {
            eprintln!("skipping: no Windows OCR recognizer installed");
            return;
        }
        let fixture = include_bytes!("fixtures/ocr_text.png");
        let read = platform::recognize(fixture).unwrap().unwrap();
        assert!(
            read.text.to_uppercase().contains("HELLO WORLD"),
            "read {:?}",
            read.text
        );
        assert!(read.language.is_some());
    }
}
