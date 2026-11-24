//! The operating system's own view of whether this device can reach the
//! internet, for the shared app's connection meter (low-bandwidth Sprint 7).
//!
//! The web build answers "is it me or the server?" by fetching a tiny file from
//! its own site. Native's own origin is the app bundle, so that proves nothing;
//! instead it asks the OS, which already runs its own connectivity check. No
//! request is made by this command and nothing leaves the device.

use serde::Serialize;

#[derive(Serialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Connectivity {
    /// The OS reports working internet access.
    Internet,
    /// Connected to a network, but not (fully) to the internet: a captive
    /// portal, a local network only, or a constrained connection.
    Limited,
    /// No network connection at all.
    None,
    /// This platform cannot say; the app keeps relying on its own requests.
    Unknown,
}

#[tauri::command]
pub fn network_connectivity() -> Connectivity {
    platform()
}

#[cfg(target_os = "windows")]
fn platform() -> Connectivity {
    use windows::Networking::Connectivity::NetworkInformation;
    // No internet profile at all (the call fails or returns null) means no
    // network connection is currently providing internet.
    let Ok(profile) = NetworkInformation::GetInternetConnectionProfile() else {
        return Connectivity::None;
    };
    match profile.GetNetworkConnectivityLevel() {
        Ok(level) => from_level(level),
        Err(_) => Connectivity::Unknown,
    }
}

#[cfg(target_os = "windows")]
fn from_level(level: windows::Networking::Connectivity::NetworkConnectivityLevel) -> Connectivity {
    use windows::Networking::Connectivity::NetworkConnectivityLevel;
    match level {
        NetworkConnectivityLevel::InternetAccess => Connectivity::Internet,
        NetworkConnectivityLevel::ConstrainedInternetAccess
        | NetworkConnectivityLevel::LocalAccess => Connectivity::Limited,
        NetworkConnectivityLevel::None => Connectivity::None,
        _ => Connectivity::Unknown,
    }
}

/// macOS and Linux targets: not yet wired to their OS APIs.
#[cfg(not(target_os = "windows"))]
fn platform() -> Connectivity {
    Connectivity::Unknown
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_as_lowercase_words_the_app_reads() {
        let words: Vec<String> = [
            Connectivity::Internet,
            Connectivity::Limited,
            Connectivity::None,
            Connectivity::Unknown,
        ]
        .iter()
        .map(|c| serde_json::to_string(c).unwrap())
        .collect();
        assert_eq!(
            words,
            ["\"internet\"", "\"limited\"", "\"none\"", "\"unknown\""]
        );
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn maps_every_windows_level() {
        use windows::Networking::Connectivity::NetworkConnectivityLevel as L;
        assert_eq!(from_level(L::InternetAccess), Connectivity::Internet);
        assert_eq!(
            from_level(L::ConstrainedInternetAccess),
            Connectivity::Limited
        );
        assert_eq!(from_level(L::LocalAccess), Connectivity::Limited);
        assert_eq!(from_level(L::None), Connectivity::None);
    }

    #[test]
    fn answers_without_panicking_on_this_machine() {
        let _ = network_connectivity();
    }
}
