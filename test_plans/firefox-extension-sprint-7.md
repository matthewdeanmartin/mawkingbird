# Firefox extension, sprint 7: manual test plan (reading everywhere)

Spec: `spec/firefox-extension.md`. Extension 0.6.0 (reload it in
`about:debugging`). Needs the sprint 7–8 web changes deployed (Canary after a
push). Use a profile with **no CORS proxy** for sections 1–3.

## 1. Reader

- [ ] Open a post linking an article on a site you haven't allowed; expand it.
      "Mawkingbird for Firefox can read <site> for you if you allow it." with
      **Let Mawkingbird for Firefox read <site>**.
- [ ] Allow: the article appears. The free-quota counter doesn't move (Settings
      → Plus, or the reader's remaining count).
- [ ] Another article from the same site expands straight away.

## 2. RSS page

- [ ] Subscribe (via Paste a link with a proxy, or an old subscription) to a
      feed whose site isn't allowed, then remove the proxy. The "couldn't load"
      notice lists the site with an Allow button.
- [ ] Allow: the feed's items load without a page reload.
- [ ] With two or more blocked sites, **Let Mawkingbird for Firefox read any
      public site** appears too.

## 3. Friends' blogs

- [ ] RSS → friends' blogs: with "any public site" off it offers the switch.
- [ ] Turn it on (window: "Let Mawkingbird read any public site?"); the scan
      runs and finds feeds without a proxy.
- [ ] Extension Options shows the switch on; turning it off makes the scan ask
      again.

## 4. Settings → App

- [ ] A **Mawkingbird for Firefox** row says it's installed (and "It may read
      any public site." when on). Disable the add-on: the row is gone.

## 5. Sidebar privacy

- [ ] With the sidebar open, the panel's address (right-click in the panel →
      This Frame → Show Frame Info, or DevTools) is `…/panel#url=…`, not `?url=`.
- [ ] Switching tabs still updates the panel to the new page.
