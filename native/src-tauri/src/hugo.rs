//! A Hugo credential is bound to one repository, branch and Markdown folder.
use crate::{
    connectors::send,
    diagnostics::record,
    public_mastodon::{failure, Failure, PublicResponse},
    social,
};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::sync::{Mutex, Semaphore};
use url::Url;
static ACCOUNTS: Mutex<()> = Mutex::const_new(());
static REQUESTS: Semaphore = Semaphore::const_new(4);
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Repo {
    owner: String,
    repo: String,
    branch: String,
    content_path: String,
}
#[derive(Deserialize, Serialize)]
struct Credential {
    token: String,
    repo: Repo,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Connected {
    handle: String,
    looks_like_hugo: bool,
    post_count: usize,
}
fn denied() -> Failure {
    failure(
        "policy",
        "This operation is outside the connected Hugo repository, branch or post folder.",
    )
}
fn name(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 100
        && s != "."
        && s != ".."
        && s.bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.'))
}
fn path_ok(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 1024
        && s.split('/').all(|p| {
            !p.is_empty()
                && p != "."
                && p != ".."
                && !p.starts_with('.')
                && !p.chars().any(|c| c.is_control() || c == char::from(92))
        })
}
fn validate_repo(r: &Repo) -> Result<(), Failure> {
    if !name(&r.owner) || !name(&r.repo) || !path_ok(&r.branch) || !path_ok(&r.content_path) {
        return Err(denied());
    }
    Ok(())
}
fn base(r: &Repo) -> String {
    format!("https://api.github.com/repos/{}/{}/", r.owner, r.repo)
}
fn endpoint(r: &Repo, kind: &str, path: &str) -> Url {
    let mut url = Url::parse(&base(r)).unwrap();
    {
        let mut seg = url.path_segments_mut().unwrap();
        seg.pop_if_empty().push(kind);
        for p in path.split('/') {
            seg.push(p);
        }
    }
    url
}
fn content_url(r: &Repo, path: &str) -> Url {
    let mut url = endpoint(r, "contents", path);
    url.query_pairs_mut().append_pair("ref", &r.branch);
    url
}
fn decode(s: &str) -> Result<String, Failure> {
    let query = format!("v={}", s.replace('+', "%2B"));
    let value = url::form_urlencoded::parse(query.as_bytes())
        .next()
        .ok_or_else(denied)?
        .1
        .into_owned();
    if value.contains(char::REPLACEMENT_CHARACTER) {
        return Err(denied());
    }
    Ok(value)
}
fn target(r: &Repo, raw: &str, method: &str, body: Option<&Value>) -> Result<Url, Failure> {
    validate_repo(r)?;
    let url = social::target(raw)?;
    if raw.len() > 8192
        || !raw.starts_with(&base(r))
        || url.host_str() != Some("api.github.com")
        || Url::parse(raw).map_err(|_| denied())?.fragment().is_some()
    {
        return Err(denied());
    }
    let prefix = format!("/repos/{}/{}/", r.owner, r.repo);
    let tail = url.path().strip_prefix(&prefix).ok_or_else(denied)?;
    let pairs: Vec<_> = url.query_pairs().collect();
    if method == "GET"
        && tail == "actions/runs"
        && body.is_none()
        && pairs.len() == 2
        && pairs
            .iter()
            .any(|(k, v)| k == "branch" && v == r.branch.as_str())
        && pairs.iter().any(|(k, v)| k == "per_page" && v == "10")
    {
        return Ok(url);
    }
    let path = decode(tail.strip_prefix("contents/").ok_or_else(denied)?)?;
    let beneath = path == r.content_path || path.starts_with(&(r.content_path.clone() + "/"));
    if !path_ok(&path) || !beneath {
        return Err(denied());
    }
    if method == "GET"
        && body.is_none()
        && pairs.len() == 1
        && pairs[0].0 == "ref"
        && pairs[0].1 == r.branch.as_str()
    {
        return Ok(url);
    }
    if method != "PUT"
        || url.query().is_some()
        || !(path.ends_with(".md") || path.ends_with(".markdown"))
    {
        return Err(denied());
    }
    let value = body.ok_or_else(denied)?;
    let o = value.as_object().ok_or_else(denied)?;
    if !o
        .keys()
        .all(|k| matches!(k.as_str(), "message" | "content" | "branch" | "sha"))
        || value["branch"].as_str() != Some(&r.branch)
        || !value["message"]
            .as_str()
            .is_some_and(|s| !s.trim().is_empty() && s.len() <= 4096)
        || o.get("sha").is_some_and(|v| {
            !v.as_str()
                .is_some_and(|s| s.len() == 40 && s.bytes().all(|b| b.is_ascii_hexdigit()))
        })
    {
        return Err(denied());
    }
    let content = value["content"].as_str().ok_or_else(denied)?;
    if content.len() > 2 * 1024 * 1024 {
        return Err(denied());
    }
    let bytes = STANDARD.decode(content).map_err(|_| denied())?;
    if bytes.len() > 1024 * 1024 || String::from_utf8(bytes).is_err() {
        return Err(denied());
    }
    Ok(url)
}
fn credential(handle: &str) -> Result<Credential, Failure> {
    if !handle.starts_with("native-hugo:") {
        return Err(denied());
    }
    social::load(handle)
}
#[tauri::command]
pub async fn hugo_connect(
    token: String,
    repo: Repo,
    handle: Option<String>,
) -> Result<Connected, Failure> {
    let result=async{
 let _lock=ACCOUNTS.lock().await;validate_repo(&repo)?;
 let token=token.trim();if token.is_empty()||token.len()>8192||token.chars().any(char::is_control)||token.starts_with("native-"){return Err(failure("policy","Paste a valid GitHub token."));}
 if let Some(handle)=&handle {credential(handle)?;}
 let mut branch=endpoint(&repo,"branches","");branch.path_segments_mut().unwrap().pop_if_empty().push(&repo.branch);
 let response=send(branch,"GET",None,token,None).await?;
 if response.status!=200{return Err(failure("credentials","GitHub could not read that repository and branch. Check the token and branch name."));}
 let response=send(content_url(&repo,&repo.content_path),"GET",None,token,None).await?;
 if response.status!=200{return Err(failure("credentials","GitHub could not read the post folder. Check the folder path and token access."));}
 let value:Value=serde_json::from_str(&response.body).map_err(|_|denied())?;
 let entries=value.as_array().ok_or_else(||failure("policy","The post path must be a folder."))?;
 let post_count=entries.iter().filter(|e|e["type"]=="file" && e["name"].as_str().is_some_and(|s|s.ends_with(".md")||s.ends_with(".markdown"))).count();
 let root=send(content_url(&repo,""),"GET",None,token,None).await;
 let looks_like_hugo=root.ok().filter(|r|r.status==200).and_then(|r|serde_json::from_str::<Value>(&r.body).ok()).and_then(|v|v.as_array().cloned()).is_some_and(|list|list.iter().any(|e|matches!(e["name"].as_str(),Some("hugo.toml"|"hugo.yaml"|"hugo.yml"|"hugo.json"|"config.toml"|"config.yaml"|"config.yml"|"config.json"|"config"))));
 let handle=handle.unwrap_or_else(||format!("native-hugo:{}",social::random()));
 social::save(&handle,&Credential{token:token.into(),repo})?;
 Ok(Connected{handle,looks_like_hugo,post_count})
 }.await;
    record(
        "hugo_connect",
        result
            .as_ref()
            .map(|_| "complete")
            .unwrap_or_else(|e| e.kind),
        None,
    );
    result
}
#[tauri::command]
pub async fn hugo_request(
    handle: String,
    url: String,
    method: String,
    body: Option<Value>,
) -> Result<PublicResponse, Failure> {
    let result = async {
        let _permit = REQUESTS
            .try_acquire()
            .map_err(|_| failure("busy", "Too many Hugo requests."))?;
        let c = credential(&handle)?;
        let url = target(&c.repo, &url, &method, body.as_ref())?;
        send(url, &method, body, &c.token, None).await
    }
    .await;
    record(
        "hugo_request",
        result
            .as_ref()
            .map(|_| "complete")
            .unwrap_or_else(|e| e.kind),
        None,
    );
    result
}
#[tauri::command]
pub async fn hugo_forget(handle: String) -> Result<(), Failure> {
    let _lock = ACCOUNTS.lock().await;
    if !handle.starts_with("native-hugo:") {
        return Err(denied());
    }
    let result = social::delete_credential(&handle);
    record(
        "hugo_forget",
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
    use serde_json::json;
    fn repo() -> Repo {
        Repo {
            owner: "writer".into(),
            repo: "blog".into(),
            branch: "main".into(),
            content_path: "content/posts".into(),
        }
    }
    #[test]
    fn scopes_reads_writes_and_build_status_to_saved_coordinates() {
        let r = repo();
        let good = "https://api.github.com/repos/writer/blog/contents/content/posts/hello.md";
        let body =
            json!({"message":"Publish","content":STANDARD.encode("# Hello 世界"),"branch":"main"});
        assert!(target(&r, good, "PUT", Some(&body)).is_ok());
        assert!(target(&r, &format!("{good}?ref=main"), "GET", None).is_ok());
        assert!(target(
            &r,
            "https://api.github.com/repos/writer/blog/actions/runs?branch=main&per_page=10",
            "GET",
            None
        )
        .is_ok());
        for bad in [
            good.replace("writer/blog", "other/blog"),
            good.replace("content/posts", ".github/workflows"),
            good.replace("hello.md", "image.png"),
            good.replace("hello.md", "%2e%2e%2fsecret.md"),
            format!("{good}?ref=main"),
            good.replace("https:", "http:"),
        ] {
            assert!(target(&r, &bad, "PUT", Some(&body)).is_err(), "{bad}");
        }
        let mut wrong = body.clone();
        wrong["branch"] = json!("other");
        assert!(target(&r, good, "PUT", Some(&wrong)).is_err());
        wrong = body.clone();
        wrong["committer"] = json!({"name":"spoof"});
        assert!(target(&r, good, "PUT", Some(&wrong)).is_err());
        assert!(target(&r, good, "DELETE", None).is_err());
        assert!(target(&r, &format!("{good}?ref=main&ref=other"), "GET", None).is_err());
    }
    #[test]
    fn branch_and_unicode_paths_encode_without_changing_repository() {
        let mut r = repo();
        r.branch = "blog/main".into();
        assert!(content_url(&r, "content/posts/hello world.md")
            .as_str()
            .contains("hello%20world.md?ref=blog%2Fmain"));
    }
    #[cfg(target_os = "windows")]
    #[test]
    fn os_credential_keeps_repo_binding_separate_from_other_connectors() {
        let handle = format!("native-hugo:{}", social::random());
        social::save(
            &handle,
            &Credential {
                token: "test-secret".into(),
                repo: repo(),
            },
        )
        .unwrap();
        assert_eq!(credential(&handle).unwrap().repo, repo());
        assert!(credential(&handle.replace("native-hugo", "native-connector")).is_err());
        social::delete_credential(&handle).unwrap();
        assert!(credential(&handle).is_err());
    }
}
