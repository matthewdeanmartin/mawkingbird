//! Save renderer-generated exports only to a path chosen by the user.
use crate::public_mastodon::{failure, Failure};
const MAX_BYTES: usize = 32 * 1024 * 1024;
fn valid_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 180
        && name != "."
        && name != ".."
        && !name.chars().any(|c| {
            c.is_control() || matches!(c, '/' | '\\' | ':' | '<' | '>' | '"' | '|' | '?' | '*')
        })
}
#[tauri::command]
pub async fn save_export(
    app: tauri::AppHandle,
    file_name: String,
    bytes: Vec<u8>,
) -> Result<bool, Failure> {
    if !valid_name(&file_name) || bytes.len() > MAX_BYTES {
        return Err(failure(
            "policy",
            "Invalid export name or export exceeds 32 MiB.",
        ));
    }
    save(app, file_name, bytes).await
}
#[cfg(desktop)]
async fn save(app: tauri::AppHandle, name: String, bytes: Vec<u8>) -> Result<bool, Failure> {
    use tauri_plugin_dialog::DialogExt;
    tauri::async_runtime::spawn_blocking(move || {
        let chosen = app
            .dialog()
            .file()
            .set_file_name(&name)
            .blocking_save_file();
        let Some(chosen) = chosen else {
            return Ok(false);
        };
        let path = chosen
            .into_path()
            .map_err(|_| failure("storage", "Invalid save destination."))?;
        std::fs::write(path, bytes)
            .map_err(|_| failure("storage", "Could not save the export."))?;
        Ok(true)
    })
    .await
    .map_err(|_| failure("dialog", "Could not open the save dialog."))?
}
#[cfg(not(desktop))]
async fn save(_app: tauri::AppHandle, _name: String, _bytes: Vec<u8>) -> Result<bool, Failure> {
    Err(failure("platform", "File exports require the desktop app."))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn renderer_cannot_choose_a_path() {
        for name in ["../a.csv", "C:\\a.csv", "/tmp/a", "a/b", "..", ""] {
            assert!(!valid_name(name));
        }
        for name in [
            "contacts.csv",
            "私のブログ.html",
            "code.rs",
            "backup.json",
            "archive.zip",
        ] {
            assert!(valid_name(name));
        }
    }
}
