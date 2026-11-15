# L1: tap a word

Written for: roadmap sprint L1 (2026-11-10). Status: not run.
Roadmap: `sprint/misskey-and-language-learning-roadmap-2026-11.md`.

## Setup

Settings → Languages: add Japanese to the languages you are **learning**.
Your misskey.design account (or any feed with Japanese posts). For step 9,
OpenRouter connected.

## Steps

### The button

- [ ] 1. A Japanese post shows 📖 beside 🌐. Posts in other languages do not.
- [ ] 2. Remove Japanese from learning languages: 📖 disappears everywhere.
- [ ] 3. Before the first 📖 press, the browser has fetched nothing under
      `dict/` (DevTools → Network). Pressing it loads the panel, and the first
      tap loads `dict/jmdict/manifest.json` and one numbered shard.

### Looking up

- [ ] 4. The panel shows the post's text with dotted-underlined words; it
      does not open the thread when you tap inside it.
- [ ] 5. Tap a plain noun (猫, 今日): reading, meanings, part of speech
      (hover it for the full name).
- [ ] 6. Tap a conjugated verb (食べた, 行きました, 読んでる): the dictionary form
      with what was undone ("食べた is 食べる (past)").
- [ ] 7. Tap punctuation or an emoji: nothing to tap. A word that is not in
      the dictionary says so.
- [ ] 8. Every result ends with "Dictionary: JMdict, Electronic Dictionary
      Research and Development Group, CC BY-SA 4.0" linking to the project.
      "More on jisho.org" opens Jisho on that word.

### AI and the rest

- [ ] 9. With OpenRouter connected: **Explain in this sentence** gives a short
      explanation in your app language. Without it, the button is absent.
- [ ] 10. Keyboard: Tab reaches each word; Enter looks it up.
- [ ] 11. Credits page: a Dictionaries paragraph credits JMdict (EDRDG) and
      CC-CEDICT (MDBG) with their licence.
- [ ] 12. Chinese (after you build CC-CEDICT, see below): add Chinese to
      learning languages; a Chinese post's 📖 looks words up with pinyin.
      Before it is built, the panel says the dictionary is not available yet.

## Owner to-dos

- Monthly: `cd ui && npm run dict:jmdict` (licence condition: keep the data
  current), then commit `ui/public/dict/jmdict/`.
- Chinese: download `cedict_1_0_ts_utf-8_mdbg.txt.gz` by hand from
  https://www.mdbg.net/chinese/dictionary?page=cc-cedict (MDBG forbids
  scripted downloads), then `npm run dict:cedict -- --file <path>`.
