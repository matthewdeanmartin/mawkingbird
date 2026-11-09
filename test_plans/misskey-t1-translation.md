# T1: translate as you go (free engines)

Written for: roadmap sprint T1 (2026-11-09). Status: not run.
Roadmap: `sprint/misskey-and-language-learning-roadmap-2026-11.md`.

## Setup

- Signed in to Mawkingbird with a Misskey account (misskey.design works:
  its admin has DeepL translation on; check by pressing "Translate" on a note
  in Misskey's own web UI first).
- Interface language English. Settings → Languages: automatic translation
  **off**, so the one-time offer appears.
- Optionally MyMemory switched on (Settings → Connections) for the fallback
  steps.

## Steps

### Getting in (the gap found on 2026-11-09)

- [ ] 1. On production, `/login` shows a **Misskey** door (the flag now
      defaults to on).
- [ ] 2. Choose **Mastodon** instead and type `misskey.design`. Instead of
      "Can't reach", a notice says it is a Misskey server, with **Sign in with
      Misskey instead**. The link opens `/login/misskey` with the server filled in.
- [ ] 3. On `/login/misskey`, start typing in the server field: suggestions
      appear (misskey.design, sushi.ski, misskey.art, …).

### The offer on Home

- [ ] 4. Signed in as Misskey, Home shows "Translate as you scroll?" once.
- [ ] 5. Choose **Translate as I scroll**: Japanese notes translate as they
      come into view. Settings → Languages shows automatic translation on
      ("as posts scroll into view") and "translate all foreign posts" on.
- [ ] 6. Reload: the offer does not come back. (To see it again, use a second
      Misskey account, or "No thanks" on another one: it also never returns.)

### Your Misskey server translates first

- [ ] 7. Under a translated note, the line names **Your Misskey server** as
      the engine and the source language (Japanese).
- [ ] 8. A note with a content warning: the translation shows the warning,
      a blank line, then the body (no "-----" rule).
- [ ] 9. A note with only kanji (no kana): it still translates, through your
      Misskey server, without asking which language it is.
- [ ] 10. Settings → Languages → translation engines lists "Misskey (DeepL)"
      with today's count.

### No double spending

- [ ] 11. Note today's Misskey count. Scroll away and back to a translated
      note, reload Home, and open a renote of an already translated note:
      the count does not go up, and the translation shows at once.
- [ ] 12. Settings → Storage → IndexedDB lists "Saved translations".
- [ ] 13. On a translated note, use **Change** and pick a source language:
      it translates again (the saved copy is bypassed on purpose).

### More of each post

- [ ] 14. With your Misskey server's translator unavailable (or on a Mastodon
      post translated by MyMemory or the browser): image descriptions appear
      as 🖼 lines and poll choices as ☐ lines under the translated text.

### Fallback

- [ ] 15. On a Misskey server whose admin has no DeepL key (or temporarily as
      a role without translation), Translate falls through to the browser /
      MyMemory / Apertium, and the server is not asked again this visit.
- [ ] 16. A Mastodon account's posts never go to a Misskey server (check the
      Network tab: no `notes/translate` while signed in with Mastodon).

## Known gaps (T1 follow-up)

- Display names, bios, profile fields and custom-emoji names are not
  translated yet.
- Automatic mode still skips notes whose language the local detector cannot
  decide (kanji-only notes are translated when you press the button).
