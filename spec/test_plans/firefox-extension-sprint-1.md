# Firefox extension, sprint 1: manual test plan

Spec: `spec/firefox-extension.md`. Code: `extension/`. About 15 minutes, on
desktop Firefox 140 or newer, with a real Mastodon account signed in to
mawkingbird.com in a normal tab.

## 1. Install it (no store)

Pick one.

**A. Temporary (quickest, any Firefox).** Gone when Firefox restarts.

1. Open `about:debugging#/runtime/this-firefox`.
2. **Load Temporary Add-on…** → choose `C:\github\mimb\mawkingbird\extension\src\manifest.json`.
3. After editing a file, press **Reload** on the same card.

**B. Throwaway profile (for development).** `cd extension && make install && make run`.
A fresh Firefox profile opens with the extension; edits reload automatically.
You are signed out of everything in that profile, so the sign-in check (step 4)
is not meaningful there.

**C. Stays installed in your everyday Firefox.** Release Firefox only installs
add-ons Mozilla has signed, but signing does not require a public listing:

1. Create an addons.mozilla.org account → Developer Hub → **Manage API Keys**.
2. In Git Bash: `export WEB_EXT_API_KEY=… WEB_EXT_API_SECRET=…`, then
   `cd extension && make sign`. Mozilla signs it as **unlisted** (automated
   review, usually minutes).
3. Open the `.xpi` it prints (`<OS temp>/mawkingbird/extension/`) in Firefox,
   or drag it onto a window → **Add**. Bump `version` in `src/manifest.json`
   before each re-sign.

**D. Unsigned, persistent (Developer Edition, Nightly or ESR only).** Set
`xpinstall.signatures.required` to `false` in `about:config`, `make build`,
rename the `.zip` to `.xpi`, then `about:addons` → gear → **Install Add-on From
File…**. Release Firefox ignores that setting.

## 2. Toolbar and sidebar

- [ ] The Mawkingbird button is in the toolbar (or the puzzle-piece menu; pin it).
- [ ] Clicking it opens the sidebar; clicking again closes it. (From 0.2.0 it
      opens a popup instead; use the popup's **Open the sidebar**.)
- [ ] `Alt+Shift+M` does the same. (`about:addons` → gear → Manage Extension
      Shortcuts if it clashes.)
- [ ] The sidebar shows Mawkingbird Lite.

## 3. Sidebar strip

- [ ] On a news article, **Share this page** loads a composer with the page's
      title and link (it is the full app's Home, by design for now).
- [ ] Nothing is posted until you press Post.
- [ ] **Posts about it** loads "Posts about a link" (often empty: Mastodon only
      knows links trending on your server).
- [ ] On `about:addons` or a new tab, both buttons are disabled and the strip
      says "Open a web page to share it."
- [ ] **Open in a tab** opens mawkingbird.com.

## 4. Spike: is the sidebar signed in?

The result decides sprint 2. Record it in `spec/firefox-extension.md`.

- [ ] With a signed-in mawkingbird.com tab open, does the sidebar's Lite show
      your Home feed (**shared**) or a signed-out page (**partitioned**)?
- [ ] If partitioned: sign in inside the sidebar. Restart Firefox. Still signed in?
- [ ] Post one test post from the sidebar, then delete it.
- [ ] Any blank sidebar or "refused to connect" message (**refused to frame**)?

## 5. Right-click menus

- [ ] Any page, right-click background → **Share this page in Mawkingbird**:
      new tab beside it, composer filled with title + link.
- [ ] Select a sentence → **Quote "…" in Mawkingbird**: composer has the title,
      the quoted sentence and the link.
- [ ] On a Mastodon post page (e.g. `https://mastodon.social/@Gargron/…`), the
      page menu has **Open in Mawkingbird** → the same post in Mawkingbird.
- [ ] On a Mastodon profile page → that profile in Mawkingbird.
- [ ] Right-click a link to a Mastodon post (in any page) → **Open link in
      Mawkingbird** → the post.
- [ ] Same for a `bsky.app/profile/…/post/…` link and a `twitter.com/…/status/…`
      link.
- [ ] Any other link → **Posts about this link** only (no Open link item).

## 6. Options

- [ ] `about:addons` → Mawkingbird → Preferences: choose **Test**, Save. The
      sidebar reloads on `mawkingbird.com/test/m/`; menus now open `/test/…`.
- [ ] **Another address** `http://example.com` is refused with a message;
      `http://localhost:4200` is accepted.
- [ ] Switch back to mawkingbird.com.

## Not covered yet

Feeds on the page, author follow, the toolbar popup (sprint 2); the bridge
(sprint 3).
