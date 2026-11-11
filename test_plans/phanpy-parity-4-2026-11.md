# Phanpy parity 4: bio translation, camera, read aloud, AI alt text

Written for: Phanpy parity items 13, 15, 16 and 17 (2026-11-10). Status: not run.
Spec: `spec/phanpy_parity.md`.

## Setup

A signed-in account, a phone (Android Chrome and, if possible, an iPhone), and
for steps 9–13 OpenRouter connected with AI features on and a model that reads
images (the default Gemma does). Have a profile with a bio in another language.

## Steps

### Translate bio (17)

- [ ] 1. A German (or other) profile shows **Translate bio** under the bio.
      Pressing it shows the bio and its fields translated, with "Translated
      from German by …", below the untouched original. **Hide translation**
      removes it.
- [ ] 2. A very short or mixed bio offers "Translate from …" choices instead.
- [ ] 3. Your own profile shows no Translate bio.

### Camera (13)

- [ ] 4. On a phone, the composer shows 📷 beside 📎. It opens the camera; the
      photo attaches like any other.
- [ ] 5. iPhone: the camera can switch to video. Android: photos only.
- [ ] 6. A desktop browser shows no 📷.

### Read aloud (16)

- [ ] 7. ••• → **Read aloud** on a post speaks it, including "Image: …" for
      described images; links are read as site names. The item becomes
      **Stop reading** and stops it. Starting another post stops the first.
- [ ] 8. A French post is read with a French voice (if one is installed).
      Lightbox → **🔊 Read description** reads the alt text.

### AI alt text (15)

- [ ] 9. Composer: attach a photo; ✨ appears beside the alt field. Press it:
      a description appears with "Written by AI… check it". Edit it: the note
      and ✨ go away.
- [ ] 10. Type your own description first: no ✨ is offered.
- [ ] 11. Choose a text-only model in Settings → OpenRouter and press ✨: a
      clear "can't read images" message, nothing posted.
- [ ] 12. Lightbox on an image without alt text: **✨ Describe with AI** adds a
      caption labelled "AI description (may be wrong)". It is not saved.
- [ ] 13. Turn AI off or disconnect OpenRouter: no ✨ anywhere.
