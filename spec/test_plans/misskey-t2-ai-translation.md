# T2: AI translation under a dollar cap (and T1 fixes)

Written for: roadmap sprint T2 (2026-11-10). Status: not run.
Roadmap: `sprint/misskey-and-language-learning-roadmap-2026-11.md`.

## Setup

- Misskey account on misskey.design (no server translator), OpenRouter
  connected (Settings → Connections → OpenRouter), AI features on.
- Settings → Languages: automatic translation off, MyMemory off, to start.
- Note today's spend at openrouter.ai → Activity, to compare.

## Steps

### Fixes from the owner's report (2026-11-10)

- [ ] 1. Press 🌐 on Japanese notes, including ones mixing a kanji-only line
      (草, 了解) with kana lines: they translate without asking "Translate
      from which language?".
- [ ] 2. A note of only emoji, custom emoji, a link, or @mentions/#tags has no
      🌐 button, and automatic mode never spends a call on it.
- [ ] 3. A very short kanji-only note (e.g. 天気晴朗) translates from Japanese;
      "Change" under it still lets you pick Chinese.

### Automatic translation with AI

- [ ] 4. On Home, accept "Translate as you scroll?" (or, if already answered,
      the "Nothing can translate yet" notice offers **Use AI (OpenRouter), up
      to $0.25 a day**): press it.
- [ ] 5. Scroll: Japanese notes are already translated (or translate within a
      second) as they come into view; translation starts about a screen ahead.
- [ ] 6. Browser devtools → Network: openrouter.ai calls carry several notes
      each (one call per batch of up to 10), not one per note.
- [ ] 7. The help (?) icon under a translation names AI (OpenRouter).

### The dollar cap

- [ ] 8. Settings → Languages → "AI translation (OpenRouter), in dollars" shows
      "Spent today: $0.00x of $0.25". After scrolling, it goes up, and roughly
      matches openrouter.ai Activity.
- [ ] 9. Set the daily limit to 0.01 and keep scrolling: once it is reached, a
      dialog "Today's AI translation budget is used up" appears **once**.
- [ ] 10. **Raise today to $0.02**: AI translation resumes; the standing limit
      in Settings is still 0.01.
- [ ] 11. Reach it again: no second dialog today; AI pauses, free translators
      (if on) keep working.
- [ ] 12. **Not today** on another day: AI stays paused until midnight.
- [ ] 13. Set the limit back to 0.25.

### Pressed translations

- [ ] 14. Pressing 🌐 still translates a single note immediately (not batched)
      and counts against the same dollar limit.

## Known gaps

- No "retranslate with a better model" yet.
- Display names, bios and emoji names are still not translated (T1 follow-up).
- Batches that come back malformed fail silently in automatic mode; pressing 🌐
  on such a note translates it alone.
