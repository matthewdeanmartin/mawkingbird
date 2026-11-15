# Install app and share into Mawkingbird

Written for: Phanpy parity item 11 and the install entry points (2026-11-10). Status: not run.
Spec: `spec/phanpy_parity.md`.

## Setup

An Android phone with Chrome, a Windows or ChromeOS computer with Chrome or
Edge, and an iPhone if available. Test on canary first (`/canary/`): its
manifest resolves relative to `/canary/`, so it installs as its own app.

## Steps

- [ ] 1. Chrome/Edge (desktop): the address bar shows the install icon, but no
      install banner pops up by itself.
- [ ] 2. Footer: "Install the app" is the last row. It opens Settings → Install
      app, which shows the one-line benefit and an **Install Mawkingbird**
      button. Install: the app opens in its own window, named Mawkingbird, with
      the app icon.
- [ ] 3. In the installed app, the footer link is gone and Settings → Install
      app says you're using it as an app.
- [ ] 4. Android: install the same way. In Chrome, share a web page → pick
      Mawkingbird: Home opens with a new unsent post containing the page title
      and link once each. Nothing is posted until you press Post.
- [ ] 5. Share plain text from a notes app: the text alone fills the post.
- [ ] 6. Press Back after a share: you do not land on a blank /share page.
- [ ] 7. Share a photo from the gallery: Mawkingbird is not offered (files are
      out of scope).
- [ ] 8. iPhone Safari: Settings → Install app explains Share → Add to Home
      Screen; the installed icon opens Mawkingbird. (No share target on iOS.)
- [ ] 9. Firefox desktop: Settings → Install app shows the manual explanation,
      no button.
- [ ] 10. Canary installs as a separate app from production, and each opens its
      own copy (start URL `/canary/` vs `/`).
