//! Navigation cancellation alone did not stop the actual socket request in our
//! WebView2 smoke test. Deny external resources before they reach the network.
use tauri::WebviewWindow;
use webview2_com::{
    take_pwstr, ContextMenuRequestedEventHandler,
    Microsoft::Web::WebView2::Win32::{
        ICoreWebView2_11, ICoreWebView2_22, COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL,
        COREWEBVIEW2_WEB_RESOURCE_CONTEXT_DOCUMENT,
        COREWEBVIEW2_WEB_RESOURCE_REQUEST_SOURCE_KINDS_ALL,
    },
    NavigationStartingEventHandler, WebResourceRequestedEventHandler,
};
use windows::core::{w, Interface, PWSTR};

fn allowed_resource(raw: &str) -> bool {
    let Ok(url) = url::Url::parse(raw) else {
        return false;
    };
    if matches!(url.scheme(), "data" | "blob") {
        return true;
    }
    url.scheme() == "http"
        && matches!(
            url.host_str(),
            Some(
                "tauri.localhost"
                    | "ipc.localhost"
                    | "native-image.localhost"
                    | "native-media.localhost"
            )
        )
        && url.port().is_none()
        && url.username().is_empty()
        && url.password().is_none()
}

// Browser-generated Referer is constrained by the document origin: app JavaScript
// cannot impersonate YouTube here. CSP separately denies remote app fetch/scripts.
fn youtube_resource(raw: &str, referer: &str, destination: &str) -> bool {
    let (Ok(url), Ok(parent)) = (url::Url::parse(raw), url::Url::parse(referer)) else {
        return false;
    };
    if url.scheme() != "https"
        || url.port().is_some()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return false;
    }
    let host = url.host_str().unwrap_or_default();
    let player = host == "www.youtube-nocookie.com";
    let embed = url.path().strip_prefix("/embed/").is_some_and(|id| {
        id.len() == 11
            && id
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-')
    });
    if parent.origin().ascii_serialization() == "http://tauri.localhost" {
        return player && embed && destination == "iframe";
    }
    let youtube_parent = parent.scheme() == "https"
        && parent.port().is_none()
        && matches!(
            parent.host_str(),
            Some("www.youtube-nocookie.com" | "www.youtube.com")
        );
    if !youtube_parent
        || matches!(
            destination,
            "document" | "iframe" | "frame" | "object" | "embed"
        )
    {
        return false;
    }
    // Player scripts, thumbnails, media segments and YouTube's player telemetry.
    if matches!(
        host,
        "fonts.gstatic.com" | "www.gstatic.com" | "www.google.com" | "jnn-pa.googleapis.com"
    ) {
        return true;
    }
    [
        "youtube.com",
        "youtube-nocookie.com",
        "ytimg.com",
        "googlevideo.com",
        "ggpht.com",
    ]
    .iter()
    .any(|domain| host == *domain || host.ends_with(&format!(".{domain}")))
}

/// WebView2's default right-click entries that cannot work in this host
/// (parity item 6). Downloads are blocked, so "Save image as" and "Save link
/// as" would fail silently; new windows are denied, so "Open link in new
/// window" would do nothing. Saving goes through the app's own native save
/// action instead. Copy, Copy link, Copy image and Paste stay.
fn removed_menu_item(name: &str) -> bool {
    matches!(name, "saveImageAs" | "saveLinkAs" | "openLinkInNewWindow")
}

