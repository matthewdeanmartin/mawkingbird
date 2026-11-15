#![deny(unsafe_code)]

use tauri::{webview::NewWindowResponse, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_opener::OpenerExt;
use url::Url;
mod account_publishing;
mod articles;
mod bluesky;
mod connectors;
mod diagnostics;
mod feed_encoding;
mod feeds;
mod github_reader;
mod hugo;
mod images;
mod intelligence;
mod mastodon_login;
mod media;
mod misskey;
mod public_mastodon;
mod publishing;
mod social;
mod twitter;
mod webmentions;

#[cfg(target_os = "windows")]
mod windows_network;

fn is_app_url(url: &Url) -> bool {
    let expected = if cfg!(any(target_os = "windows", target_os = "android")) {
        "http://tauri.localhost"
    } else {
        "tauri://localhost"
    };
    url.scheme() == Url::parse(expected).unwrap().scheme()
        && url.host_str() == Url::parse(expected).unwrap().host_str()
        && url.username().is_empty()
        && url.password().is_none()
        && url.port().is_none()
}

fn external_url(raw: &str) -> Result<Url, String> {
    if raw.len() > 8192 || raw.chars().any(char::is_control) {
        return Err("Invalid browser URL".into());
    }
    let url = Url::parse(raw).map_err(|_| "Invalid browser URL")?;
    if !matches!(url.scheme(), "https" | "http")
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.host_str() == Some("tauri.localhost")
        || url.host_str() == Some("ipc.localhost")
        || url.host_str() == Some("native-image.localhost")
        || url.host_str() == Some("native-media.localhost")
    {
        return Err("Only external HTTP(S) browser links are supported".into());
    }
    Ok(url)
}

#[tauri::command]
fn open_external(app: tauri::AppHandle, url: String) -> Result<(), String> {
    let target = external_url(&url)?;
    app.opener()
        .open_url(target.as_str(), None::<&str>)
        .map_err(|_| "Could not open the system browser".into())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .register_asynchronous_uri_scheme_protocol(
            "native-image",
            |_context, request, responder| {
                tauri::async_runtime::spawn(async move {
                    responder.respond(images::respond(request).await);
                });
            },
        )
        .register_asynchronous_uri_scheme_protocol(
            "native-media",
            |_context, request, responder| {
                tauri::async_runtime::spawn(async move {
                    responder.respond(media::respond(request).await);
                });
            },
        )
        .plugin(
            tauri_plugin_opener::Builder::new()
                .open_js_links_on_click(false)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            open_external,
            bluesky::bluesky_login,
            bluesky::bluesky_request,
            misskey::misskey_login,
            misskey::misskey_request,
            misskey::misskey_nodeinfo,
            social::forget_social_account,
            intelligence::intelligence_public_request,
            intelligence::openrouter_login,
            hugo::hugo_connect,
            hugo::hugo_request,
            hugo::hugo_forget,
            connectors::connector_connect,
            connectors::connector_request,
            connectors::connector_forget,
            publishing::shorten_link,
            publishing::rentry_request,
            twitter::twitter_connect,
            twitter::twitter_request,
            twitter::twitter_forget,
            webmentions::webmention_discover,
            webmentions::webmention_send,
            public_mastodon::public_mastodon_get,
            feeds::public_feed_get,
            articles::public_article_get,
            diagnostics::open_logs,
            diagnostics::report_native_event,
            mastodon_login::mastodon_login,
            mastodon_login::mastodon_account_get,
            mastodon_login::mastodon_favourite,
            mastodon_login::forget_mastodon_account
        ])
        .setup(|app| {
            diagnostics::init(app.handle())?;
            #[cfg(desktop)]
            {
                let help = tauri::menu::SubmenuBuilder::new(app, "Help")
                    .text("open_logs", "Open logs")
                    .build()?;
                let menu = tauri::menu::MenuBuilder::new(app).item(&help).build()?;
                app.set_menu(menu)?;
                app.on_menu_event(|app, event| {
                    if event.id().as_ref() == "open_logs" {
                        let _ = diagnostics::open_logs(app.clone());
                    }
                });
            }
            let smoke_test =
                cfg!(debug_assertions) && std::env::args().any(|arg| arg == "--smoke-test");
            let mut window =
                WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                    .title("Mawkingbird Native — development")
                    .visible(!smoke_test)
                    .inner_size(1200.0, 800.0)
                    .initialization_script(include_str!("links.js"))
                    .initialization_script(include_str!("diagnostics.js"))
                    .initialization_script(include_str!("images.js"))
                    .initialization_script(include_str!("media.js"))
                    .on_navigation(is_app_url)
                    .on_new_window(|_, _| NewWindowResponse::Deny)
                    .on_download(|_, _| false);
            if smoke_test {
                let profile = std::env::var_os("MAWKINGBIRD_SMOKE_PROFILE")
                    .expect("smoke tests require a dedicated temporary profile");
                window = window.data_directory(profile.into());
            }
            let _window = window.build()?;
            #[cfg(target_os = "windows")]
            windows_network::install(&_window)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("native host failed");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_non_browser_and_credential_urls() {
        for value in [
            "javascript:alert(1)",
            "file:///etc/passwd",
            "data:text/html,hi",
            "mailto:a@example.com",
            "https://a:b@example.com",
            "https://tauri.localhost/",
            "http://ipc.localhost/",
            "http://native-image.localhost/",
            "https://example.com/\n",
        ] {
            assert!(external_url(value).is_err(), "{value}");
        }
        assert!(external_url("https://example.com/article?q=1#section").is_ok());
    }

    #[test]
    fn only_exact_app_origin_navigates() {
        let app = if cfg!(any(target_os = "windows", target_os = "android")) {
            "http://tauri.localhost/settings"
        } else {
            "tauri://localhost/settings"
        };
        assert!(is_app_url(&Url::parse(app).unwrap()));
        for value in [
            "https://example.com",
            "http://localhost/",
            "http://tauri.localhost.evil/",
            "http://tauri.localhost:1234/",
            "tauri://evil/",
            "file:///index.html",
        ] {
            assert!(!is_app_url(&Url::parse(value).unwrap()), "{value}");
        }
    }
}
