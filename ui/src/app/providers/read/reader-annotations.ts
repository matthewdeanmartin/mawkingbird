import { computed, Injectable, signal } from '@angular/core';
import { scopedKey } from '../../account-scope';

/**
 * Highlights and notes the reader made, anchored to the extracted markdown.
 *
 * ## Why the anchor is an offset into *our* markdown
 *
 * The alternative is anchoring into the live remote DOM, which is someone
 * else's document: it changes without warning, it is re-templated, and it is
 * not even served identically to two readers. The extracted markdown is ours,
 * it is what the reader actually saw, and it is what `article-pages.ts` slices
 * — so an anchor into it survives a re-fetch, a type-size change and a
 * re-pagination.
 *
 * It does not survive the *publisher* rewriting the article, and it must not
 * pretend to. Hence {@link Anchor.quote}: the text as it was when highlighted,
 * checked against what is at those offsets on restore. A mismatch is reported,
 * never drawn — silently highlighting the wrong sentence is worse than
 * admitting the anchor drifted, because the reader has no way to notice the
 * first and every way to recover from the second.
 */
export interface Anchor {
  /** Index of the top-level block in the document's block list. */
  block: number;
  /** Character offsets within that block's plain text. */
  start: number;
  end: number;
  /** The text as highlighted, for verification on restore. */
  quote: string;
}

export interface Annotation {
  id: string;
  anchor: Anchor;
  /** The reader's own words. Empty for a bare highlight. */
  note: string;
  createdAt: number;
  updatedAt: number;
}

/** Every annotation on one document, oldest first. */
export type AnnotationList = readonly Annotation[];

/** Document id to its annotations. */
export type AnnotationMap = Record<string, Annotation[]>;

export const ANNOTATIONS_KEY_BASE = 'mockingbird_reader_annotations';

/**
 * How long an annotation survives without the document being opened.
 *
 * Longer than the library's year, and deliberately: a library entry records
 * *that* you read something, which is recoverable by reading it again. A note
 * is something you wrote, and nothing can reconstruct it. Two years is the
 * compromise with a shared ~5MB `localStorage` budget; the export exists so a
 * reader who wants them forever can have them.
 */
export const ANNOTATIONS_MAX_AGE_MS = 2 * 365 * 24 * 60 * 60 * 1000;

/** Across all documents. Notes are small; the cap is against runaway, not use. */
export const ANNOTATIONS_MAX_ENTRIES = 5_000;

function isAnchor(value: unknown): value is Anchor {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const a = value as Partial<Anchor>;
  return (
    typeof a.block === 'number' &&
    Number.isFinite(a.block) &&
    typeof a.start === 'number' &&
    Number.isFinite(a.start) &&
    typeof a.end === 'number' &&
    Number.isFinite(a.end) &&
    typeof a.quote === 'string' &&
    a.quote.length > 0
  );
}

function isAnnotation(value: unknown): value is Annotation {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const entry = value as Partial<Annotation>;
  return (
    typeof entry.id === 'string' &&
    entry.id.length > 0 &&
    isAnchor(entry.anchor) &&
    typeof entry.note === 'string' &&
    typeof entry.createdAt === 'number' &&
    Number.isFinite(entry.createdAt)
  );
}

