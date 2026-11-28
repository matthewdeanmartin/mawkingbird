# Firefox extension, sprint 3: manual test plan

Spec: `spec/firefox-extension.md`. Needs the web changes deployed. Until
production builds again, use **Options → Canary** (canary deploys on every push
to `main`). Reload the add-on in `about:debugging`. About 10 minutes.

## 1. Share and Quote reach the composer (web fix)

- [ ] Popup → **Share this page**: the Home composer opens with the title and
      link. Not Radio's Share music.
- [ ] Select text → **Quote the selection**: the composer has the quote.
- [ ] Radio still works: a playlist's **Share** and a track's Share open Share music.
- [ ] Unbird: a tweet's "post this" link fills the composer.

## 2. Posts about this link (web fix)

- [ ] A link that is not trending (any ordinary article you or others have
      posted): posts appear, under "This link isn't trending on your server, so
      these are posts found by searching for it."
- [ ] A link nobody posted: the not-trending sentence plus **Search posts
      mentioning <site>**, which opens Search for the site's name.
- [ ] The site name under the title has left padding.

## 3. The sidebar is about this page

- [ ] `Alt+Shift+M`: the sidebar shows the site name, Open Mawkingbird, and
      **Write about this page**. No Lite navigation.
- [ ] On a page you have posted about: **You posted about this page** lists it.
- [ ] Below: posts about this page (search results when not trending).
- [ ] **Write about this page** → composer seeded with title and link. Post it:
      "Posted.", and the post appears under You posted about this page.
- [ ] Type something, don't post, switch to another tab: the sidebar follows the
      new page and offers **Continue it / Discard it** for the unsent post.
- [ ] Switch tabs quickly several times: the sidebar settles on the last one
      (it waits about a second rather than reloading for each).
- [ ] Same page with a different `#section`: no reload.
- [ ] On a new tab or `about:` page: "Open a web page to see what people are
      saying about it."

## 4. Popup feedback

- [ ] On a page with no feed: **Feeds** says "This page doesn't list a feed."
      and offers **Look for one on this site**, which opens Paste a link filled
      in (no blink, once the web change is deployed).
