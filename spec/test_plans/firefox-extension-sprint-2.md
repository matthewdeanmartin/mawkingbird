# Firefox extension, sprint 2: manual test plan

Spec: `spec/firefox-extension.md`. Install as in sprint 1
(`test_plans/firefox-extension-sprint-1.md`, step 1). A temporary add-on already
loaded needs **Reload** in `about:debugging`. The new permissions (`activeTab`,
`scripting`) let it read a page only when you click its button. About 10 minutes.

Do sprint 1's step 4 (is the sidebar signed in?) first if you haven't.

## 1. Popup on an ordinary page

On a news article or blog post:

- [ ] Clicking the toolbar button opens a popup (not the sidebar).
- [ ] **Share this page** opens a composer with the title and link in a new tab
      beside the current one; the popup closes.
- [ ] Select a sentence first, then open the popup: **Quote the selection**
      appears and fills the composer with the quoted sentence.
- [ ] **Posts about this page** opens "Posts about a link".
- [ ] **Open the sidebar** opens the sidebar. `Alt+Shift+M` still toggles it.
- [ ] **Open Mawkingbird** opens the app.

## 2. Feeds

- [ ] A blog with a feed (most WordPress sites; e.g. a personal blog): **Feeds**
      lists `Subscribe: <feed name>`. Clicking it opens the RSS page with Paste a
      link open and the feed address filled in. Nothing is subscribed until you
      press Continue.
- [ ] Press Continue: it subscribes and the feed appears in the rail.
- [ ] A page with no feed declared: **Look for a feed on this site** fills Paste
      a link with the page address; Continue finds the feed or says it can't.
- [ ] Right-click a page background → **Subscribe to this site in Mawkingbird**:
      same as Look for a feed.
- [ ] Right-click a link ending in `/feed`, `.xml` or `.rss` → **Subscribe to
      this feed in Mawkingbird**.

## 3. Author on the fediverse

- [ ] An article from a site using Mastodon author attribution (in Mastodon, its
      link preview shows "More from <author>") shows **Author on the fediverse**
      with `@user@host`.
- [ ] A personal site with a `rel="me"` link to Mastodon in its header or footer
      shows that account.
- [ ] Clicking it opens that profile in Mawkingbird; the Follow button is
      there. Nothing is followed until you press it.

## 4. Mastodon and protected pages

- [ ] On a Mastodon post page, the popup offers **Open in Mawkingbird**.
- [ ] On `about:addons` or a new tab: the popup says to open a web page and
      shows only Open the sidebar / Open Mawkingbird.
- [ ] On `addons.mozilla.org`: the popup says Firefox doesn't let add-ons read
      the page; Share and Posts about this page still work.

## 5. Settings still apply

- [ ] Options → **Test**: popup actions open `mawkingbird.com/test/…`. Switch back.
