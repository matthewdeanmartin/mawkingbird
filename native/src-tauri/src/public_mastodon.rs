//! Anonymous public Mastodon JSON reads. This is not a general HTTP tunnel.
use serde::Serialize;
use std::{
    collections::BTreeMap,
    net::{IpAddr, SocketAddr},
    time::Duration,
};
use tokio::sync::Semaphore;
use url::Url;

const MAX_BYTES: usize = 4 * 1024 * 1024;
static REQUESTS: Semaphore = Semaphore::const_new(8);

#[derive(Debug, Serialize)]
pub struct Failure {
    pub kind: &'static str,
    pub message: &'static str,
}

pub(crate) fn failure(kind: &'static str, message: &'static str) -> Failure {
    Failure { kind, message }
}

#[derive(Serialize)]
pub struct PublicResponse {
    pub status: u16,
    pub headers: BTreeMap<String, String>,
    pub body: String,
}

fn numeric(value: &str) -> bool {
    !value.is_empty() && value.bytes().all(|c| c.is_ascii_digit())
}

fn public_path(path: &str) -> bool {
    if matches!(
        path,
        "/api/v1/instance"
            | "/api/v2/instance"
            | "/api/v1/instance/extended_description"
            | "/api/v1/instance/rules"
            | "/api/v1/instance/translation_languages"
            | "/api/v1/accounts"
            | "/api/v1/accounts/lookup"
            | "/api/v1/accounts/search"
            | "/api/v1/statuses"
            | "/api/v1/directory"
            | "/api/v1/custom_emojis"
            | "/api/v1/trends"
            | "/api/v1/trends/tags"
            | "/api/v1/trends/statuses"
            | "/api/v1/trends/links"
            | "/api/v1/timelines/public"
            | "/api/v2/search"
    ) {
        return true;
    }
    let parts: Vec<_> = path.trim_start_matches('/').split('/').collect();
    match parts.as_slice() {
        ["api", "v1", "accounts", id] | ["api", "v1", "statuses", id] => numeric(id),
        ["api", "v1", "accounts", id, "statuses" | "followers" | "following" | "featured_tags" | "endorsements"] => {
            numeric(id)
        }
        ["api", "v1", "statuses", id, "context"] => numeric(id),
        ["api", "v1", "timelines", "tag", tag] => {
            !tag.is_empty() && !tag.to_ascii_lowercase().contains("%2f")
        }
        _ => false,
    }
}

pub(crate) fn validate_url(raw: &str) -> Result<Url, Failure> {
    let invalid = || {
        failure(
            "policy",
            "Only public HTTPS Mastodon read endpoints are available.",
        )
    };
    if raw.len() > 8192 || raw.chars().any(char::is_control) {
        return Err(invalid());
    }
    let url = Url::parse(raw).map_err(|_| invalid())?;
    if url.scheme() != "https"
        || url.host_str().is_none()
        || url.port().is_some()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.fragment().is_some()
        || !public_path(url.path())
    {
        return Err(invalid());
    }
    for (key, value) in url.query_pairs() {
        if !matches!(
            key.as_ref(),
            "id[]"
                | "acct"
                | "q"
                | "type"
                | "limit"
                | "offset"
                | "max_id"
                | "min_id"
                | "since_id"
                | "local"
                | "remote"
                | "only_media"
                | "exclude_replies"
                | "exclude_reblogs"
                | "pinned"
                | "tagged"
                | "order"
                | "resolve"
                | "following"
                | "account_id"
                | "any[]"
                | "all[]"
                | "none[]"
        ) || value.len() > 512
            || (key == "resolve" && value != "false")
        {
            return Err(invalid());
        }
    }
    Ok(url)
}

fn public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => {
            let [a, b, c, _] = ip.octets();
            !(a == 0
                || a == 10
                || a == 127
                || a >= 224
                || (a == 100 && (64..=127).contains(&b))
                || (a == 169 && b == 254)
                || (a == 172 && (16..=31).contains(&b))
                || (a == 192
                    && (b == 168 || (b == 0 && (c == 0 || c == 2)) || (b == 88 && c == 99)))
                || (a == 198 && (b == 18 || b == 19 || (b == 51 && c == 100)))
                || (a == 203 && b == 0 && c == 113))
        }
        IpAddr::V6(ip) => {
            let s = ip.segments();
            (s[0] & 0xe000) == 0x2000
                && s[0] != 0x2002
                && !(s[0] == 0x2001 && (s[1] <= 0x01ff || s[1] == 0x0db8))
                && !(s[0] == 0x3fff && s[1] < 0x1000)
        }
    }
}

