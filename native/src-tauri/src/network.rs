//! Proxy configuration for every native HTTP client (parity item 5).
//!
//! One setting, applied in one place: `public_mastodon::client_for` calls
//! [`apply`] for every client the host builds. Modes:
//!
//! - **Direct** (default, as before): `.no_proxy()`, so neither environment
//!   variables nor system settings can redirect traffic.
//! - **Windows proxy**: the current user's WinINet setting, read at start-up
//!   and when the user presses Refresh, never silently mid-session. A PAC
//!   script or auto-detect is reported as unsupported (no safe Rust crate
//!   evaluates PAC), never guessed at.
//! - **Manual HTTP CONNECT** and **Manual SOCKS5** (Tor preset 127.0.0.1:9050).
//!
//! Destination checks still apply to the *target* host; the proxy address is
//! the one loopback/LAN exception. A proxy failure is an error: there is no
//! fallback to a direct connection. Proxy credentials live in the OS
//! credential store only; the settings file holds the address.
use crate::public_mastodon::{failure, Failure};
use serde::{Deserialize, Serialize};
use std::{
    path::PathBuf,
    sync::{OnceLock, RwLock},
};
use tauri::Manager;

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ProxyMode {
    #[default]
    Direct,
    Windows,
    Http,
    Socks5,
}

/// What the user chose; persisted in the app config directory.
#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
pub struct ProxySettings {
    pub mode: ProxyMode,
    #[serde(default)]
    pub host: String,
    #[serde(default)]
    pub port: u16,
    /// True when a username/password is stored in the OS credential store.
    #[serde(default)]
    pub has_credentials: bool,
}

/// The proxy actually in force, after reading Windows' setting.
#[derive(Clone, Debug, PartialEq, Eq)]
enum Effective {
    Direct,
    Proxy {
        scheme: &'static str,
        host: String,
        port: u16,
    },
    /// Windows uses a PAC script or auto-detect, which is not supported.
    Unsupported,
}

#[derive(Serialize)]
pub struct ProxyStatus {
    pub settings: ProxySettings,
    /// Human-readable address in use, e.g. `proxy.corp:8080`; null when direct.
    pub in_use: Option<String>,
    /// `pac` when Windows uses an automatic proxy script or auto-detect.
    pub problem: Option<&'static str>,
    /// Whether "Use Windows proxy" is available on this OS.
    pub windows_available: bool,
}

struct State {
    settings: ProxySettings,
    effective: Effective,
}

static STATE: RwLock<Option<State>> = RwLock::new(None);
static CONFIG_PATH: OnceLock<PathBuf> = OnceLock::new();
const KEYRING_SERVICE: &str = "mawkingbird-native-proxy";

fn valid_host(host: &str) -> bool {
    !host.is_empty()
        && host.len() <= 253
        && host
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, b'.' | b'-' | b':' | b'[' | b']'))
}

fn validate(settings: &ProxySettings) -> Result<(), Failure> {
    match settings.mode {
        ProxyMode::Direct | ProxyMode::Windows => Ok(()),
        ProxyMode::Http | ProxyMode::Socks5 if valid_host(&settings.host) && settings.port > 0 => {
            Ok(())
        }
        _ => Err(failure("policy", "Enter the proxy's host name and port.")),
    }
}

