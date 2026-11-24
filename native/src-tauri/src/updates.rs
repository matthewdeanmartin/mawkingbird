//! "Check for updates" (parity item 3): a version comparison and a link.
//!
//! Owner decision 2026-11-16: no signing keys and no self-installing updater.
//! One user-initiated request to GitHub's public releases API; nothing runs in
//! the background, nothing is downloaded or installed.
use crate::public_mastodon::{client_for, failure, Failure};
use serde::{Deserialize, Serialize};
use std::time::Duration;
use url::Url;

/// The public repository that publishes unsigned `native-vX.Y.Z` releases.
const RELEASES: &str =
    "https://api.github.com/repos/matthewdeanmartin/mawkingbird/releases?per_page=20";
const MAX_BYTES: usize = 2 * 1024 * 1024;

#[derive(Deserialize)]
struct Release {
    tag_name: String,
    #[serde(default)]
    draft: bool,
    #[serde(default)]
    prerelease: bool,
    #[serde(default)]
    html_url: String,
    #[serde(default)]
    body: Option<String>,
}

#[derive(Serialize, Debug, PartialEq, Eq)]
pub struct UpdateCheck {
    pub current: String,
    /// Newest published version, when one was found.
    pub latest: Option<String>,
    pub update_available: bool,
    pub notes: Option<String>,
    /// The release page, always on github.com, opened in the system browser.
    pub url: Option<String>,
}

/// `native-v1.2.3` → (1, 2, 3). Anything else (other tags, `-rc` suffixes) is ignored.
fn native_version(tag: &str) -> Option<(u64, u64, u64)> {
    parse_version(tag.strip_prefix("native-v")?)
}

fn parse_version(raw: &str) -> Option<(u64, u64, u64)> {
    let mut parts = raw.split('.');
    let version = (
        parts.next()?.parse().ok()?,
        parts.next()?.parse().ok()?,
        parts.next()?.parse().ok()?,
    );
    parts.next().is_none().then_some(version)
}

fn release_page(raw: &str) -> Option<String> {
    let url = Url::parse(raw).ok()?;
    (url.scheme() == "https"
        && url.host_str() == Some("github.com")
        && url
            .path()
            .starts_with("/matthewdeanmartin/mawkingbird/releases/"))
    .then(|| url.to_string())
}

fn pick(current: &str, releases: Vec<Release>) -> UpdateCheck {
    let newest = releases
        .into_iter()
        .filter(|r| !r.draft && !r.prerelease)
        .filter_map(|r| native_version(&r.tag_name).map(|v| (v, r)))
        .max_by_key(|(v, _)| *v);
    let mine = parse_version(current);
    match newest {
        Some((version, release)) => UpdateCheck {
            current: current.to_string(),
            latest: Some(format!("{}.{}.{}", version.0, version.1, version.2)),
            update_available: mine.is_some_and(|mine| version > mine),
            notes: release
                .body
                .map(|b| b.chars().take(20_000).collect::<String>()),
            url: release_page(&release.html_url),
        },
        None => UpdateCheck {
            current: current.to_string(),
            latest: None,
            update_available: false,
            notes: None,
            url: None,
        },
    }
}

#[tauri::command]
pub async fn check_for_update(app: tauri::AppHandle) -> Result<UpdateCheck, Failure> {
    let current = app.package_info().version.to_string();
    let url = Url::parse(RELEASES).map_err(|_| failure("policy", "Invalid release address."))?;
    let result = tokio::time::timeout(Duration::from_secs(10), async {
        let mut response = client_for(&url)
            .await?
            .get(url)
            .header("Accept", "application/vnd.github+json")
            .header("Accept-Encoding", "identity")
            .send()
            .await
            .map_err(|_| failure("network", "Couldn't check for updates."))?;
        let status = response.status().as_u16();
        if status == 403 || status == 429 {
            return Err(failure("rate_limit", "GitHub is busy. Try again later."));
        }
        if !response.status().is_success() {
            return Err(failure("upstream", "Couldn't check for updates."));
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|_| failure("network", "Couldn't check for updates."))?
        {
            if bytes.len() + chunk.len() > MAX_BYTES {
                return Err(failure("response", "Couldn't check for updates."));
            }
            bytes.extend_from_slice(&chunk);
        }
        let releases: Vec<Release> = serde_json::from_slice(&bytes)
            .map_err(|_| failure("response", "Couldn't check for updates."))?;
        Ok(pick(&current, releases))
    })
    .await
    .map_err(|_| failure("timeout", "Couldn't check for updates."))?;
    crate::diagnostics::record(
        "update_check",
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

    fn release(tag: &str, draft: bool, prerelease: bool) -> Release {
        Release {
            tag_name: tag.into(),
            draft,
            prerelease,
            html_url: format!(
                "https://github.com/matthewdeanmartin/mawkingbird/releases/tag/{tag}"
            ),
            body: Some(format!("notes for {tag}")),
        }
    }

    #[test]
    fn compares_as_semantic_versions() {
        let found = pick(
            "0.9.3",
            vec![
                release("native-v0.9.3", false, false),
                release("native-v0.10.0", false, false),
            ],
        );
        assert_eq!(found.latest.as_deref(), Some("0.10.0"));
        assert!(found.update_available);
        assert_eq!(found.notes.as_deref(), Some("notes for native-v0.10.0"));
        assert_eq!(
            found.url.as_deref(),
            Some("https://github.com/matthewdeanmartin/mawkingbird/releases/tag/native-v0.10.0")
        );
        assert!(!pick("0.10.0", vec![release("native-v0.10.0", false, false)]).update_available);
        assert!(!pick("1.0.0", vec![release("native-v0.10.0", false, false)]).update_available);
    }

    #[test]
    fn ignores_other_tags_drafts_and_prereleases() {
        let found = pick(
            "0.1.0",
            vec![
                release("v9.9.9", false, false),
                release("web-v5.0.0", false, false),
                release("native-v2.0.0", true, false),
                release("native-v3.0.0", false, true),
                release("native-v4.0.0-rc1", false, false),
                release("native-v0.2.0", false, false),
            ],
        );
        assert_eq!(found.latest.as_deref(), Some("0.2.0"));
        assert!(found.update_available);
        let none = pick("0.1.0", vec![release("v1.0.0", false, false)]);
        assert_eq!(none.latest, None);
        assert!(!none.update_available);
    }

    #[test]
    fn release_links_stay_on_the_public_repository() {
        let mut odd = release("native-v0.2.0", false, false);
        odd.html_url = "https://evil.example/download".into();
        assert_eq!(pick("0.1.0", vec![odd]).url, None);
    }
}
