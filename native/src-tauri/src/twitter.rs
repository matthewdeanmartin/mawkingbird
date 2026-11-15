//! Read-only TwitterAPI.io connector. The paid API key stays in the OS store.
use crate::{
    connectors::read_response,
    public_mastodon::{client_for, failure, Failure, PublicResponse},
    social,
};
use serde::{Deserialize, Serialize};
use tokio::sync::{Mutex, Semaphore};
use url::Url;

static ACCOUNTS: Mutex<()> = Mutex::const_new(());
static REQUESTS: Semaphore = Semaphore::const_new(4);

#[derive(Serialize, Deserialize)]
struct Credential {
    token: String,
}

fn denied() -> Failure {
    failure("policy", "This Twitter data request is not supported.")
}

fn bound(handle: &str) -> Result<Credential, Failure> {
    if !handle.starts_with("native-twitter:") {
        return Err(denied());
    }
    social::load(handle)
}

fn target(raw: &str) -> Result<Url, Failure> {
    if raw.len() > 8192 || Url::parse(raw).map_err(|_| denied())?.fragment().is_some() {
        return Err(denied());
    }
    let url = social::target(raw)?;
    if url.host_str() != Some("api.twitterapi.io") || url.port().is_some() {
        return Err(denied());
    }
    let allowed = match url.path() {
        "/oapi/my/info" => &[][..],
        "/twitter/user/info" | "/twitter/user/last_tweets" => &["userName"][..],
        "/twitter/user/tweet_timeline" => &["userId", "cursor"][..],
        "/twitter/user/followings" => &["userId", "userName", "pageSize", "cursor"][..],
        "/twitter/tweets" => &["tweet_ids"][..],
        "/twitter/tweet/replies" => &["tweetId", "cursor"][..],
        _ => return Err(denied()),
    };
    let mut seen = std::collections::HashSet::new();
    if !url.query_pairs().all(|(key, value)| {
        allowed.contains(&key.as_ref())
            && seen.insert(key.to_string())
            && !value.is_empty()
            && value.len() <= 512
            && !value.chars().any(char::is_control)
            && (key != "pageSize" || value == "200")
    }) {
        return Err(denied());
    }
    Ok(url)
}

async fn send(url: Url, token: &str) -> Result<PublicResponse, Failure> {
    let response = client_for(&url)
        .await?
        .get(url)
        .header("X-API-Key", token)
        .header("Accept", "application/json")
        .header("Accept-Encoding", "identity")
        .send()
        .await
        .map_err(|_| failure("network", "Could not reach TwitterAPI.io."))?;
    read_response(response).await
}

#[tauri::command]
pub async fn twitter_connect(token: String, previous: Option<String>) -> Result<String, Failure> {
    let _guard = ACCOUNTS.lock().await;
    if let Some(handle) = &previous {
        bound(handle)?;
    }
    let token = token.trim();
    if token.is_empty()
        || token.len() > 8192
        || token.chars().any(char::is_control)
        || token.starts_with("native-")
    {
        return Err(failure("policy", "Paste a valid TwitterAPI.io key."));
    }
    let _permit = REQUESTS
        .try_acquire()
        .map_err(|_| failure("busy", "Too many Twitter requests."))?;
    let response = send(target("https://api.twitterapi.io/oapi/my/info")?, token).await?;
    if response.status != 200 {
        return Err(failure(
            "credentials",
            "TwitterAPI.io rejected this API key.",
        ));
    }
    let handle = previous.unwrap_or_else(|| format!("native-twitter:{}", social::random()));
    social::save(
        &handle,
        &Credential {
            token: token.into(),
        },
    )?;
    Ok(handle)
}

#[tauri::command]
pub async fn twitter_request(handle: String, url: String) -> Result<PublicResponse, Failure> {
    let url = target(&url)?;
    let _permit = REQUESTS
        .try_acquire()
        .map_err(|_| failure("busy", "Too many Twitter requests."))?;
    let credential = bound(&handle)?;
    send(url, &credential.token).await
}

#[tauri::command]
pub async fn twitter_forget(handle: String) -> Result<(), Failure> {
    if !handle.starts_with("native-twitter:") {
        return Err(denied());
    }
    let _guard = ACCOUNTS.lock().await;
    social::delete_credential(&handle)
}

#[cfg(test)]
mod tests {
    use super::target;

    #[test]
    fn only_scoped_read_endpoints_reach_twitterapi() {
        assert!(target("https://api.twitterapi.io/twitter/user/info?userName=jack").is_ok());
        assert!(target(
            "https://api.twitterapi.io/twitter/user/followings?pageSize=200&userName=jack"
        )
        .is_ok());
        for raw in [
            "https://api.twitterapi.io/twitter/post?text=hello",
            "https://api.twitterapi.io/twitter/user/info?key=secret",
            "https://api.twitterapi.io/twitter/user/info?userName=a&userName=b",
            "https://other.twitterapi.io/twitter/user/info?userName=jack",
            "http://api.twitterapi.io/twitter/user/info?userName=jack",
            "https://api.twitterapi.io/twitter/user/info?userName=jack#fragment",
        ] {
            assert!(target(raw).is_err(), "{raw}");
        }
    }
}
