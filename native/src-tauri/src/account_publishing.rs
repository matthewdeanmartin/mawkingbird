//! Fixed account publishing policy, shared with the credentialed connector boundary.
use crate::{
    connectors::Provider,
    public_mastodon::{failure, Failure},
    social,
};
use serde_json::Value;
use url::Url;
fn denied() -> Failure {
    failure(
        "policy",
        "This account publishing operation is not supported.",
    )
}
fn segment(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 512
        && s.bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'_' | b'-' | b'.'))
        && s != "."
        && s != ".."
}
fn item(path: &str, prefix: &str) -> bool {
    path.strip_prefix(prefix).is_some_and(segment)
}
pub fn host(p: Provider) -> &'static str {
    match p {
        Provider::Gist | Provider::Github => "api.github.com",
        Provider::Openrouter => "openrouter.ai",
        Provider::Dub => "api.dub.co",
        Provider::Shortio => "api.short.io",
        Provider::Tly => "api.t.ly",
        Provider::Tinyurl => "api.tinyurl.com",
        Provider::Rebrandly => "api.rebrandly.com",
        _ => "",
    }
}
pub fn probe(p: Provider) -> &'static str {
    match p {
        Provider::Gist | Provider::Github => "https://api.github.com/user",
        Provider::Openrouter => "https://openrouter.ai/api/v1/key",
        Provider::Dub => "https://api.dub.co/links?pageSize=1",
        Provider::Shortio => "https://api.short.io/domains",
        Provider::Tly => "https://api.t.ly/api/v1/link/list?limit=1",
        Provider::Tinyurl => "https://api.tinyurl.com/urls?per_page=1",
        Provider::Rebrandly => "https://api.rebrandly.com/v1/links?limit=1",
        _ => "",
    }
}
pub fn valid_probe(p: Provider, v: &Value) -> bool {
    match p {
        Provider::Gist | Provider::Github => v["login"].as_str().is_some_and(|s| !s.is_empty()),
        Provider::Dub | Provider::Shortio | Provider::Rebrandly => v.is_array(),
        Provider::Openrouter => v["data"].is_object(),
        Provider::Tinyurl => v["data"].is_array(),
        Provider::Tly => v["data"].is_array() || v["links"].is_array(),
        _ => false,
    }
}
pub fn target(p: Provider, raw: &str, method: &str, body: Option<&Value>) -> Result<Url, Failure> {
    if p == Provider::Openrouter {
        return crate::intelligence::openrouter_target(raw, method, body);
    }
    if p == Provider::Github {
        return crate::github_reader::target(raw, method, body);
    }
    let url = social::target(raw)?;
    if raw.len() > 8192
        || url.host_str() != Some(host(p))
        || Url::parse(raw).map_err(|_| denied())?.fragment().is_some()
    {
        return Err(denied());
    }
    let path = url.path();
    let allowed = match p {
        Provider::Gist => match method {
            "GET" => path == "/user" || path == "/gists" || item(path, "/gists/"),
            "POST" => path == "/gists",
            "PATCH" | "DELETE" => item(path, "/gists/"),
            _ => false,
        },
        Provider::Dub => match method {
            "GET" => matches!(path, "/links" | "/links/info"),
            "POST" => path == "/links",
            "PATCH" | "DELETE" => item(path, "/links/") && path != "/links/info",
            _ => false,
        },
        Provider::Shortio => match method {
            "GET" => {
                matches!(path, "/domains" | "/api/links")
                    || item(path, "/links/") && !matches!(path, "/links/bulk" | "/links/public")
            }
            "POST" => {
                path == "/links"
                    || item(path, "/links/") && !matches!(path, "/links/bulk" | "/links/public")
            }
            "DELETE" => item(path, "/links/"),
            _ => false,
        },
        Provider::Tly => match method {
            "GET" => matches!(path, "/api/v1/link" | "/api/v1/link/list"),
            "POST" => path == "/api/v1/link/shorten",
            "PUT" | "DELETE" => path == "/api/v1/link",
            _ => false,
        },
        Provider::Tinyurl => match method {
            "GET" => path == "/urls" || alias(path),
            "POST" => path == "/create",
            "PATCH" => path == "/change",
            "DELETE" => alias(path),
            _ => false,
        },
        Provider::Rebrandly => match method {
            "GET" | "POST" => path == "/v1/links" || item(path, "/v1/links/"),
            "DELETE" => item(path, "/v1/links/"),
            _ => false,
        },
        _ => false,
    };
    if !allowed {
        return Err(denied());
    }
    let keys: &[&str] = match (p, path) {
        (Provider::Gist, "/gists") => &["per_page", "page"],
        (Provider::Dub, "/links") => &["search", "domain", "tagNames", "page", "pageSize"],
        (Provider::Dub, "/links/info") => &["linkId"],
        (Provider::Shortio, "/api/links") => &["domain", "limit", "pageToken"],
        (Provider::Tly, "/api/v1/link/list") => &["search", "page", "limit"],
        (Provider::Tly, "/api/v1/link") => &["short_url"],
        (Provider::Tinyurl, "/urls") => &["page", "per_page"],
        (Provider::Rebrandly, "/v1/links") => {
            &["limit", "orderBy", "orderDir", "last", "domain.fullName"]
        }
        _ => &[],
    };
    let mut seen = std::collections::HashSet::new();
    if method != "GET" && url.query().is_some()
        || !url.query_pairs().all(|(k, v)| {
            seen.insert(k.to_string())
                && keys.contains(&k.as_ref())
                && v.len() <= 2048
                && !v.chars().any(char::is_control)
                && match k.as_ref() {
                    "limit" | "pageSize" | "per_page" => {
                        v.parse::<u32>().is_ok_and(|n| (1..=100).contains(&n))
                    }
                    "page" => v.parse::<u32>().is_ok_and(|n| (1..=100000).contains(&n)),
                    _ => true,
                }
        })
    {
        return Err(denied());
    }
    if method == "GET" || method == "DELETE" && p != Provider::Tly {
        if body.is_some() {
            return Err(denied());
        }
    } else {
        validate_body(p, method, body.ok_or_else(denied)?)?;
    }
    Ok(url)
}
fn alias(path: &str) -> bool {
    path.strip_prefix("/alias/").is_some_and(|s| {
        let v: Vec<_> = s.split('/').collect();
        v.len() == 2 && v.iter().all(|s| segment(s))
    })
}
fn validate_body(p: Provider, method: &str, body: &Value) -> Result<(), Failure> {
    let o = body.as_object().ok_or_else(denied)?;
    if body.to_string().len() > 1024 * 1024 {
        return Err(denied());
    }
    let keys: &[&str] = match p {
        Provider::Gist => &["description", "public", "files"],
        Provider::Dub => &[
            "url",
            "externalId",
            "domain",
            "key",
            "title",
            "description",
            "tagNames",
            "expiresAt",
            "password",
            "archived",
        ],
        Provider::Shortio => &[
            "originalURL",
            "domain",
            "path",
            "title",
            "tags",
            "expiresAt",
            "password",
            "archived",
        ],
        Provider::Tly => &[
            "long_url",
            "short_url",
            "short_id",
            "domain",
            "description",
            "expire_at_datetime",
            "password",
            "public_stats",
            "include_qr_code",
        ],
        Provider::Tinyurl => &["url", "domain", "alias", "tags", "expires_at"],
        Provider::Rebrandly => &["destination", "slashtag", "title", "domain"],
        _ => &[],
    };
    if o.is_empty() || !o.keys().all(|k| keys.contains(&k.as_str())) {
        return Err(denied());
    }
    if p == Provider::Gist {
        let files = o
            .get("files")
            .and_then(Value::as_object)
            .ok_or_else(denied)?;
        if files.len() != 1
            || !files.iter().all(|(name, v)| {
                !name.is_empty()
                    && name.len() <= 200
                    && !name.contains('/')
                    && !name.contains(char::from(92))
                    && !name.chars().any(char::is_control)
                    && v.as_object().is_some_and(|f| {
                        f.keys()
                            .all(|k| matches!(k.as_str(), "filename" | "content"))
                            && f.get("content").is_some_and(Value::is_string)
                            && f.get("filename").is_none_or(Value::is_string)
                    })
            })
            || o.get("description").is_some_and(|v| !v.is_string())
            || o.get("public").is_some_and(|v| !v.is_boolean())
            || method == "PATCH" && o.contains_key("public")
        {
            return Err(denied());
        }
    } else {
        for (k, v) in o {
            if matches!(
                k.as_str(),
                "url" | "originalURL" | "long_url" | "short_url" | "destination"
            ) && !v
                .as_str()
                .is_some_and(|s| crate::feeds::validate_url(s).is_ok())
            {
                return Err(denied());
            }
        }
    }
    Ok(())
}

