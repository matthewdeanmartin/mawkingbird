import { Deinflection, Deinflector, DictEntry } from '../dictionary';

/**
 * Japanese deinflection: undo conjugation so a tapped 食べなかった finds 食べる.
 *
 * Rule-based, in the manner of Rikaichan/Yomichan: each rule swaps a suffix
 * and records why (`past`, `negative`), and rules chain (食べさせられなかった
 * → 食べさせられない → 食べさせられる → 食べさせる → 食べる). Every candidate carries the
 * word classes it must belong to, so 食べ + た is only accepted as an ichidan
 * verb, never as a noun that happens to be spelled 食べる.
 *
 * Classes, as bits. TE marks a te-form reached through ている and may only be
 * undone by a te rule; TERM marks the surface form, where sentence-final
 * inflections (past, polite, volitional) can be.
 */
export const V1 = 1;
export const V5 = 2;
export const VK = 4;
export const VS = 8;
export const ADJ = 16;
const TE = 32;
const TERM = 64;
const ANY = V1 | V5 | VK | VS | ADJ | TE | TERM;

interface Rule {
  from: string;
  to: string;
  /** Classes the inflected word may have for this rule to apply. */
  in: number;
  /** Classes the result must have. */
  out: number;
  reason: string;
}

const rules: Rule[] = [];
const rule = (from: string, to: string, inMask: number, out: number, reason: string) =>
  rules.push({ from, to, in: inMask, out, reason });

// Polite and desire forms, added to a verb stem.
const MASU: [string, number, string][] = [
  ['ます', TERM, 'polite'],
  ['ました', TERM, 'politePast'],
  ['ません', TERM, 'politeNegative'],
  ['ませんでした', TERM, 'politePastNegative'],
  ['ましょう', TERM, 'politeVolitional'],
  ['たい', ADJ, 'want'],
];

// Ichidan: drop る.
for (const [suffix, inMask, reason] of MASU) rule(suffix, 'る', inMask, V1, reason);
rule('た', 'る', TERM, V1, 'past');
rule('て', 'る', TERM | TE, V1, 'te');
rule('ない', 'る', ADJ, V1, 'negative');
rule('ず', 'る', TERM, V1, 'negative');
rule('られる', 'る', V1, V1, 'passiveOrPotential');
rule('れる', 'る', V1, V1, 'potential');
rule('させる', 'る', V1, V1, 'causative');
rule('よう', 'る', TERM, V1, 'volitional');
rule('れば', 'る', TERM, V1, 'conditional');
rule('ろ', 'る', TERM, V1, 'imperative');
rule('たら', 'る', TERM, V1, 'conditional');

// Godan, by the row its ending kana moves to.
const U = ['く', 'ぐ', 'す', 'つ', 'ぬ', 'ぶ', 'む', 'る', 'う'];
const A = ['か', 'が', 'さ', 'た', 'な', 'ば', 'ま', 'ら', 'わ'];
const I = ['き', 'ぎ', 'し', 'ち', 'に', 'び', 'み', 'り', 'い'];
const E = ['け', 'げ', 'せ', 'て', 'ね', 'べ', 'め', 'れ', 'え'];
const O = ['こ', 'ご', 'そ', 'と', 'の', 'ぼ', 'も', 'ろ', 'お'];
U.forEach((u, n) => {
  for (const [suffix, inMask, reason] of MASU) rule(I[n] + suffix, u, inMask, V5, reason);
  rule(A[n] + 'ない', u, ADJ, V5, 'negative');
  rule(A[n] + 'ず', u, TERM, V5, 'negative');
  rule(A[n] + 'れる', u, V1, V5, 'passive');
  rule(A[n] + 'せる', u, V1, V5, 'causative');
  rule(E[n] + 'る', u, V1, V5, 'potential');
  rule(E[n] + 'ば', u, TERM, V5, 'conditional');
  rule(E[n], u, TERM, V5, 'imperative');
  rule(O[n] + 'う', u, TERM, V5, 'volitional');
});
// Godan past and te-forms (with their sound changes).
const PAST: [string, string, string][] = [
  ['いた', 'いて', 'く'],
  ['いだ', 'いで', 'ぐ'],
  ['した', 'して', 'す'],
  ['った', 'って', 'う'],
  ['った', 'って', 'つ'],
  ['った', 'って', 'る'],
  ['んだ', 'んで', 'ぬ'],
  ['んだ', 'んで', 'ぶ'],
  ['んだ', 'んで', 'む'],
  // 行く is the one く verb with った.
  ['った', 'って', 'く'],
];
for (const [past, te, u] of PAST) {
  rule(past, u, TERM, V5, 'past');
  rule(te, u, TERM | TE, V5, 'te');
  rule(past + 'ら', u, TERM, V5, 'conditional');
}