// The sole unsafe exception: WebView2 exposes only unsafe COM methods for
// request interception. Do not remove this security boundary to remove unsafe.
#[allow(unsafe_code)]
pub fn install(window: &WebviewWindow) -> tauri::Result<()> {
    // SAFETY: Tauri invokes this closure on the owning WebView UI thread.
    // COM interfaces are owned reference-counted handles; event closures retain
    // their captured environment. Out parameters are initialized and borrowed
    // only for each synchronous call. Successful Uri/GetHeader allocations are
    // consumed once by take_pwstr (CoTaskMemFree); null means no header.
    // No raw pointer or borrowed view escapes the callback.
    window.with_webview(|view| unsafe {
        let webview = view
            .controller()
            .CoreWebView2()
            .expect("WebView2 unavailable");
        let environment = view.environment();
        // Remote frames must never navigate into the privileged local app origin.
        webview
            .add_FrameNavigationStarting(
                &NavigationStartingEventHandler::create(Box::new(move |_, args| {
                    if let Some(args) = args {
                        let mut uri = PWSTR::null();
                        args.Uri(&mut uri)?;
                        let uri = take_pwstr(uri);
                        args.SetCancel(!youtube_resource(
                            &uri,
                            "http://tauri.localhost/",
                            "iframe",
                        ))?;
                    }
                    Ok(())
                })),
                &mut 0,
            )
            .expect("could not enforce frame navigation policy");

        // Trim the default context menu to entries that work here.
        webview
            .cast::<ICoreWebView2_11>()
            .expect("WebView2 runtime needs context menu events")
            .add_ContextMenuRequested(
                &ContextMenuRequestedEventHandler::create(Box::new(move |_, args| {
                    let Some(args) = args else {
                        return Ok(());
                    };
                    let items = args.MenuItems()?;
                    let mut count = 0u32;
                    items.Count(&mut count)?;
                    for index in (0..count).rev() {
                        let item = items.GetValueAtIndex(index)?;
                        let mut name = PWSTR::null();
                        item.Name(&mut name)?;
                        if removed_menu_item(&take_pwstr(name)) {
                            items.RemoveValueAtIndex(index)?;
                        }
                    }
                    Ok(())
                })),
                &mut 0,
            )
            .expect("could not install context menu policy");

        webview
            .cast::<ICoreWebView2_22>()
            .expect("WebView2 runtime needs frame resource filtering")
            .AddWebResourceRequestedFilterWithRequestSourceKinds(
                w!("*"),
                COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL,
                COREWEBVIEW2_WEB_RESOURCE_REQUEST_SOURCE_KINDS_ALL,
            )
            .expect("could not install resource filter");
        webview
            .add_WebResourceRequested(
                &WebResourceRequestedEventHandler::create(Box::new(move |_, args| {
                    let Some(args) = args else {
                        return Ok(());
                    };
                    let request = args.Request()?;
                    let mut uri = PWSTR::null();
                    request.Uri(&mut uri)?;
                    let uri = take_pwstr(uri);
                    let headers = request.Headers()?;
                    let mut referer = PWSTR::null();
                    let mut context = COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL;
                    let _ = headers.GetHeader(w!("Referer"), &mut referer);
                    args.ResourceContext(&mut context)?;
                    let referer = take_pwstr(referer);
                    // WebView2 omits Sec-Fetch-Dest at this event. Use its typed
                    // resource context instead; top-level navigation is separately denied.
                    let destination = if context == COREWEBVIEW2_WEB_RESOURCE_CONTEXT_DOCUMENT {
                        "iframe"
                    } else {
                        "resource"
                    };
                    if !allowed_resource(&uri) && !youtube_resource(&uri, &referer, destination) {
                        let response = environment.CreateWebResourceResponse(
                            None::<&windows::Win32::System::Com::IStream>,
                            403,
                            w!("Blocked by native network policy"),
                            w!("Content-Type: text/plain\r\nCache-Control: no-store"),
                        )?;
                        args.SetResponse(&response)?;
                    }
                    Ok(())
                })),
                &mut 0,
            )
            .expect("could not enforce resource filter");
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn youtube_exception_requires_embed_or_player_origin_and_public_service_host() {
        let embed = "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ";
        assert!(youtube_resource(
            embed,
            "http://tauri.localhost/watch",
            "iframe"
        ));
        assert!(!youtube_resource(embed, "http://tauri.localhost/", "empty"));
        assert!(!youtube_resource(embed, "https://evil.test/", "iframe"));
        assert!(!youtube_resource(
            "https://www.youtube-nocookie.com/watch?v=x",
            "http://tauri.localhost/",
            "iframe"
        ));
        for url in [
            "https://www.youtube.com/s/player/a.js",
            "https://rr1.googlevideo.com/videoplayback",
            "https://i.ytimg.com/a.jpg",
        ] {
            assert!(youtube_resource(url, embed, "empty"));
            assert!(!youtube_resource(url, "http://tauri.localhost/", "empty"));
        }
        for url in [
            "https://127.0.0.1/",
            "https://evil.test/",
            "https://youtube.com.evil.test/",
            "http://www.youtube.com/a",
            "https://www.youtube.com:444/a",
            "https://u:p@www.youtube.com/a",
        ] {
            assert!(!youtube_resource(url, embed, "empty"));
        }
        assert!(!youtube_resource(embed, embed, "iframe"));
    }
    #[test]
    fn context_menu_drops_only_entries_that_cannot_work() {
        for gone in ["saveImageAs", "saveLinkAs", "openLinkInNewWindow"] {
            assert!(removed_menu_item(gone), "{gone}");
        }
        for kept in [
            "copy",
            "paste",
            "copyLinkLocation",
            "copyImage",
            "cut",
            "selectAll",
        ] {
            assert!(!removed_menu_item(kept), "{kept}");
        }
    }
    #[test]
    fn only_bundled_assets_and_ipc_reach_webview_transport() {
        for url in [
            "http://tauri.localhost/index.html",
            "http://ipc.localhost/open_external",
            "http://native-image.localhost/?url=https%3A%2F%2Fexample.com%2Fa.png",
            "data:image/png;base64,AA==",
            "http://native-media.localhost/?url=https%3A%2F%2Fexample.com%2Fa.mp4",
        ] {
            assert!(allowed_resource(url), "{url}");
        }
        for url in [
            "https://mawkingbird.com",
            "http://127.0.0.1/",
            "http://tauri.localhost.evil/",
            "http://tauri.localhost:1234/",
            "file:///tmp/x",
        ] {
            assert!(!allowed_resource(url), "{url}");
        }
    }
}
