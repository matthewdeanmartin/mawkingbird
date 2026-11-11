/**
 * The productivity objects a post-shaped thing can be.
 *
 * Deliberately open in spirit: PKM is its own, much larger epic (a workflow
 * manager wired to the scheduler, a calendar, posts, links and bookmarks), and
 * this module is only the slice of it that touches writing. Adding a fourth
 * kind later must be a vocabulary entry and a chip, not a schema change — so
 * nothing here switches exhaustively over `PkmKind` where a lookup will do.
 */
export type PkmKind = 'note' | 'todo' | 'cal';

/** Stable display order, so two lists never disagree about which comes first. */
export const PKM_KINDS: readonly PkmKind[] = ['todo', 'note', 'cal'];

/**
 * The words that mean each kind, lowercased and without the leading `#`.
 *
 * Configurable because `#TODO` is English. Someone writing in German wants
 * `#AUFGABE`, and a hardcoded word makes the whole feature useless to them —
 * which is why this is a set of words per kind rather than three constants.
 */
export interface PkmVocabulary {
  note: string[];
  todo: string[];
  cal: string[];
}

export const DEFAULT_PKM_VOCABULARY: PkmVocabulary = {
  note: ['note'],
  todo: ['todo'],
  cal: ['cal', 'calendar'],
};

/**
 * Hashtags in a body, lowercased and without the sigil.
 *
 * The character class matches the ones already used across the app
 * (`bookmark-groups.ts`, `feed-metrics.ts`, `compose.ts`): Unicode letters,
 * numbers and underscore, which is what Mastodon itself linkifies.
 */
export function extractTags(text: string): string[] {
  const tags: string[] = [];
  for (const match of text.matchAll(/#([\p{L}\p{N}_]+)/gu)) {
    tags.push(match[1].toLowerCase());
  }
  return tags;
}

/**
 * Normalize one configured word: no `#`, no whitespace, lowercase.
 *
 * Matches {@link normalizeTag} in `lists/tag-bundles.ts` — someone typing
 * `#TODO` into the settings box means the same thing as typing `todo`.
 */
export function normalizePkmWord(raw: string): string {
  return raw.trim().replace(/^#+/, '').replace(/\s+/g, '').toLowerCase();
}

/**
 * Read a comma-separated settings field into a clean word list.
 *
 * An empty result is meaningful and is preserved: it means the user turned that
 * kind off, which is a legitimate choice. Callers must not "helpfully" restore
 * the default — see {@link PkmVocabulary}.
 */
export function parseVocabularyField(raw: string): string[] {
  const seen = new Set<string>();
  for (const part of raw.split(',')) {
    const word = normalizePkmWord(part);
    if (word) {
      seen.add(word);
    }
  }
  return [...seen];
}

/** Render a word list back into the comma-separated settings field. */
export function formatVocabularyField(words: readonly string[]): string {
  return words.join(', ');
}

/** Clean a whole vocabulary, from settings input or from storage. */
export function normalizeVocabulary(
  vocab: Partial<PkmVocabulary> | null | undefined,
): PkmVocabulary {
  return {
    note: cleanWords(vocab?.note),
    todo: cleanWords(vocab?.todo),
    cal: cleanWords(vocab?.cal),
  };
}

function cleanWords(words: unknown): string[] {
  if (!Array.isArray(words)) {
    return [];
  }
  const seen = new Set<string>();
  for (const word of words) {
    if (typeof word === 'string') {
      const clean = normalizePkmWord(word);
      if (clean) {
        seen.add(clean);
      }
    }
  }
  return [...seen];
}

/**
 * Which PKM kinds a body carries, in {@link PKM_KINDS} order.
 *
 * Matching rules, fixed here so nothing downstream re-decides them:
 *
 * - **Case-insensitive.** Mastodon treats hashtags that way, so `#todo`,
 *   `#TODO` and `#ToDo` are one tag.
 * - **Whole-tag only.** `#todos` is not `#todo` and `#notebook` is not `#note`.
 *   Substring matching would quietly file half of someone's posts as notes.
 * - **Several kinds at once.** A post tagged `#NOTE #TODO` is both, and appears
 *   under both filters. Returning a list rather than a single kind is what makes
 *   that possible without a precedence rule nobody would remember.
 * - **An empty word list disables its kind**, rather than falling back to the
 *   default. The user turned it off on purpose.
 */
export function pkmKinds(text: string, vocab: PkmVocabulary): PkmKind[] {
  const tags = new Set(extractTags(text));
  if (!tags.size) {
    return [];
  }
  return PKM_KINDS.filter((kind) => vocab[kind]?.some((word) => tags.has(word)));
}

/** Whether a body carries any PKM tag at all. */
export function isPkm(text: string, vocab: PkmVocabulary): boolean {
  return pkmKinds(text, vocab).length > 0;
}

/**
 * The tag to append when creating an item of this kind.
 *
 * The user's *first* configured word, because that is the one they wrote first
 * and so the one they think in. Falls back to the built-in default when the
 * kind has been switched off but something asks for it anyway.
 */
export function tagFor(kind: PkmKind, vocab: PkmVocabulary): string {
  return vocab[kind]?.[0] ?? DEFAULT_PKM_VOCABULARY[kind][0];
}

/** Badge label for a kind, using the user's own word. */
export function pkmLabel(kind: PkmKind, vocab: PkmVocabulary): string {
  return `#${tagFor(kind, vocab).toUpperCase()}`;
}

/** Translation key describing a kind in a sentence. */
// i18n pkm.noun.note: note
// i18n pkm.noun.todo: to-do
// i18n pkm.noun.cal: calendar item
export function pkmNounKey(kind: PkmKind): string {
  switch (kind) {
    case 'note':
      return 'pkm.noun.note';
    case 'todo':
      return 'pkm.noun.todo';
    case 'cal':
      return 'pkm.noun.cal';
  }
}

/**
 * Append a kind's tag to a body, unless it already carries that kind.
 *
 * Idempotent on purpose: jotting a note twice, or tagging something already
 * tagged, must not produce `#NOTE #NOTE`.
 */
export function withPkmTag(text: string, kind: PkmKind, vocab: PkmVocabulary): string {
  if (pkmKinds(text, vocab).includes(kind)) {
    return text;
  }
  const tag = `#${tagFor(kind, vocab)}`;
  const body = text.trim();
  return body ? `${body} ${tag}` : tag;
}
