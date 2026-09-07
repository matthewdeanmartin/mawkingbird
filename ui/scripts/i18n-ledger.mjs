/** Accepted source and independent review revisions. Legacy stamps are untouched. */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

export const trackedLocale = (lang) =>
  ['zh-Hant', 'uk', 'ko', 'es', 'pt', 'it', 'nl', 'pl', 'ru', 'tr', 'vi', 'hi', 'sv'].includes(lang);
export const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const sourceHash = (source, context) => hash([source, context ?? null]);
export const readLedger = (path) => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
};
export const writeLedger = (path, value) =>
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);

export function stateFor(key, english, target, context, ledger) {
  if (!(key in target)) return 'missing';
  const entry = ledger[key];
  if (entry?.reviewRejected) return 'stale';
  if (
    entry?.source !== sourceHash(english[key], context[key]) ||
    entry?.translation !== hash(target[key])
  )
    return 'stale';
  return entry.reviewed === hash([entry.source, entry.translation]) ? 'reviewed' : 'unreviewed';
}

/** A source snapshot binds a draft to the English/context the translator saw. */
export function validateSnapshot(keys, snapshot, lang, english, context) {
  if (snapshot?.locale !== lang) throw new Error('Missing or wrong-locale source snapshot');
  for (const key of keys) {
    if (snapshot.keys?.[key] !== sourceHash(english[key], context[key])) {
      throw new Error(`Source changed or absent from snapshot: ${key}`);
    }
  }
}

export function acceptBatch(batch, english, context, ledger) {
  const result = { ...ledger };
  for (const [key, value] of Object.entries(batch)) {
    const source = sourceHash(english[key], context[key]);
    const translation = hash(value);
    const old = ledger[key];
    result[key] = {
      source,
      translation,
      ...(old?.source === source &&
      old?.translation === translation &&
      old.reviewed &&
      !old.reviewRejected
        ? { reviewed: old.reviewed }
        : {}),
    };
  }
  return result;
}

/** Review only the exact accepted values, against the current source/context. */
export function reviewBatch(batch, english, target, context, ledger) {
  const result = { ...ledger };
  for (const [key, value] of Object.entries(batch)) {
    if (
      target[key] !== value ||
      !['unreviewed', 'reviewed'].includes(stateFor(key, english, target, context, ledger))
    )
      throw new Error(`Review is stale or does not match the accepted translation: ${key}`);
    result[key] = { ...ledger[key], reviewed: hash([ledger[key].source, ledger[key].translation]) };
  }
  return result;
}