/// The shared editor supplies a new filename; GitHub PATCH keys name the old file.
pub fn gist_edit(current: &Value, mut changes: Value) -> Result<Value, Failure> {
    let files = current["files"].as_object().ok_or_else(denied)?;
    if files.len() != 1 {
        return Err(failure(
            "policy",
            "Only single-file gists can be edited here.",
        ));
    }
    let old = files.keys().next().unwrap();
    let requested = changes["files"].as_object().ok_or_else(denied)?;
    let (new, file) = requested.iter().next().ok_or_else(denied)?;
    let content = file["content"].as_str().ok_or_else(denied)?;
    changes["files"] = serde_json::json!({old:{"filename":new,"content":content}});
    Ok(changes)
}
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn fixed_account_routes_allow_shared_operations_but_not_credentials_or_bulk_operations() {
        for (p, url, method, body) in [
            (
                Provider::Gist,
                "https://api.github.com/gists",
                "POST",
                Some(
                    json!({"description":"x","public":false,"files":{"x.md":{"content":"hello"}}}),
                ),
            ),
            (
                Provider::Gist,
                "https://api.github.com/gists/abc123",
                "PATCH",
                Some(json!({"files":{"new.md":{"filename":"new.md","content":"updated"}}})),
            ),
            (
                Provider::Dub,
                "https://api.dub.co/links/x",
                "PATCH",
                Some(json!({"url":"https://example.com"})),
            ),
            (
                Provider::Shortio,
                "https://api.short.io/api/links?domain=go.example.com&limit=50",
                "GET",
                None,
            ),
            (
                Provider::Shortio,
                "https://api.short.io/links/lnk_abc",
                "POST",
                Some(json!({"originalURL":"https://example.com"})),
            ),
            (
                Provider::Tly,
                "https://api.t.ly/api/v1/link",
                "DELETE",
                Some(json!({"short_url":"https://t.ly/abc"})),
            ),
            (
                Provider::Tinyurl,
                "https://api.tinyurl.com/alias/tinyurl.com/abc",
                "DELETE",
                None,
            ),
            (
                Provider::Rebrandly,
                "https://api.rebrandly.com/v1/links?limit=25&orderDir=desc&orderBy=createdAt",
                "GET",
                None,
            ),
        ] {
            assert!(target(p, url, method, body.as_ref()).is_ok(), "{url}");
        }
        for (p, url) in [
            (Provider::Gist, "https://api.github.com/repos/owner/repo"),
            (Provider::Gist, "https://api.github.com/gists/abc/comments"),
            (Provider::Dub, "https://api.dub.co/links?token=secret"),
            (Provider::Dub, "https://api.dub.co/links?pageSize=999"),
            (Provider::Shortio, "https://api.short.io/links/bulk"),
            (Provider::Tinyurl, "https://api.tinyurl.com/alias/a/b/c"),
            (
                Provider::Rebrandly,
                "https://api.rebrandly.com/v1/links?limit=1&limit=2",
            ),
        ] {
            assert!(target(p, url, "GET", None).is_err(), "{url}");
        }
        assert!(target(
            Provider::Gist,
            "https://api.github.com/gists",
            "POST",
            Some(&json!({"files":{"x":{"content":"x"}},"token":"secret"}))
        )
        .is_err());
        assert!(target(
            Provider::Tly,
            "https://api.t.ly/api/v1/link",
            "DELETE",
            Some(&json!({"short_url":"file:///secret"}))
        )
        .is_err());
        for p in [
            Provider::Gist,
            Provider::Dub,
            Provider::Shortio,
            Provider::Tly,
            Provider::Tinyurl,
            Provider::Rebrandly,
        ] {
            assert!(target(p, probe(p), "GET", None).is_ok());
            for bad in [
                format!("https://{}@evil.test/", host(p)),
                format!("https://{}:444/", host(p)),
                format!("https://{}/?access_token=x", host(p)),
            ] {
                assert!(target(p, &bad, "GET", None).is_err());
            }
        }
    }
    #[test]
    fn gist_edits_rename_the_original_file_and_refuse_multi_file_gists() {
        let changes = json!({"description":"New title","files":{"new.md":{"filename":"new.md","content":"new text"}}});
        let edited = gist_edit(&json!({"files":{"old.txt":{}}}), changes.clone()).unwrap();
        assert_eq!(edited["files"]["old.txt"]["filename"], "new.md");
        assert!(edited["files"].get("new.md").is_none());
        assert!(gist_edit(&json!({"files":{"a":{},"b":{}}}), changes).is_err());
    }
}
