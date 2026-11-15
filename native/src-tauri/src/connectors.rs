//! Credentialed connectors: fixed providers and operations, never a general proxy.
use crate::{
    diagnostics::record,
    public_mastodon::{client_for, failure, Failure, PublicResponse},
    social,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::BTreeMap;
use tokio::sync::{Mutex, Semaphore};
use url::Url;

static ACCOUNTS: Mutex<()> = Mutex::const_new(());
static REQUESTS: Semaphore = Semaphore::const_new(4);
#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Provider {
    Mataroa,
    Raindrop,
    Gist,
    Github,
    Openrouter,
    Dub,
    Shortio,
    Tly,
    Tinyurl,
    Rebrandly,
}
#[derive(Deserialize, Serialize)]
struct Credential {
    provider: Provider,
    token: String,
}
fn denied() -> Failure {
    failure("policy", "This connector operation is not supported.")
}
fn validate_workspace(provider: Provider, workspace: Option<&str>) -> Result<(), Failure> {
    if workspace.is_some_and(|s| {
        provider != Provider::Rebrandly
            || s.is_empty()
            || s.len() > 256
            || !s
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
    }) {
        return Err(denied());
    }
    Ok(())
}
fn numeric(raw: &str) -> bool {
    !raw.is_empty() && raw.bytes().all(|b| b.is_ascii_digit()) && raw.parse::<u64>().is_ok()
}

