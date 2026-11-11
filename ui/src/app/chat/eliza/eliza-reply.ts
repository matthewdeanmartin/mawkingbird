import { elizaReply as reply, faqMatch as match, type FaqPair } from '../../../lib/eliza';
import { ELIZA_FALLBACK, ELIZA_FAQ, ELIZA_RULES } from './eliza-content';

/** Mawkingbird's Eliza: the classic engine with her own FAQ, rules and fallbacks. */
const SCRIPT = { faq: ELIZA_FAQ, rules: ELIZA_RULES, fallback: ELIZA_FALLBACK };

/** Eliza's reply to one line of user text; `seed` picks among equal answers. */
export function elizaReply(text: string, seed = 0): string {
  return reply(SCRIPT, text, seed);
}

/** The first of Eliza's FAQ answers that the text asks about, or null. */
export function faqMatch(text: string): FaqPair | null {
  return match(text, ELIZA_FAQ);
}
