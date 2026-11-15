//! Fixed public translation/model routes and OS-backed OpenRouter OAuth.
use crate::{
    connectors,
    diagnostics::record,
    public_mastodon::{client_for, failure, Failure, PublicResponse},
    social,
};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{collections::HashSet, time::Duration};
use tauri_plugin_opener::OpenerExt;
use tokio::sync::Semaphore;
use url::Url;
static REQUESTS: Semaphore = Semaphore::const_new(4);
static LOGIN: Semaphore = Semaphore::const_new(1);
fn denied() -> Failure {
    failure(
        "policy",
        "This translation or AI operation is not supported.",
    )
}
fn language(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 35
        && s.bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_'))
}
fn pair(s: &str) -> bool {
    let p: Vec<_> = s.split('|').collect();
    p.len() == 2 && p.iter().all(|s| language(s))
}
fn params(raw: &str, allowed: &[&str]) -> Result<Vec<(String, String)>, Failure> {
    let mut seen = HashSet::new();
    let p: Vec<_> = url::form_urlencoded::parse(raw.as_bytes())
        .map(|(k, v)| (k.into_owned(), v.into_owned()))
        .collect();
    if !p
        .iter()
        .all(|(k, _)| allowed.contains(&k.as_str()) && seen.insert(k.clone()))
    {
        return Err(denied());
    }
    Ok(p)
}
fn translation_params(raw: &str, mymemory: bool) -> Result<(), Failure> {
    let p = params(
        raw,
        if mymemory {
            &["q", "langpair", "de"]
        } else {
            &["q", "langpair", "markUnknown"]
        },
    )?;
    let get = |key: &str| p.iter().find(|(k, _)| k == key).map(|(_, v)| v.as_str());
    if !get("q").is_some_and(|v| !v.is_empty() && v.len() <= if mymemory { 500 } else { 64 * 1024 })
        || !get("langpair").is_some_and(pair)
        || get("de").is_some_and(|v| v.len() > 254 || v.chars().any(char::is_control))
        || get("markUnknown").is_some_and(|v| v != "no")
    {
        return Err(denied());
    }
    Ok(())
}
fn public_target(raw: &str, method: &str, body: Option<&str>) -> Result<Url, Failure> {
    let url = social::target(raw)?;
    if raw.len() > 8192 || Url::parse(raw).map_err(|_| denied())?.fragment().is_some() {
        return Err(denied());
    }
    match (url.host_str().unwrap_or(""), url.path(), method) {
        ("api.mymemory.translated.net", "/get", "GET") if body.is_none() => {
            translation_params(url.query().unwrap_or(""), true)?
        }
        ("apertium.org", "/apy/listPairs", "GET") if body.is_none() && url.query().is_none() => (),
        ("apertium.org", "/apy/translate", "POST") if url.query().is_none() => {
            translation_params(body.ok_or_else(denied)?, false)?
        }
        ("openrouter.ai", "/api/v1/models", "GET") if body.is_none() => {
            let p = params(
                url.query().unwrap_or(""),
                &["q", "limit", "supported_parameters"],
            )?;
            if !p.iter().all(|(k, v)| match k.as_str() {
                "q" => v.len() <= 256 && !v.chars().any(char::is_control),
                "limit" => v.parse::<u32>().is_ok_and(|n| (1..=100).contains(&n)),
                _ => v == "structured_outputs",
            }) {
                return Err(denied());
            }
        }
        _ => return Err(denied()),
    }
    Ok(url)
}
#[tauri::command]
pub async fn intelligence_public_request(
    url: String,
    method: String,
    body: Option<String>,
) -> Result<PublicResponse, Failure> {
    let result = async {
        let _permit = REQUESTS
            .try_acquire()
            .map_err(|_| failure("busy", "Too many translation requests. Try again shortly."))?;
        let url = public_target(&url, &method, body.as_deref())?;
        let mut request = client_for(&url)
            .await?
            .request(
                reqwest::Method::from_bytes(method.as_bytes()).map_err(|_| denied())?,
                url,
            )
            .header("Accept", "application/json");
        if let Some(body) = body {
            request = request
                .header("Content-Type", "application/x-www-form-urlencoded")
                .body(body);
        }
        let response = request.send().await.map_err(|_| {
            failure(
                "network",
                "Could not reach the translation or AI service. See Help > Open logs.",
            )
        })?;
        connectors::read_response(response).await
    }
    .await;
    record(
        "intelligence_public",
        result
            .as_ref()
            .map(|_| "complete")
            .unwrap_or_else(|e| e.kind),
        result.as_ref().ok().map(|r| r.status),
    );
    result
}
pub fn openrouter_target(raw: &str, method: &str, body: Option<&Value>) -> Result<Url, Failure> {
    let url = social::target(raw)?;
    if url.host_str() != Some("openrouter.ai")
        || url.query().is_some()
        || Url::parse(raw).map_err(|_| denied())?.fragment().is_some()
    {
        return Err(denied());
    }
    if method == "GET" && matches!(url.path(), "/api/v1/key" | "/api/v1/credits") && body.is_none()
    {
        return Ok(url);
    }
    if method != "POST" || url.path() != "/api/v1/chat/completions" {
        return Err(denied());
    }
    let v = body.ok_or_else(denied)?;
    let o = v.as_object().ok_or_else(denied)?;
    if !o.keys().all(|k| {
        matches!(
            k.as_str(),
            "model" | "max_tokens" | "messages" | "usage" | "response_format"
        )
    }) || !v["model"]
        .as_str()
        .is_some_and(|s| !s.is_empty() && s.len() <= 256 && !s.chars().any(char::is_control))
        || !v["max_tokens"]
            .as_u64()
            .is_some_and(|n| (1..=8000).contains(&n))
        || v.to_string().len() > 2 * 1024 * 1024
        || o.get("usage")
            .is_some_and(|u| *u != json!({"include":true}))
    {
        return Err(denied());
    }
    let messages = v["messages"].as_array().ok_or_else(denied)?;
    if messages.len() != 1
        || messages[0]["role"] != "user"
        || messages[0].as_object().is_none_or(|o| o.len() != 2)
    {
        return Err(denied());
    }
    let content = &messages[0]["content"];
    if !content.is_string() {
        let parts = content.as_array().ok_or_else(denied)?;
        if parts.len() != 2
            || parts[0] != json!({"type":"text","text":parts[0]["text"]})
            || !parts[0]["text"].is_string()
        {
            return Err(denied());
        }
        let image = parts[1]["image_url"]["url"].as_str().ok_or_else(denied)?;
        if parts[1] != json!({"type":"image_url","image_url":{"url":image}})
            || !(image.starts_with("data:image/") || social::target(image).is_ok())
        {
            return Err(denied());
        }
    }
    if let Some(format) = o.get("response_format") {
        if format["type"] != "json_schema"
            || !format["json_schema"].is_object()
            || format.as_object().is_none_or(|o| o.len() != 2)
        {
            return Err(denied());
        }
    }
    Ok(url)
}
fn authorize(redirect: &str, state: &str, verifier: &str) -> Url {
    let mut callback = Url::parse(redirect).unwrap();
    callback.query_pairs_mut().append_pair("state", state);
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    let mut url = Url::parse("https://openrouter.ai/auth").unwrap();
    url.query_pairs_mut().extend_pairs([
        ("callback_url", callback.as_str()),
        ("code_challenge", challenge.as_str()),
        ("code_challenge_method", "S256"),
    ]);
    url
}
#[tauri::command]
pub async fn openrouter_login(app: tauri::AppHandle) -> Result<String, Failure> {
    let _permit = LOGIN.try_acquire().map_err(|_| {
        failure(
            "busy",
            "OpenRouter sign-in is already open in your browser.",
        )
    })?;
    let result = tokio::time::timeout(Duration::from_secs(180), async {
        let (listener, redirect) = social::listener().await?;
        let state = social::random();
        let verifier = social::random();
        app.opener()
            .open_url(
                authorize(&redirect, &state, &verifier).as_str(),
                None::<&str>,
            )
            .map_err(|_| failure("browser", "Could not open the system browser."))?;
        record("openrouter_login", "browser_waiting", None);
        let query = social::callback(listener, "state", &state).await?;
        let p: Vec<_> = url::form_urlencoded::parse(query.as_bytes()).collect();
        if p.iter().any(|(k, _)| k == "error") {
            return Err(failure(
                "authorization",
                "OpenRouter authorization was declined.",
            ));
        }
        let code = p
            .iter()
            .find(|(k, _)| k == "code")
            .map(|(_, v)| v.as_ref())
            .filter(|s| !s.is_empty() && s.len() <= 4096)
            .ok_or_else(|| {
                failure(
                    "authorization",
                    "OpenRouter returned no authorization code.",
                )
            })?;
        let response = social::json_request(
            Url::parse("https://openrouter.ai/api/v1/auth/keys").unwrap(),
            Some(json!({"code":code,"code_verifier":verifier,"code_challenge_method":"S256"})),
        )
        .await?;
        let value = social::value(response)?;
        let key = value["key"]
            .as_str()
            .ok_or_else(|| failure("authorization", "OpenRouter returned no API key."))?;
        connectors::connector_connect(
            connectors::Provider::Openrouter,
            key.into(),
            None,
            None,
            None,
        )
        .await
    })
    .await
    .unwrap_or_else(|_| {
        Err(failure(
            "timeout",
            "OpenRouter sign-in timed out. Try again.",
        ))
    });
    record(
        "openrouter_login",
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
    #[test]
    fn translation_routes_are_fixed_and_bounded() {
        assert!(public_target(
            "https://api.mymemory.translated.net/get?q=Bonjour&langpair=fr%7Cen",
            "GET",
            None
        )
        .is_ok());
        assert!(public_target(
            "https://apertium.org/apy/translate",
            "POST",
            Some("q=Hola&langpair=spa%7Ceng&markUnknown=no")
        )
        .is_ok());
        assert!(public_target("https://apertium.org/apy/listPairs", "GET", None).is_ok());
        for url in [
            "https://api.mymemory.translated.net/set?q=test&langpair=en%7Ces",
            "https://api.mymemory.translated.net/get?q=a&q=b&langpair=en%7Ces",
            "https://api.mymemory.translated.net/get?q=a&langpair=en%7Ces&key=secret",
            "https://127.0.0.1/get?q=a&langpair=en%7Ces",
            "https://apertium.org/apy/listPairs?url=https://evil.example",
        ] {
            assert!(public_target(url, "GET", None).is_err());
        }
        assert!(
            translation_params(&format!("q={}&langpair=ja|en", "界".repeat(167)), true).is_err()
        );
        assert!(translation_params("q=test&langpair=en|es|fr", true).is_err());
    }
    #[test]
    fn models_cannot_be_used_as_an_arbitrary_proxy() {
        assert!(public_target("https://openrouter.ai/api/v1/models?q=test&limit=20&supported_parameters=structured_outputs","GET",None).is_ok());
        assert!(public_target(
            "https://openrouter.ai/api/v1/models?api_key=secret",
            "GET",
            None
        )
        .is_err());
        assert!(public_target("https://openrouter.ai/api/v1/keys", "GET", None).is_err());
    }
    #[test]
    fn inference_refuses_tools_streaming_and_unbounded_cost() {
        let url = "https://openrouter.ai/api/v1/chat/completions";
        let body = json!({"model":"vendor/model","max_tokens":8000,"messages":[{"role":"user","content":"Translate hello"}],"usage":{"include":true}});
        assert!(openrouter_target(url, "POST", Some(&body)).is_ok());
        for field in ["tools", "stream", "provider", "api_key"] {
            let mut b = body.clone();
            b[field] = json!(true);
            assert!(openrouter_target(url, "POST", Some(&b)).is_err());
        }
        let mut b = body.clone();
        b["max_tokens"] = json!(8001);
        assert!(openrouter_target(url, "POST", Some(&b)).is_err());
        assert!(
            openrouter_target("https://openrouter.ai/api/v1/keys", "POST", Some(&body)).is_err()
        );
        assert!(openrouter_target(
            "https://evil.example/api/v1/chat/completions",
            "POST",
            Some(&body)
        )
        .is_err());
        assert!(openrouter_target("https://openrouter.ai/api/v1/key", "GET", None).is_ok());
    }
    #[test]
    fn oauth_binds_state_inside_callback_and_uses_s256() {
        let url = authorize(
            "http://127.0.0.1:1234/callback",
            "expected-state",
            "verifier",
        );
        let p: std::collections::HashMap<_, _> = url.query_pairs().collect();
        assert_eq!(p["code_challenge_method"], "S256");
        assert_eq!(
            p["code_challenge"],
            URL_SAFE_NO_PAD.encode(Sha256::digest(b"verifier"))
        );
        assert_eq!(
            p["callback_url"],
            "http://127.0.0.1:1234/callback?state=expected-state"
        );
        assert!(!url.as_str().contains("verifier"));
        assert!(social::callback_query(
            "/callback?state=wrong&code=secret",
            "state",
            "expected-state"
        )
        .is_none());
    }
}
