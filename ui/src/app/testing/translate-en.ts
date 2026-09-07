import en from '../../../public/i18n/en.json';

/**
 * A real English `translate` for specs that call a function taking one.
 *
 * Plenty of logic in this app returns *what to say* rather than a rendered
 * string — `timingHint`, `corsHint`, `interpret` in the connection doctor all
 * take a `Translate` and hand back a sentence. Their specs are worth keeping
 * as assertions about meaning (`toContain('one round trip')`) rather than
 * being rewritten into assertions about key names, which would test nothing:
 * a key can be renamed and the sentence silently lost.
 *
 * So these specs resolve against the real dictionary, the same rationale
 * `i18n.testing.ts` gives for the component harness.
 *
 * **The lookup has to match how `extract-i18n.mjs` nests.** That script splits
 * a key only on its *first* dot, so `settings.connections.doctor.timing.slow`
 * is stored as `settings` → `'connections.doctor.timing.slow'`, not as five
 * levels. Walking every dot finds nothing and silently returns the key itself,
 * which is exactly how a passing-looking spec ends up asserting on
 * `'settings.connections...'` instead of English. Flattening first is what
 * `check-i18n.mjs` does, for the same reason.
 */
function flatten(
  node: Record<string, unknown>,
  prefix = '',
  out: Record<string, string> = {},
): Record<string, string> {
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      flatten(value as Record<string, unknown>, path, out);
    } else {
      out[path] = String(value);
    }
  }
  return out;
}

const DICTIONARY = flatten(en as unknown as Record<string, unknown>);

/** Resolve a key to its English, interpolating `{{params}}`. */
export function translateEn(key: string, params?: Record<string, unknown>): string {
  let text = DICTIONARY[key] ?? key;
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.replaceAll(`{{${name}}}`, String(value));
      text = text.replaceAll(`{{ ${name} }}`, String(value));
    }
  }
  return text;
}
