//! Deliberately structured diagnostics: never accept URLs, headers, bodies or errors as log text.
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::PathBuf,
    sync::{Mutex, OnceLock},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::Manager;
use tauri_plugin_opener::OpenerExt;
static LOG: OnceLock<Mutex<PathBuf>> = OnceLock::new();
pub fn init(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let dir = if cfg!(debug_assertions) && std::env::args().any(|a| a == "--smoke-test") {
        PathBuf::from(std::env::var_os("MAWKINGBIRD_SMOKE_PROFILE").ok_or("Missing smoke profile")?)
            .join("logs")
    } else {
        app.path().app_log_dir()?
    };
    fs::create_dir_all(&dir)?;
    let path = dir.join("native.log");
    OpenOptions::new().create(true).append(true).open(&path)?;
    let _ = LOG.set(Mutex::new(path));
    record("startup", "ready", None);
    Ok(())
}
pub fn record(operation: &'static str, result: &str, status: Option<u16>) {
    // Result is a classification, never a raw exception. Limit even caller mistakes.
    let result: String = result
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '_')
        .take(40)
        .collect();
    let line = format!(
        "{} operation={} result={} status={}\n",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs(),
        operation,
        result,
        status.map(|n| n.to_string()).unwrap_or_else(|| "-".into())
    );
    eprint!("{line}");
    if let Some(lock) = LOG.get() {
        if let Ok(path) = lock.lock() {
            if fs::metadata(&*path).is_ok_and(|m| m.len() > 1024 * 1024) {
                let _ = fs::rename(&*path, path.with_extension("previous.log"));
            }
            if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(&*path) {
                let _ = file.write_all(line.as_bytes());
            }
        }
    }
}
#[tauri::command]
pub fn report_native_event(event: String) {
    match event.as_str() {
        "renderer_error" | "renderer_rejection" | "transport_denied" | "media_error" => {
            record("renderer", &event, None)
        }
        _ => record("renderer", "invalid_event", None),
    }
}
#[tauri::command]
pub fn open_logs(app: tauri::AppHandle) -> Result<(), String> {
    let path = LOG
        .get()
        .ok_or("Logging not initialized")?
        .lock()
        .map_err(|_| "Log lock unavailable")?;
    app.opener()
        .open_path(path.parent().unwrap().to_string_lossy(), None::<&str>)
        .map_err(|_| "Could not open log directory".into())
}
