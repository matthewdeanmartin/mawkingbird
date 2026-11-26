// Topic packs (spec/show-prep.md): what an agent should care about for one episode.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * @typedef {{ id: string, title: string, keywords: string[] }} Segment
 * @typedef {{
 *   id: string, title: string, blurb: string, servers: string[], hashtags: string[],
 *   segments: Segment[], ambiguous: string[], contextWords: string[],
 *   seedAccounts: string[], languages: string[], maxAgeDays: number,
 *   perAuthor: number, perSegment: number, perTagLimit: number, requestBudget: number,
 * }} TopicPack
 */

const TOPICS = join(dirname(fileURLToPath(import.meta.url)), 'topics');

/**
 * Check a parsed pack and fill defaults. Throws with every problem at once, so
 * an agent writing a new pack can fix it in one go.
 *
 * @param {any} raw
 * @returns {TopicPack}
 */
export function checkTopic(raw) {
  const problems = [];
  const list = (key) => Array.isArray(raw?.[key]) && raw[key].every((v) => typeof v === 'string');
  if (typeof raw?.id !== 'string' || !/^[a-z0-9-]+$/.test(raw.id))
    problems.push('id: lower-case words and dashes');
  if (typeof raw?.title !== 'string' || !raw.title) problems.push('title: required');
  if (!list('servers') || !raw.servers.length) problems.push('servers: at least one host name');
  if (list('servers') && raw.servers.some((s) => !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(s))) {
    problems.push('servers: bare host names, like mastodon.social');
  }
  if (!list('hashtags') || !raw.hashtags.length) problems.push('hashtags: at least one, without #');
  if (list('hashtags') && raw.hashtags.some((t) => t.startsWith('#') || /\s/.test(t))) {
    problems.push('hashtags: no # and no spaces');
  }
  const segments = Array.isArray(raw?.segments) ? raw.segments : [];
  if (!segments.length) problems.push('segments: at least one { id, title, keywords }');
  for (const [i, s] of segments.entries()) {
    if (!s?.id || !s?.title || !Array.isArray(s?.keywords))
      problems.push(`segments[${i}]: id, title and keywords`);
  }
  if (problems.length) throw new Error(`Topic pack problems:\n- ${problems.join('\n- ')}`);
  return {
    blurb: '',
    ambiguous: [],
    contextWords: [],
    seedAccounts: [],
    languages: [],
    maxAgeDays: 14,
    perAuthor: 2,
    perSegment: 8,
    perTagLimit: 40,
    requestBudget: 80,
    ...raw,
    segments: segments.map((s) => ({
      ...s,
      keywords: s.keywords.map((k) => String(k).toLowerCase()),
    })),
    // Names that are also ordinary words (#Elk, #Ivory): a post matched only
    // by one of these must also mention a context word to count as on topic.
    ambiguous: (raw.ambiguous ?? []).map((k) => String(k).toLowerCase()),
    contextWords: (raw.contextWords ?? []).map((k) => String(k).toLowerCase()),
  };
}

/** @param {string} id A file in topics/, without .json. @returns {TopicPack} */
export function loadTopic(id) {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error(`Unknown topic "${id}"`);
  return checkTopic(JSON.parse(readFileSync(join(TOPICS, `${id}.json`), 'utf8')));
}
