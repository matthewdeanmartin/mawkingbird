//! Fixed read-only GitHub operations; GraphQL text is owned by Rust.
use crate::{
    public_mastodon::{failure, Failure},
    social,
};
use serde_json::{json, Value};
use url::Url;
fn denied() -> Failure {
    failure("policy", "This GitHub reader operation is not supported.")
}
pub fn graph_body(body: &Value) -> Result<Value, Failure> {
    let o = body.as_object().ok_or_else(denied)?;
    if !o
        .keys()
        .all(|k| matches!(k.as_str(), "operation" | "cursor"))
    {
        return Err(denied());
    }
    let query = match body["operation"].as_str() {
        Some("following") => include_str!("github_following.graphql"),
        Some("starred") => include_str!("github_starred.graphql"),
        _ => return Err(denied()),
    };
    let cursor = &body["cursor"];
    if !cursor.is_null()
        && !cursor
            .as_str()
            .is_some_and(|s| s.len() <= 2048 && !s.chars().any(char::is_control))
    {
        return Err(denied());
    }
    Ok(json!({"query":query,"variables":{"cursor":cursor}}))
}
pub fn target(raw: &str, method: &str, body: Option<&Value>) -> Result<Url, Failure> {
    let url = social::target(raw)?;
    if raw.len() > 8192
        || url.host_str() != Some("api.github.com")
        || Url::parse(raw).map_err(|_| denied())?.fragment().is_some()
    {
        return Err(denied());
    }
    if method == "POST" && url.path() == "/graphql" && url.query().is_none() {
        graph_body(body.ok_or_else(denied)?)?;
        return Ok(url);
    }
    if method != "GET" || body.is_some() {
        return Err(denied());
    }
    let keys: &[&str] = match url.path() {
        "/user" => &[],
        "/notifications" => &["all", "participating", "per_page"],
        "/user/following" => &["per_page"],
        _ => return Err(denied()),
    };
    let mut seen = std::collections::HashSet::new();
    if !url.query_pairs().all(|(k, v)| {
        seen.insert(k.to_string())
            && keys.contains(&k.as_ref())
            && if k == "per_page" {
                v.parse::<u32>().is_ok_and(|n| (1..=100).contains(&n))
            } else {
                matches!(v.as_ref(), "true" | "false")
            }
    }) {
        return Err(denied());
    }
    Ok(url)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn allows_only_fixed_read_operations() {
        for url in [
            "https://api.github.com/user",
            "https://api.github.com/notifications?all=false&participating=false&per_page=10",
            "https://api.github.com/user/following?per_page=10",
        ] {
            assert!(target(url, "GET", None).is_ok());
        }
        for url in [
            "https://api.github.com/repos/writer/blog",
            "https://api.github.com/gists",
            "https://api.github.com/notifications?per_page=999",
            "https://api.github.com/user?token=secret",
        ] {
            assert!(target(url, "GET", None).is_err());
        }
        assert!(target("https://api.github.com/notifications", "PUT", None).is_err());
        assert!(target(
            "https://api.github.com/graphql",
            "POST",
            Some(&json!({"query":"mutation { deleteRepository }"}))
        )
        .is_err());
    }
    #[test]
    fn graph_queries_are_fixed_and_cursors_are_data() {
        for op in ["following", "starred"] {
            let value = graph_body(&json!({"operation":op,"cursor":"cursor-value"})).unwrap();
            assert!(value["query"]
                .as_str()
                .unwrap()
                .trim_start()
                .starts_with("query "));
            assert_eq!(value["variables"]["cursor"], "cursor-value");
        }
        assert!(graph_body(&json!({"operation":"following","query":"override"})).is_err());
        assert!(graph_body(&json!({"operation":"mutation"})).is_err());
    }
}