// する and 来る (くる).
const IRREGULAR: [string, string, string, string, number][] = [
  // [dictionary form, i-stem, a-stem (negative), o-stem (volitional), class]
  ['する', 'し', 'し', 'し', VS],
  ['くる', 'き', 'こ', 'こ', VK],
  ['来る', '来', '来', '来', VK],
];
for (const [base, i, a, o, cls] of IRREGULAR) {
  for (const [suffix, inMask, reason] of MASU) rule(i + suffix, base, inMask, cls, reason);
  rule(i + 'た', base, TERM, cls, 'past');
  rule(i + 'て', base, TERM | TE, cls, 'te');
  rule(i + 'たら', base, TERM, cls, 'conditional');
  rule(a + 'ない', base, ADJ, cls, 'negative');
  rule(o + 'よう', base, TERM, cls, 'volitional');
  rule(base.slice(0, -1) + 'れば', base, TERM, cls, 'conditional');
}
rule('される', 'する', V1, VS, 'passive');
rule('させる', 'する', V1, VS, 'causative');
rule('しろ', 'する', TERM, VS, 'imperative');
rule('こい', 'くる', TERM, VK, 'imperative');
rule('来い', '来る', TERM, VK, 'imperative');
// 勉強する → 勉強: a noun that takes する.
rule('する', '', VS, VS, 'suruVerb');

// い-adjectives.
rule('かった', 'い', TERM, ADJ, 'past');
rule('くない', 'い', ADJ, ADJ, 'negative');
rule('くて', 'い', TERM | TE, ADJ, 'te');
rule('ければ', 'い', TERM, ADJ, 'conditional');
rule('かったら', 'い', TERM, ADJ, 'conditional');
rule('く', 'い', TERM, ADJ, 'adverb');
rule('さ', 'い', TERM, ADJ, 'noun');
rule('そう', 'い', TERM, ADJ, 'seems');
rule('すぎる', 'い', V1, ADJ, 'too');

// Auxiliaries on the te-form.
rule('ている', 'て', V1, TE, 'progressive');
rule('てる', 'て', V1, TE, 'progressive');
rule('でいる', 'で', V1, TE, 'progressive');
rule('でる', 'で', V1, TE, 'progressive');
rule('てしまう', 'て', V5, TE, 'completed');
rule('ちゃう', 'て', V5, TE, 'completed');
rule('じゃう', 'で', V5, TE, 'completed');

// Longest suffix first, so the most specific reading of a form wins.
rules.sort((a, b) => b.from.length - a.from.length);

/** How many rules may chain. Real chains rarely pass four. */
const MAX_DEPTH = 5;

/** JMdict part-of-speech tag → class bits. */
export function jmdictClasses(pos: string): number {
  if (pos === 'v1' || pos === 'v1-s') return V1;
  if (pos.startsWith('v5')) return V5;
  if (pos === 'vk') return VK;
  if (pos.startsWith('vs')) return VS;
  if (pos === 'adj-i' || pos === 'adj-ix') return ADJ;
  return 0;
}

export const JAPANESE_DEINFLECTOR: Deinflector = {
  deinflect(surface: string): Deinflection[] {
    const results: Deinflection[] = [{ word: surface, reasons: [], classes: ANY }];
    const seen = new Map<string, number>([[surface, ANY]]);
    // Breadth first: an array iterator also visits what is pushed while it runs.
    for (const current of results) {
      if (current.reasons.length >= MAX_DEPTH) continue;
      for (const r of rules) {
        if (!(current.classes & r.in) || !current.word.endsWith(r.from)) continue;
        const word = current.word.slice(0, current.word.length - r.from.length) + r.to;
        if (!word) continue;
        // Same word with no new classes adds nothing.
        const known = seen.get(word) ?? 0;
        if ((known & r.out) === r.out) continue;
        seen.set(word, known | r.out);
        results.push({ word, reasons: [...current.reasons, r.reason], classes: r.out });
      }
    }
    return results;
  },

  accepts(entry: DictEntry, deinflection: Deinflection): boolean {
    if (!deinflection.reasons.length) return true;
    // A te-form reached through ている is not itself a word.
    const wanted = deinflection.classes & ~TE & ~TERM;
    return entry.senses.some((sense) =>
      sense.pos.some((pos) => (jmdictClasses(pos) & wanted) !== 0),
    );
  },
};