/// Parse WinINet's `ProxyServer` value: `host:port`, or per-protocol
/// `http=a:1;https=b:2;socks=c:3`. HTTPS wins, then a plain entry, then HTTP,
/// then SOCKS.
fn parse_windows_proxy(value: &str) -> Option<(&'static str, String, u16)> {
    let entries: Vec<(&str, &str)> = value
        .split(';')
        .map(str::trim)
        .filter(|entry| !entry.is_empty())
        .map(|entry| match entry.split_once('=') {
            Some((kind, address)) => (kind.trim(), address.trim()),
            None => ("", entry),
        })
        .collect();
    let pick = ["https", "", "http", "socks"].iter().find_map(|wanted| {
        entries
            .iter()
            .find(|(kind, _)| kind.eq_ignore_ascii_case(wanted))
    })?;
    let address = pick
        .1
        .trim_start_matches("http://")
        .trim_start_matches("https://")
        .trim_start_matches("socks://");
    let (host, port) = address.rsplit_once(':')?;
    let port = port.trim_end_matches('/').parse().ok()?;
    if !valid_host(host) {
        return None;
    }
    let scheme = if pick.0.eq_ignore_ascii_case("socks") {
        "socks5"
    } else {
        "http"
    };
    Some((scheme, host.to_string(), port))
}

#[cfg(target_os = "windows")]
fn read_windows() -> Effective {
    use winreg::{enums::HKEY_CURRENT_USER, RegKey};
    let Ok(key) = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey(r"Software\Microsoft\Windows\CurrentVersion\Internet Settings")
    else {
        return Effective::Direct;
    };
    if key
        .get_value::<String, _>("AutoConfigURL")
        .is_ok_and(|url| !url.trim().is_empty())
    {
        return Effective::Unsupported;
    }
    // Byte 8 of DefaultConnectionSettings carries the flags; 0x08 is
    // "Automatically detect settings" (WPAD), which also needs PAC.
    if let Ok(connections) = key.open_subkey("Connections") {
        if let Ok(blob) = connections.get_raw_value("DefaultConnectionSettings") {
            if blob.bytes.get(8).is_some_and(|flags| flags & 0x08 != 0) {
                return Effective::Unsupported;
            }
        }
    }
    if key.get_value::<u32, _>("ProxyEnable").unwrap_or(0) == 0 {
        return Effective::Direct;
    }
    match key
        .get_value::<String, _>("ProxyServer")
        .ok()
        .as_deref()
        .and_then(parse_windows_proxy)
    {
        Some((scheme, host, port)) => Effective::Proxy { scheme, host, port },
        None => Effective::Direct,
    }
}

#[cfg(not(target_os = "windows"))]
fn read_windows() -> Effective {
    Effective::Direct
}

fn effective_for(settings: &ProxySettings) -> Effective {
    match settings.mode {
        ProxyMode::Direct => Effective::Direct,
        ProxyMode::Windows => read_windows(),
        ProxyMode::Http => Effective::Proxy {
            scheme: "http",
            host: settings.host.clone(),
            port: settings.port,
        },
        // `socks5h`: the proxy resolves names. Tor needs this, and resolving
        // locally would leak every host name to the local resolver.
        ProxyMode::Socks5 => Effective::Proxy {
            scheme: "socks5h",
            host: settings.host.clone(),
            port: settings.port,
        },
    }
}

fn credentials() -> Option<(String, String)> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, "proxy").ok()?;
    let secret = entry.get_password().ok()?;
    let (user, password) = secret.split_once('\n')?;
    Some((user.to_string(), password.to_string()))
}

/// Whether the configured proxy resolves host names itself (SOCKS5). The
/// caller then skips its own DNS lookup and checks only literal addresses and
/// host names, so names never reach the local resolver.
pub(crate) fn proxy_resolves_names() -> bool {
    STATE
        .read()
        .ok()
        .and_then(|state| {
            state.as_ref().map(|s| {
                matches!(
                    &s.effective,
                    Effective::Proxy {
                        scheme: "socks5h",
                        ..
                    }
                )
            })
        })
        .unwrap_or(false)
}

/// Apply the configured proxy to a client builder. Direct means `.no_proxy()`.
pub(crate) fn apply(builder: reqwest::ClientBuilder) -> Result<reqwest::ClientBuilder, Failure> {
    let effective = STATE
        .read()
        .ok()
        .and_then(|state| state.as_ref().map(|s| s.effective.clone()))
        .unwrap_or(Effective::Direct);
    apply_effective(builder, &effective, credentials())
}