/** Tolerant load: one bad entry costs that entry, never the store. */
function load(key: string): AnnotationMap {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? '{}');
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    const out: AnnotationMap = {};
    for (const [documentId, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!Array.isArray(value)) {
        continue;
      }
      const kept = (value as unknown[]).filter(isAnnotation).map((entry) => ({
        ...entry,
        updatedAt: Number.isFinite(entry.updatedAt) ? entry.updatedAt : entry.createdAt,
      }));
      if (kept.length) {
        out[documentId] = kept;
      }
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Drop annotations too old to keep, then the oldest until under the cap.
 *
 * Pure and exported, like `pruneLibrary`, so the policy can be tested without
 * booting Angular. Unlike the library there is no shelf to order eviction by,
 * so it is plain least-recently-touched — and, because losing a note is losing
 * writing, the caps are set where eviction should effectively never happen.
 */
export function pruneAnnotations(
  map: AnnotationMap,
  now = Date.now(),
  maxAge = ANNOTATIONS_MAX_AGE_MS,
  maxEntries = ANNOTATIONS_MAX_ENTRIES,
): { map: AnnotationMap; dropped: number } {
  let dropped = 0;
  const aged: AnnotationMap = {};
  for (const [documentId, list] of Object.entries(map)) {
    const kept = list.filter((entry) => {
      const alive = now - entry.updatedAt <= maxAge;
      if (!alive) {
        dropped++;
      }
      return alive;
    });
    if (kept.length) {
      aged[documentId] = kept;
    }
  }

  const total = Object.values(aged).reduce((sum, list) => sum + list.length, 0);
  if (total <= maxEntries) {
    return { map: aged, dropped };
  }

  // Flatten, sort oldest-touched first, and drop from the front.
  const flat = Object.entries(aged).flatMap(([documentId, list]) =>
    list.map((entry) => ({ documentId, entry })),
  );
  flat.sort((a, b) => a.entry.updatedAt - b.entry.updatedAt);
  const excess = total - maxEntries;
  dropped += excess;
  const survivors: AnnotationMap = {};
  for (const { documentId, entry } of flat.slice(excess)) {
    (survivors[documentId] ??= []).push(entry);
  }
  for (const list of Object.values(survivors)) {
    list.sort((a, b) => a.createdAt - b.createdAt);
  }
  return { map: survivors, dropped };
}

/** Whitespace-insensitive comparison text. */
function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Whether an anchor still points at the text it was made on.
 *
 * The whole trust model of the feature in one comparison. Whitespace is
 * normalised on both sides because re-extraction can legitimately re-wrap a
 * paragraph without changing a word of it, and refusing to render a highlight
 * over a line break would be a false alarm.
 */
export function anchorMatches(anchor: Anchor, blockText: string | undefined): boolean {
  if (blockText === undefined) {
    return false;
  }
  const found = normalize(blockText.slice(anchor.start, anchor.end));
  return found.length > 0 && found === normalize(anchor.quote);
}

@Injectable({ providedIn: 'root' })
export class ReaderAnnotations {
  private readonly key = scopedKey(ANNOTATIONS_KEY_BASE);
  private readonly entries = signal<AnnotationMap>(load(this.key));

  /** How many the startup prune dropped, for Storage Diagnostics. */
  readonly prunedOnLoad = signal(0);

  readonly total = computed(() =>
    Object.values(this.entries()).reduce((sum, list) => sum + list.length, 0),
  );

  constructor() {
    const { map, dropped } = pruneAnnotations(this.entries());
    if (dropped) {
      this.prunedOnLoad.set(dropped);
      this.persist(map);
    }
  }

  /** Everything on one document, in the order it was written. */
  forDocument(documentId: string): AnnotationList {
    return this.entries()[documentId] ?? [];
  }

  /** How many annotations one document carries. */
  countFor(documentId: string): number {
    return this.forDocument(documentId).length;
  }

  add(documentId: string, anchor: Anchor, note = '', at = Date.now()): Annotation {
    const entry: Annotation = {
      id: `${at.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      anchor,
      note,
      createdAt: at,
      updatedAt: at,
    };
    this.persist({
      ...this.entries(),
      [documentId]: [...this.forDocument(documentId), entry],
    });
    return entry;
  }

  setNote(documentId: string, id: string, note: string, at = Date.now()): void {
    const list = this.forDocument(documentId);
    if (!list.some((entry) => entry.id === id)) {
      return;
    }
    this.persist({
      ...this.entries(),
      [documentId]: list.map((entry) =>
        entry.id === id ? { ...entry, note, updatedAt: at } : entry,
      ),
    });
  }

  remove(documentId: string, id: string): void {
    const list = this.forDocument(documentId);
    const kept = list.filter((entry) => entry.id !== id);
    if (kept.length === list.length) {
      return;
    }
    const next = { ...this.entries() };
    if (kept.length) {
      next[documentId] = kept;
    } else {
      delete next[documentId];
    }
    this.persist(next);
  }

  /** Forget one document's annotations. */
  clearDocument(documentId: string): void {
    if (!this.entries()[documentId]) {
      return;
    }
    const next = { ...this.entries() };
    delete next[documentId];
    this.persist(next);
  }

  /** Forget everything. For Storage Diagnostics. */
  clear(): void {
    this.persist({});
  }

  /**
   * Everything, for export.
   *
   * A note is the reader's own writing, so it is the one thing in the reader
   * that **must** be exportable — a store that can only be read by the app that
   * wrote it is a store that can lose your work when the app changes.
   */
  snapshot(): AnnotationMap {
    return Object.fromEntries(
      Object.entries(this.entries()).map(([documentId, list]) => [documentId, [...list]]),
    );
  }

  private persist(map: AnnotationMap): void {
    this.entries.set(map);
    localStorage.setItem(this.key, JSON.stringify(map));
  }
}
