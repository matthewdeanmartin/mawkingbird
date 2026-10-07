import { Status } from './models';

export function normalizeHashtag(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  const tag = raw.trim().replace(/^#/, '').normalize('NFKC');
  return /^[\p{L}\p{M}\p{N}_]{1,100}$/u.test(tag) ? tag : null;
}

export function statusHashtags(status: Status): string[] {
  const shown = status.reblog ?? status;
  const tags = new Map<string, string>();
  for (const item of shown.tags ?? []) {
    const tag = normalizeHashtag(item.name);
    if (tag) tags.set(tag.toLocaleLowerCase(), tag);
  }
  return [...tags.values()];
}
