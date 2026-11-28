# Firefox extension, sprint 5: manual test plan (the bridge)

Spec: `spec/firefox-extension.md`. The app doesn't use the bridge yet (sprint
6), so this uses the harness page. Reload the add-on (0.5.0). About 10 minutes.

## 0. Also from this round (web, once deployed)

- [ ] Popup → **Share this page**: a dialog with the composer, the cursor at the
      top, the title and link below it. Post → Home. Close unsent → Home's
      composer has the text.
- [ ] A YouTube video: **Posts about this page** lists only posts linking that
      video, then **Search posts mentioning youtube.com** as a separate button.
- [ ] Popup on a YouTube video → Feeds → **Subscribe to this channel** opens
      Watch; its channel panel offers Subscribe (RSS).

## 1. Install asks for nothing new but mawkingbird.com

- [ ] `about:addons` → Mawkingbird → Permissions: mawkingbird.com, with the
      optional "Access your data for all websites" **off**.

## 2. Harness

1. `cd extension && make harness`.
2. Options → **Another address** `http://localhost:4300/` → Save → **Let this
   address use the extension** → allow.
3. Open `http://localhost:4300/dev/harness.html`: "Extension present."

- [ ] **Fetch** the default feed (Mozilla's blog): `needs-access` naming
      `https://blog.mozilla.org`.
- [ ] **Request access**: a small window "Let Mawkingbird read
      blog.mozilla.org?" → **Allow** → `{ granted: true }`.
- [ ] **Fetch** again: `ok: true` with the feed's XML in `body`.
- [ ] Request access for another site, then **Not now** (or close the window):
      `{ granted: false }`.
- [ ] Fetch `http://192.168.1.1/` and `http://localhost:8080/`: `refused`.
- [ ] Options → Sites Mawkingbird may read lists blog.mozilla.org → **Remove** →
      Fetch says `needs-access` again.

## 3. Only Mawkingbird can ask

- [ ] On any other site, `<html>` has no `data-mawkingbird-extension` attribute
      (DevTools → Inspector).
- [ ] Set Options back to mawkingbird.com when done.