fn proxy_url(scheme: &str, host: &str, port: u16) -> String {
    let host = if host.contains(':') && !host.starts_with('[') {
        format!("[{host}]")
    } else {
        host.to_string()
    };
    format!("{scheme}://{host}:{port}")
}

fn apply_effective(
    builder: reqwest::ClientBuilder,
    effective: &Effective,
    credentials: Option<(String, String)>,
) -> Result<reqwest::ClientBuilder, Failure> {
    match effective {
        Effective::Direct => Ok(builder.no_proxy()),
        Effective::Unsupported => Err(failure(
            "proxy",
            "Windows uses an automatic proxy script, which isn't supported. Enter the proxy manually in Settings → Network.",
        )),
        Effective::Proxy { scheme, host, port } => {
            let mut proxy = reqwest::Proxy::all(proxy_url(scheme, host, *port))
                .map_err(|_| failure("proxy", "The proxy address is not valid."))?;
            if let Some((user, password)) = credentials {
                proxy = proxy.basic_auth(&user, &password);
            }
            // `no_proxy()` first clears system/environment proxies; the explicit
            // proxy then applies to every request, with no direct fallback.
            Ok(builder.no_proxy().proxy(proxy))
        }
    }
}

fn status() -> ProxyStatus {
    let state = STATE.read().ok();
    let (settings, effective) = state
        .as_ref()
        .and_then(|s| {
            s.as_ref()
                .map(|s| (s.settings.clone(), s.effective.clone()))
        })
        .unwrap_or((ProxySettings::default(), Effective::Direct));
    ProxyStatus {
        settings,
        in_use: match &effective {
            Effective::Proxy { host, port, .. } => Some(format!("{host}:{port}")),
            _ => None,
        },
        problem: matches!(effective, Effective::Unsupported).then_some("pac"),
        windows_available: cfg!(target_os = "windows"),
    }
}

fn install(settings: ProxySettings) {
    let effective = effective_for(&settings);
    if let Ok(mut state) = STATE.write() {
        *state = Some(State {
            settings,
            effective,
        });
    }
}

/// Load the saved setting at start-up. A missing or unreadable file is Direct.
pub fn init(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let dir = app.path().app_config_dir()?;
    let path = dir.join("network.json");
    let settings = std::fs::read(&path)
        .ok()
        .and_then(|bytes| serde_json::from_slice::<ProxySettings>(&bytes).ok())
        .filter(|settings| validate(settings).is_ok())
        .unwrap_or_default();
    let _ = CONFIG_PATH.set(path);
    install(settings);
    Ok(())
}

#[tauri::command]
pub fn network_proxy_status() -> ProxyStatus {
    status()
}

/// Re-read Windows' proxy setting now ("Refresh").
#[tauri::command]
pub fn network_proxy_refresh() -> ProxyStatus {
    let settings = status().settings;
    install(settings);
    status()
}

