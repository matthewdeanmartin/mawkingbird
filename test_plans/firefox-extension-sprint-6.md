# Firefox extension, sprint 6: manual test plan (the app uses the bridge)

Spec: `spec/firefox-extension.md`. Needs this round's web changes deployed (or
Options → Canary after a push). Extension 0.5.0. Best tried on a browser profile
with **no CORS proxy configured** (Settings → Connections), so the extension is
the only way to reach blocked sites. About 10 minutes.

## 1. Paste a link on a blocked site

- [ ] RSS → **Paste a link** → a blog whose page CORS blocks (most sites), e.g.
      `https://blog.mozilla.org/`. Continue.
- [ ] It says "Mawkingbird for Firefox can check blog.mozilla.org for feeds if
      you allow it." with **Let Mawkingbird for Firefox read blog.mozilla.org**.
- [ ] Press it: the extension's small window asks. **Allow**: Paste a link
      tries again, finds the feed and subscribes.
- [ ] Try another site and choose **Not now**: "Not allowed. Mawkingbird for
      Firefox won't read <site>."

## 2. The feed keeps working without a proxy

- [ ] The new feed's items appear in RSS and Home.
- [ ] Refresh it from Settings → RSS: it updates (through the extension; the
      CORS proxy usage counter does not move).
- [ ] Extension Options → Sites Mawkingbird may read lists the site.

## 3. Settings → RSS add form

- [ ] Add a blocked feed URL directly: the error comes with **Let Mawkingbird
      for Firefox read <site>**; allowing it adds the feed.

## 4. Articles

- [ ] With a proxy configured, open an article from a site you allowed: it
      expands (read through the extension; the proxy counter does not move).

## 5. Without the extension

- [ ] Disable the add-on and reload: no Allow buttons anywhere; Paste a link
      behaves as before (proxy, or "install Native").