// Owner-approved local test server. Match the parsed hostname, never a suffix.
const LOCAL_TEST_HOST: &str = "mastomini.local";
fn host_allowed(host: &str) -> bool {
    let normalized = host.trim_end_matches('.').to_ascii_lowercase();
    host == LOCAL_TEST_HOST || !(normalized == "local" || normalized.ends_with(".local"))
}
fn address_allowed(host: &str, ip: IpAddr) -> bool {
    if !host_allowed(host) {
        return false;
    }
    if public_ip(ip) {
        return true;
    }
    if host != LOCAL_TEST_HOST {
        return false;
    }
    match ip {
        IpAddr::V4(ip) => ip.is_loopback() || ip.is_private() || ip.is_link_local(),
        IpAddr::V6(ip) => {
            ip.is_loopback()
                || ip.is_unique_local()
                || ip.is_unicast_link_local()
                || ip
                    .to_ipv4_mapped()
                    .is_some_and(|v4| address_allowed(host, IpAddr::V4(v4)))
        }
    }
}

pub(crate) async fn client_for(url: &Url) -> Result<reqwest::Client, Failure> {
    let host = url
        .host_str()
        .ok_or_else(|| failure("policy", "Missing server host."))?;
    if !host_allowed(host) {
        return Err(failure(
            "policy",
            "Local hosts are blocked except mastomini.local.",
        ));
    }
    let port = match url.scheme() {
        "https" => 443,
        "http" => 80,
        _ => return Err(failure("policy", "Only HTTP(S) transport is supported.")),
    };
    if url.port().is_some() {
        return Err(failure("policy", "Non-default ports are blocked."));
    }
    let addresses: Vec<SocketAddr> = tokio::net::lookup_host((host, port))
        .await
        .map_err(|_| failure("network", "Could not resolve the remote server."))?
        .collect();
    if addresses.is_empty() || addresses.iter().any(|a| !address_allowed(host, a.ip())) {
        return Err(failure(
            "policy",
            "Private and special-use network destinations are blocked.",
        ));
    }
    // Pin the validated addresses: no second DNS lookup, no system proxy that
    // resolves elsewhere, no cookies, no caller headers, and no redirects.
    let builder = reqwest::Client::builder();
    // Android has no desktop OpenSSL installation. Use explicit public roots
    // without JNI initialization or accepting invalid certificates.
    #[cfg(target_os = "android")]
    let builder = {
        let roots =
            rustls::RootCertStore::from_iter(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());
        let tls = rustls::ClientConfig::builder_with_provider(std::sync::Arc::new(
            rustls::crypto::ring::default_provider(),
        ))
        .with_safe_default_protocol_versions()
        .map_err(|_| failure("network", "Could not initialize TLS protocols."))?
        .with_root_certificates(roots)
        .with_no_client_auth();
        builder.use_preconfigured_tls(tls)
    };
    builder
        .no_proxy()
        .resolve_to_addrs(host, &addresses)
        .redirect(reqwest::redirect::Policy::none())
        // This client also carries publishing writes: even protocol retries are explicit.
        .retry(reqwest::retry::never())
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(12))
        .user_agent("MawkingbirdNative/0.1 (public reader)")
        .build()
        .map_err(|_| failure("network", "Could not initialize HTTPS transport."))
}

async fn fetch(url: Url) -> Result<PublicResponse, Failure> {
    let client = client_for(&url).await?;
    let response = client
        .get(url)
        .header("Accept", "application/json")
        .header("Accept-Encoding", "identity")
        .send()
        .await
        .map_err(|_| failure("network", "Could not reach the Mastodon server over HTTPS."))?;
    read_json(response).await
}

pub(crate) async fn read_json(mut response: reqwest::Response) -> Result<PublicResponse, Failure> {
    if response.status().is_redirection() {
        return Err(failure(
            "policy",
            "This Mastodon endpoint redirected; select its canonical HTTPS server address.",
        ));
    }
    let mime = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    if mime.split(';').next().map(str::trim) != Some("application/json") {
        return Err(failure(
            "response",
            "The server did not return Mastodon JSON.",
        ));
    }
    if response
        .content_length()
        .is_some_and(|n| n > MAX_BYTES as u64)
    {
        return Err(failure(
            "response",
            "Mastodon response exceeded the size limit.",
        ));
    }
    let status = response.status().as_u16();
    let mut headers = BTreeMap::new();
    for name in [
        "content-type",
        "link",
        "retry-after",
        "x-ratelimit-limit",
        "x-ratelimit-remaining",
        "x-ratelimit-reset",
    ] {
        if let Some(value) = response.headers().get(name).and_then(|v| v.to_str().ok()) {
            headers.insert(name.into(), value.into());
        }
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| failure("network", "Mastodon response was interrupted."))?
    {
        if bytes.len() + chunk.len() > MAX_BYTES {
            return Err(failure(
                "response",
                "Mastodon response exceeded the size limit.",
            ));
        }
        bytes.extend_from_slice(&chunk);
    }
    let body = String::from_utf8(bytes)
        .map_err(|_| failure("response", "Mastodon response is not UTF-8."))?;
    serde_json::from_str::<serde_json::Value>(&body)
        .map_err(|_| failure("response", "Mastodon returned invalid JSON."))?;
    Ok(PublicResponse {
        status,
        headers,
        body,
    })
}