#[tauri::command]
pub fn network_proxy_set(
    mode: ProxyMode,
    host: Option<String>,
    port: Option<u16>,
    username: Option<String>,
    password: Option<String>,
) -> Result<ProxyStatus, Failure> {
    if mode == ProxyMode::Windows && !cfg!(target_os = "windows") {
        return Err(failure(
            "unsupported",
            "This system's proxy setting can't be used yet.",
        ));
    }
    let manual = matches!(mode, ProxyMode::Http | ProxyMode::Socks5);
    let mut settings = ProxySettings {
        mode,
        host: if manual {
            host.unwrap_or_default().trim().to_string()
        } else {
            String::new()
        },
        port: if manual { port.unwrap_or(0) } else { 0 },
        has_credentials: false,
    };
    validate(&settings)?;
    let entry = keyring::Entry::new(KEYRING_SERVICE, "proxy")
        .map_err(|_| failure("credential", "The OS credential store is unavailable."))?;
    match (manual, username.filter(|u| !u.is_empty()), password) {
        (true, Some(user), Some(password)) => {
            if user.contains('\n') || user.len() > 256 || password.len() > 1024 {
                return Err(failure(
                    "policy",
                    "The proxy user name or password is not valid.",
                ));
            }
            entry
                .set_password(&format!("{user}\n{password}"))
                .map_err(|_| failure("credential", "Could not save the proxy password."))?;
            settings.has_credentials = true;
        }
        (true, None, _) | (false, _, _) => {
            let _ = entry.delete_credential();
        }
        // A user name without a new password keeps the stored credential.
        (true, Some(_), None) => settings.has_credentials = credentials().is_some(),
    }
    if let Some(path) = CONFIG_PATH.get() {
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        std::fs::write(path, serde_json::to_vec(&settings).unwrap_or_default())
            .map_err(|_| failure("storage", "Could not save the network setting."))?;
    }
    install(settings);
    Ok(status())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn built(effective: &Effective, creds: Option<(String, String)>) -> bool {
        apply_effective(reqwest::Client::builder(), effective, creds)
            .and_then(|b| b.build().map_err(|_| failure("x", "x")))
            .is_ok()
    }

    #[test]
    fn every_mode_builds_a_client_and_pac_is_refused() {
        assert!(built(&Effective::Direct, None));
        assert!(built(
            &Effective::Proxy {
                scheme: "http",
                host: "proxy.corp".into(),
                port: 8080
            },
            Some(("u".into(), "p".into()))
        ));
        assert!(built(
            &Effective::Proxy {
                scheme: "socks5h",
                host: "127.0.0.1".into(),
                port: 9050
            },
            None
        ));
        assert!(built(
            &Effective::Proxy {
                scheme: "http",
                host: "::1".into(),
                port: 3128
            },
            None
        ));
        let refused = apply_effective(reqwest::Client::builder(), &Effective::Unsupported, None);
        assert_eq!(refused.err().unwrap().kind, "proxy");
    }

    #[test]
    fn manual_modes_need_a_host_and_port() {
        for (mode, host, port, ok) in [
            (ProxyMode::Direct, "", 0, true),
            (ProxyMode::Windows, "", 0, true),
            (ProxyMode::Http, "proxy.corp", 8080, true),
            (ProxyMode::Socks5, "127.0.0.1", 9050, true),
            (ProxyMode::Http, "", 8080, false),
            (ProxyMode::Socks5, "127.0.0.1", 0, false),
            (ProxyMode::Http, "evil host/path", 80, false),
        ] {
            let settings = ProxySettings {
                mode,
                host: host.into(),
                port,
                has_credentials: false,
            };
            assert_eq!(validate(&settings).is_ok(), ok, "{mode:?} {host}:{port}");
        }
    }

    #[test]
    fn reads_windows_proxy_server_values() {
        assert_eq!(
            parse_windows_proxy("proxy.corp:8080"),
            Some(("http", "proxy.corp".into(), 8080))
        );
        assert_eq!(
            parse_windows_proxy("http=a.corp:80;https=b.corp:443;socks=c.corp:1080"),
            Some(("http", "b.corp".into(), 443))
        );
        assert_eq!(
            parse_windows_proxy("socks=tor.local:9050"),
            Some(("socks5", "tor.local".into(), 9050))
        );
        assert_eq!(parse_windows_proxy(""), None);
        assert_eq!(parse_windows_proxy("noport"), None);
    }

    #[test]
    fn socks_mode_resolves_names_through_the_proxy() {
        let effective = effective_for(&ProxySettings {
            mode: ProxyMode::Socks5,
            host: "127.0.0.1".into(),
            port: 9050,
            has_credentials: false,
        });
        assert!(matches!(
            effective,
            Effective::Proxy {
                scheme: "socks5h",
                ..
            }
        ));
        assert_eq!(effective_for(&ProxySettings::default()), Effective::Direct);
    }
}
