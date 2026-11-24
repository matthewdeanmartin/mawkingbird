//! Wellness activity for the shared UI's usage clock
//! (`mawkingbird/ui/src/app/wellness/usage-clock.ts`, `NativeActivity`).
//!
//! The browser can only ask its own document whether it is visible and
//! focused, and WebView2 keeps reporting "visible" for a window that is merely
//! behind others. The host knows whether the main window really has focus, so
//! it answers that here.
//!
//! `idle_seconds` is the OS idle time (no keyboard or mouse anywhere). Reading
//! it needs a platform FFI call (`GetLastInputInfo` on Windows), which would be
//! a second `unsafe` exception beyond the reviewed WebView2 COM one, or a new
//! dependency. Neither is taken without the owner, so it is `None` everywhere
//! for now and the UI falls back to input inside its own window, which is
//! equivalent while our window has focus. See sprint/17-wellness-activity.md.

use serde::Serialize;

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct WellnessActivity {
    pub focused: bool,
    pub idle_seconds: Option<u64>,
}

/// A window whose focus cannot be read (e.g. a platform without the query)
/// counts as focused: the UI's own input check still stops the clock.
fn activity(focused: Result<bool, tauri::Error>) -> WellnessActivity {
    WellnessActivity {
        focused: focused.unwrap_or(true),
        idle_seconds: None,
    }
}

#[tauri::command]
pub fn wellness_activity(window: tauri::Window) -> WellnessActivity {
    activity(window.is_focused())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reports_focus_and_no_os_idle() {
        assert_eq!(
            activity(Ok(false)),
            WellnessActivity {
                focused: false,
                idle_seconds: None
            }
        );
    }

    #[test]
    fn unreadable_focus_counts_as_focused() {
        assert!(activity(Err(tauri::Error::WindowNotFound)).focused);
    }

    #[test]
    fn serializes_the_field_names_the_ui_reads() {
        let json = serde_json::to_string(&activity(Ok(true))).unwrap();
        assert_eq!(json, r#"{"focused":true,"idle_seconds":null}"#);
    }
}