fn target(
    provider: Provider,
    raw: &str,
    method: &str,
    body: Option<&Value>,
) -> Result<Url, Failure> {
    if !matches!(provider, Provider::Mataroa | Provider::Raindrop) {
        return crate::account_publishing::target(provider, raw, method, body);
    }
    if Url::parse(raw).map_err(|_| denied())?.fragment().is_some() {
        return Err(denied());
    }
    let url = social::target(raw)?;
    let host = match provider {
        Provider::Mataroa => "mataroa.blog",
        Provider::Raindrop => "api.raindrop.io",
        _ => unreachable!(),
    };
    if url.host_str() != Some(host) || raw.len() > 8192 {
        return Err(denied());
    }
    let path = url.path();
    let permitted = match provider {
        Provider::Mataroa => {
            path == "/api/posts/" && matches!(method, "GET" | "POST") && url.query().is_none()
        }
        Provider::Raindrop => match method {
            "GET" => {
                matches!(path, "/rest/v1/user" | "/rest/v1/collections") && url.query().is_none()
                    || path
                        .strip_prefix("/rest/v1/raindrops/")
                        .is_some_and(|id| id.parse::<i64>().is_ok_and(|n| n >= -99))
                        && valid_list_query(&url)
            }
            "POST" => path == "/rest/v1/raindrop" && url.query().is_none(),
            "DELETE" => {
                path.strip_prefix("/rest/v1/raindrop/").is_some_and(numeric)
                    && url.query().is_none()
            }
            _ => false,
        },
        _ => false,
    };
    if !permitted {
        return Err(denied());
    }
    if method == "POST" {
        validate_body(provider, body.ok_or_else(denied)?)?;
    } else if body.is_some() {
        return Err(denied());
    }
    Ok(url)
}
fn valid_list_query(url: &Url) -> bool {
    let mut seen = std::collections::HashSet::new();
    url.query_pairs().all(|(key, value)| {
        seen.insert(key.to_string())
            && match key.as_ref() {
                "page" => value.parse::<u32>().is_ok_and(|n| n <= 100_000),
                "perpage" => value.parse::<u32>().is_ok_and(|n| (1..=50).contains(&n)),
                "search" => value.len() <= 2048,
                _ => false,
            }
    })
}
fn validate_body(provider: Provider, body: &Value) -> Result<(), Failure> {
    let object = body.as_object().ok_or_else(denied)?;
    if body.to_string().len() > 1024 * 1024 {
        return Err(failure(
            "policy",
            "Connector content exceeds the size limit.",
        ));
    }
    let valid = match provider {
        Provider::Mataroa => {
            object
                .keys()
                .all(|k| matches!(k.as_str(), "title" | "body" | "published_at"))
                && object
                    .get("title")
                    .and_then(Value::as_str)
                    .is_some_and(|s| !s.trim().is_empty() && s.len() <= 1000)
                && object.get("body").is_none_or(Value::is_string)
                && object.get("published_at").is_none_or(|v| {
                    v.as_str().is_some_and(|s| {
                        s.len() == 10
                            && s.bytes().enumerate().all(|(i, b)| {
                                if i == 4 || i == 7 {
                                    b == b'-'
                                } else {
                                    b.is_ascii_digit()
                                }
                            })
                    })
                })
        }
        Provider::Raindrop => {
            object.keys().all(|k| {
                matches!(
                    k.as_str(),
                    "link" | "title" | "excerpt" | "pleaseParse" | "collection"
                )
            }) && object
                .get("link")
                .and_then(Value::as_str)
                .is_some_and(|s| crate::feeds::validate_url(s).is_ok())
                && object.get("title").is_none_or(Value::is_string)
                && object.get("excerpt").is_none_or(Value::is_string)
                && object
                    .get("pleaseParse")
                    .is_none_or(|v| v.as_object().is_some_and(|o| o.is_empty()))
                && object.get("collection").is_none_or(|v| {
                    v.as_object()
                        .is_some_and(|o| o.len() == 1 && o.get("$id").is_some_and(Value::is_i64))
                })
        }
        _ => false,
    };
    if valid {
        Ok(())
    } else {
        Err(denied())
    }
}
fn authorize(
    request: reqwest::RequestBuilder,
    host: &str,
    token: &str,
    workspace: Option<&str>,
) -> reqwest::RequestBuilder {
    match host {
        "api.short.io" => request.header("Authorization", token),
        "api.rebrandly.com" => {
            let request = request.header("apikey", token);
            if let Some(workspace) = workspace {
                request.header("workspace", workspace)
            } else {
                request
            }
        }
        "api.github.com" => request
            .bearer_auth(token)
            .header("X-GitHub-Api-Version", "2022-11-28"),
        _ => request.bearer_auth(token),
    }
}
pub(crate) async fn send(
    url: Url,
    method: &str,
    body: Option<Value>,
    token: &str,
    workspace: Option<&str>,
) -> Result<PublicResponse, Failure> {
    let host = url.host_str().unwrap_or("").to_owned();
    let mut request = client_for(&url)
        .await?
        .request(
            reqwest::Method::from_bytes(method.as_bytes()).map_err(|_| denied())?,
            url,
        )
        .header("Accept", "application/json")
        .header("Accept-Encoding", "identity");
    if host == "openrouter.ai" && method == "POST" {
        request = request.timeout(std::time::Duration::from_secs(60));
    }
    request = authorize(request, &host, token, workspace);
    if let Some(body) = body {
        request = request.json(&body);
    }
    let response = request.send().await.map_err(|_| {
        failure(
            "network",
            "Could not reach the connector. See Help > Open logs.",
        )
    })?;
    read_response(response).await
}
pub(crate) async fn read_response(
    mut response: reqwest::Response,
) -> Result<PublicResponse, Failure> {
    let status = response.status().as_u16();
    record("connector_http", "response", Some(status));
    if response.status().is_redirection() {
        return Err(failure(
            "policy",
            "Connector redirects are blocked to protect credentials.",
        ));
    }
    let mut headers = BTreeMap::new();
    if let Some(scopes) = response
        .headers()
        .get("x-oauth-scopes")
        .and_then(|v| v.to_str().ok())
    {
        headers.insert("x-oauth-scopes".into(), scopes.into());
    }
    if let Some(retry) = response
        .headers()
        .get("retry-after")
        .and_then(|v| v.to_str().ok())
    {
        headers.insert("retry-after".into(), retry.into());
    }
    if !(200..300).contains(&status) {
        // Never reflect a provider's token-bearing error page/body into the renderer or logs.
        return Ok(PublicResponse { status, headers, body: json!({"error": "The provider refused this request. Check the connection and try again."}).to_string() });
    }
    if status == 204 {
        return Ok(PublicResponse {
            status,
            headers,
            body: "null".into(),
        });
    }
    if response
        .content_length()
        .is_some_and(|n| n > 4 * 1024 * 1024)
    {
        return Err(failure(
            "response",
            "Connector response exceeded the size limit.",
        ));
    }
    let mime = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    if mime.split(';').next().map(str::trim) != Some("application/json") {
        return Err(failure("response", "The connector did not return JSON."));
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| failure("network", "Connector response was interrupted."))?
    {
        if bytes.len() + chunk.len() > 4 * 1024 * 1024 {
            return Err(failure(
                "response",
                "Connector response exceeded the size limit.",
            ));
        }
        bytes.extend_from_slice(&chunk);
    }
    let body = String::from_utf8(bytes)
        .map_err(|_| failure("response", "Invalid connector response encoding."))?;
    serde_json::from_str::<Value>(&body)
        .map_err(|_| failure("response", "Invalid connector JSON."))?;
    Ok(PublicResponse {
        status,
        headers,
        body,
    })
}
fn bound_credential(handle: &str, provider: Provider) -> Result<Credential, Failure> {
    if !handle.starts_with("native-connector:") {
        return Err(denied());
    }
    let credential: Credential = social::load(handle)?;
    if credential.provider != provider {
        return Err(denied());
    }
    Ok(credential)
}
#[tauri::command]
pub async fn connector_connect(
    provider: Provider,
    token: String,
    handle: Option<String>,
    workspace: Option<String>,
    domain: Option<String>,
) -> Result<String, Failure> {
    let result = async {
        let _guard = ACCOUNTS.lock().await;
        if let Some(handle) = &handle {
            bound_credential(handle, provider)?;
        }
        let _permit = REQUESTS
            .try_acquire()
            .map_err(|_| failure("busy", "Too many connector requests. Try again shortly."))?;
        let token = token.trim();
        if token.is_empty()
            || token.len() > 8192
            || token.chars().any(char::is_control)
            || token.starts_with("native-")
        {
            return Err(failure("policy", "Paste a valid API key or Test token."));
        }
        validate_workspace(provider, workspace.as_deref())?;
        let url = match provider {
            Provider::Mataroa => "https://mataroa.blog/api/posts/",
            Provider::Raindrop => "https://api.raindrop.io/rest/v1/user",
            _ => crate::account_publishing::probe(provider),
        };
        let response = send(
            target(provider, url, "GET", None)?,
            "GET",
            None,
            token,
            workspace.as_deref(),
        )
        .await?;
        if !(200..300).contains(&response.status) {
            return Err(failure(
                "credentials",
                "The provider rejected this credential. Check the API key or Test token.",
            ));
        }
        if provider == Provider::Gist
            && response
                .headers
                .get("x-oauth-scopes")
                .is_some_and(|scopes| !scopes.split(',').any(|s| s.trim() == "gist"))
        {
            return Err(failure(
                "credentials",
                "This GitHub token needs the gist scope.",
            ));
        }
        let value: Value = serde_json::from_str(&response.body)
            .map_err(|_| failure("response", "Invalid connector response."))?;
        let valid = match provider {
            Provider::Mataroa => value["ok"] == true && value["post_list"].is_array(),
            Provider::Raindrop => value["result"] == true && value["user"].is_object(),
            _ => crate::account_publishing::valid_probe(provider, &value),
        };
        if provider == Provider::Shortio
            && !domain.as_ref().is_some_and(|name| {
                value.as_array().is_some_and(|domains| {
                    domains
                        .iter()
                        .any(|d| d["hostname"].as_str() == Some(name.as_str()))
                })
            })
        {
            return Err(failure(
                "policy",
                "The short domain was not found in this Short.io account.",
            ));
        }
        if !valid {
            return Err(failure(
                "credentials",
                "The provider did not confirm this connection.",
            ));
        }
        let handle = handle.unwrap_or_else(|| format!("native-connector:{}", social::random()));
        social::save(
            &handle,
            &Credential {
                provider,
                token: token.into(),
            },
        )?;
        record("connector_connect", "complete", None);
        Ok(handle)
    }
    .await;
    if let Err(error) = &result {
        record("connector_connect", error.kind, None);
    }
    result
}
#[tauri::command]
pub async fn connector_request(
    provider: Provider,
    handle: String,
    url: String,
    method: String,
    body: Option<Value>,
    workspace: Option<String>,
) -> Result<PublicResponse, Failure> {
    let result = async {
        let _permit = REQUESTS
            .try_acquire()
            .map_err(|_| failure("busy", "Too many connector requests. Try again shortly."))?;
        validate_workspace(provider, workspace.as_deref())?;
        let mut url = target(provider, &url, &method, body.as_ref())?;
        let credential = bound_credential(&handle, provider)?;
        if provider == Provider::Shortio && url.path() == "/api/links" {
            let domain = url
                .query_pairs()
                .find(|(k, _)| k == "domain")
                .map(|(_, v)| v.into_owned())
                .ok_or_else(denied)?;
            let response = send(
                Url::parse("https://api.short.io/domains").unwrap(),
                "GET",
                None,
                &credential.token,
                None,
            )
            .await?;
            if response.status != 200 {
                return Ok(response);
            }
            let value: Value = serde_json::from_str(&response.body).map_err(|_| denied())?;
            let id = value
                .as_array()
                .and_then(|domains| {
                    domains
                        .iter()
                        .find(|d| d["hostname"].as_str() == Some(domain.as_str()))
                })
                .and_then(|d| d["id"].as_u64())
                .ok_or_else(|| {
                    failure(
                        "policy",
                        "The short domain was not found in this Short.io account.",
                    )
                })?;
            let pairs: Vec<_> = url
                .query_pairs()
                .filter(|(k, _)| k != "domain")
                .map(|(k, v)| (k.into_owned(), v.into_owned()))
                .collect();
            url.set_query(None);
            url.query_pairs_mut()
                .extend_pairs(pairs)
                .append_pair("domain_id", &id.to_string());
        }
        let body = if provider == Provider::Github && method == "POST" {
            Some(crate::github_reader::graph_body(
                body.as_ref().ok_or_else(denied)?,
            )?)
        } else {
            body
        };
        let body = if provider == Provider::Gist && method == "PATCH" {
            let response = send(url.clone(), "GET", None, &credential.token, None).await?;
            if response.status != 200 {
                return Ok(response);
            }
            let value: Value = serde_json::from_str(&response.body).map_err(|_| denied())?;
            Some(crate::account_publishing::gist_edit(
                &value,
                body.ok_or_else(denied)?,
            )?)
        } else {
            body
        };
        send(url, &method, body, &credential.token, workspace.as_deref()).await
    }
    .await;
    if let Err(error) = &result {
        record("connector_request", error.kind, None);
    }
    result
}
#[tauri::command]
pub async fn connector_forget(handle: String) -> Result<(), Failure> {
    if !handle.starts_with("native-connector:") {
        return Err(denied());
    }
    let _guard = ACCOUNTS.lock().await;
    let result = social::delete_credential(&handle);
    record(
        "connector_forget",
        if result.is_ok() {
            "complete"
        } else {
            "credentials"
        },
        None,
    );
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn provider_headers_are_selected_in_rust_and_never_cross_hosts() {
        for (host, header, value) in [
            ("api.short.io", "authorization", "test-secret"),
            ("api.rebrandly.com", "apikey", "test-secret"),
            ("api.github.com", "authorization", "Bearer test-secret"),
            ("api.dub.co", "authorization", "Bearer test-secret"),
            ("api.t.ly", "authorization", "Bearer test-secret"),
            ("api.tinyurl.com", "authorization", "Bearer test-secret"),
        ] {
            let request = authorize(
                reqwest::Client::new().get(format!("https://{host}/")),
                host,
                "test-secret",
                Some("workspace-1"),
            )
            .build()
            .unwrap();
            assert_eq!(request.headers()[header], value);
            assert_eq!(
                request.headers().contains_key("workspace"),
                host == "api.rebrandly.com"
            );
            assert!(!request.url().as_str().contains("test-secret"));
        }
        assert!(validate_workspace(Provider::Gist, Some("workspace-1")).is_err());
        assert!(validate_workspace(Provider::Rebrandly, Some("bad workspace")).is_err());
    }
    #[test]
    fn routes_are_provider_method_query_and_body_scoped() {
        assert!(target(
            Provider::Mataroa,
            "https://mataroa.blog/api/posts/",
            "GET",
            None
        )
        .is_ok());
        assert!(target(
            Provider::Mataroa,
            "https://mataroa.blog/api/posts/",
            "POST",
            Some(&json!({"title":"Test", "body":"Markdown", "published_at":"2026-11-13"}))
        )
        .is_ok());
        assert!(target(
            Provider::Raindrop,
            "https://api.raindrop.io/rest/v1/raindrops/-1?page=0&perpage=20&search=read",
            "GET",
            None
        )
        .is_ok());
        assert!(target(
            Provider::Raindrop,
            "https://api.raindrop.io/rest/v1/raindrop/42",
            "DELETE",
            None
        )
        .is_ok());
        for url in [
            "https://mataroa.blog.evil.test/api/posts/",
            "http://mataroa.blog/api/posts/",
            "https://127.0.0.1/api/posts/",
            "https://mataroa.blog:444/api/posts/",
            "https://user:key@mataroa.blog/api/posts/",
            "https://mataroa.blog/api/posts/?token=x",
            "https://mataroa.blog/api/posts/#x",
            "https://mataroa.blog/api/comments/",
        ] {
            assert!(
                target(Provider::Mataroa, url, "GET", None).is_err(),
                "{url}"
            );
        }
        for url in [
            "https://api.raindrop.io/rest/v1/raindrop/file",
            "https://api.raindrop.io/rest/v1/raindrops/0?perpage=1000",
            "https://api.raindrop.io/rest/v1/raindrops/0?page=0&page=1",
            "https://api.raindrop.io/rest/v1/raindrops/0?access_token=x",
        ] {
            assert!(
                target(Provider::Raindrop, url, "GET", None).is_err(),
                "{url}"
            );
        }
        assert!(target(
            Provider::Mataroa,
            "https://mataroa.blog/api/posts/",
            "DELETE",
            None
        )
        .is_err());
        assert!(validate_body(
            Provider::Raindrop,
            &json!({"link":"https://example.com", "pleaseParse":{}})
        )
        .is_ok());
        assert!(validate_body(Provider::Raindrop, &json!({"link":"file:///secret"})).is_err());
        assert!(validate_body(
            Provider::Mataroa,
            &json!({"title":"x", "api_key":"smuggled"})
        )
        .is_err());
    }
    #[cfg(target_os = "windows")]
    #[test]
    fn credentials_are_os_backed_provider_bound_and_removable() {
        let handle = format!("native-connector:{}", social::random());
        social::save(
            &handle,
            &Credential {
                provider: Provider::Mataroa,
                token: "test-only-credential".into(),
            },
        )
        .unwrap();
        assert_eq!(
            bound_credential(&handle, Provider::Mataroa).unwrap().token,
            "test-only-credential"
        );
        assert!(bound_credential(&handle, Provider::Raindrop).is_err());
        tokio::runtime::Runtime::new()
            .unwrap()
            .block_on(connector_forget(handle.clone()))
            .unwrap();
        assert!(bound_credential(&handle, Provider::Mataroa).is_err());
    }
    async fn fixture(status: &str, headers: &[&str], body: &str) -> reqwest::Response {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let wire = format!(
            "HTTP/1.1 {status}\r\n{}\r\n\r\n{body}",
            headers.join("\r\n")
        );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut request = [0; 4096];
            socket.read(&mut request).await.unwrap();
            socket.write_all(wire.as_bytes()).await.unwrap();
        });
        reqwest::Client::builder()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .unwrap()
            .get(format!("http://{addr}/test"))
            .send()
            .await
            .unwrap()
    }
    #[test]
    fn actual_http_responses_reject_redirects_html_and_large_bodies_and_redact_errors() {
        tokio::runtime::Runtime::new().unwrap().block_on(async {
            let response = fixture(
                "302 Found",
                &["Location: http://127.0.0.1:9/secret", "Content-Length: 0"],
                "",
            )
            .await;
            assert_eq!(read_response(response).await.err().unwrap().kind, "policy");
            let response = fixture(
                "401 Unauthorized",
                &["Content-Type: text/html", "Content-Length: 12"],
                "secret-token",
            )
            .await;
            let result = read_response(response).await.unwrap();
            assert_eq!(result.status, 401);
            assert!(!result.body.contains("secret-token"));
            let response = fixture(
                "200 OK",
                &["Content-Type: text/html", "Content-Length: 3"],
                "bad",
            )
            .await;
            assert_eq!(
                read_response(response).await.err().unwrap().kind,
                "response"
            );
            let response = fixture(
                "200 OK",
                &["Content-Type: application/json", "Content-Length: 4194305"],
                "",
            )
            .await;
            assert_eq!(
                read_response(response).await.err().unwrap().kind,
                "response"
            );
            let response = fixture(
                "200 OK",
                &["Content-Type: application/json", "Content-Length: 11"],
                r#"{"ok":true}"#,
            )
            .await;
            assert_eq!(
                read_response(response).await.unwrap().body,
                r#"{"ok":true}"#
            );
        });
    }
}