#[tauri::command]
pub async fn public_mastodon_get(url: String) -> Result<PublicResponse, Failure> {
    let url = validate_url(&url)
        .inspect_err(|e| crate::diagnostics::record("public_read", e.kind, None))?;
    let _permit = REQUESTS.try_acquire().map_err(|_| {
        failure(
            "busy",
            "Too many simultaneous public requests; retry shortly.",
        )
    })?;
    let result = tokio::time::timeout(Duration::from_secs(15), fetch(url))
        .await
        .map_err(|_| failure("network", "Mastodon request timed out."))?;
    match &result {
        Ok(r) => crate::diagnostics::record("public_read", "complete", Some(r.status)),
        Err(e) => crate::diagnostics::record("public_read", e.kind, None),
    };
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn limits_requests_to_public_read_endpoints() {
        for url in [
            "https://mastodon.social/api/v1/instance",
            "https://mastodon.social/api/v1/accounts/13179/statuses?limit=5",
            "https://mastodon.social/api/v1/accounts?id[]=13179",
        ] {
            assert!(validate_url(url).is_ok(), "{url}");
        }
        for url in [
            "http://mastodon.social/api/v1/instance",
            "https://a:b@example.com/api/v1/instance",
            "https://example.com:444/api/v1/instance",
            "https://example.com/api/v1/accounts/verify_credentials",
            "https://example.com/api/v1/timelines/home",
            "https://example.com/api/v1/instance?access_token=secret",
            "https://example.com/api/v2/search?resolve=true",
            "https://example.com/anything",
        ] {
            assert!(validate_url(url).is_err(), "{url}");
        }
    }
    #[test]
    fn only_exact_mastomini_host_can_reach_local_addresses() {
        let host = Url::parse("https://MASTOMINI.LOCAL/api/v2/instance").unwrap();
        assert_eq!(host.host_str(), Some(LOCAL_TEST_HOST));
        for ip in [
            "127.0.0.1",
            "192.168.1.12",
            "10.0.0.2",
            "172.16.0.2",
            "169.254.1.2",
            "::1",
            "fc00::1",
            "fe80::1",
            "::ffff:127.0.0.1",
        ] {
            assert!(
                address_allowed(LOCAL_TEST_HOST, ip.parse().unwrap()),
                "{ip}"
            );
            for other in [
                "other.local",
                "sub.mastomini.local",
                "mastomini.local.evil.example",
                "mastomini.local.",
                "localhost",
                "127.0.0.1",
                "example.com",
            ] {
                assert!(
                    !address_allowed(other, ip.parse().unwrap()),
                    "{other}: {ip}"
                );
            }
        }
        for host in [
            "other.local",
            "sub.mastomini.local",
            "mastomini.local.",
            "OTHER.LOCAL.",
        ] {
            assert!(!host_allowed(host));
            assert!(!address_allowed(host, "1.1.1.1".parse().unwrap()));
        }
        for ip in [
            "0.0.0.0",
            "224.0.0.1",
            "255.255.255.255",
            "::",
            "ff02::1",
            "192.0.2.1",
        ] {
            assert!(
                !address_allowed(LOCAL_TEST_HOST, ip.parse().unwrap()),
                "{ip}"
            );
        }
        assert!(validate_url("https://mastomini.local:444/api/v2/instance").is_err());
        assert!(validate_url("http://mastomini.local/api/v2/instance").is_err());
        assert!(validate_url("https://mastomini.local/anything").is_err());
    }

    #[test]
    fn excludes_private_special_and_mapped_addresses() {
        for ip in [
            "127.0.0.1",
            "10.0.0.1",
            "169.254.169.254",
            "100.64.0.1",
            "192.168.1.1",
            "192.0.2.1",
            "198.18.0.1",
            "224.0.0.1",
            "::1",
            "::ffff:127.0.0.1",
            "fc00::1",
            "fe80::1",
            "2001:db8::1",
            "2002:7f00:1::",
        ] {
            assert!(!public_ip(ip.parse().unwrap()), "{ip}");
        }
        for ip in ["1.1.1.1", "8.8.8.8", "2606:4700:4700::1111"] {
            assert!(public_ip(ip.parse().unwrap()), "{ip}");
        }
    }
}
