import { LangShare, detectLanguageMix } from '../language/language-detect';
import { stripHtml } from '../feeds/sentiment';
import { MastodonNotification } from '../platform/api/models';

/**
 * "When is my audience around, and what do they read?" — answered from the
 * people who actually interact, not from the follower list.
 *
 * A follower `Account` has no language and no active hours, and fetching every
 * follower's posts is one request per follower. The timed notifications the
 * decay scan already reads carry both: when someone reacted, the reply text
 * and its declared language, and the reacting account's bio. So this costs
 * nothing extra, and describes the *engaged* audience, which is the one a
 * creator can actually reach. The UI says so.
 *
 * ## The posting-hour bias
 *
 * People react to posts, so reaction hours lean toward the hours you post in.
 * The panel shows your own posting hours beside the reaction hours so the
 * reader can see that, and each person counts at most once per weekday-hour
 * slot so one devoted fan can't paint a slot by themselves.
 */

/** Hours in the grid's row. */
export const HOURS = 24;
/** Days in the grid's column, Sunday first (as `Date.getDay`). */
export const WEEKDAYS = 7;
/** Most reply texts kept for language detection. */
export const MAX_REPLY_TEXTS = 500;
/** Most bios kept for language detection. */
export const MAX_BIOS = 2000;
/** How many top slots to name. */
export const BEST_SLOTS = 3;

/** weekday × 24 + hour, in the viewer's local time. */
export function slotOf(at: number): number {
  const d = new Date(at);
  return d.getDay() * HOURS + d.getHours();
}

export interface EngagedSlot {
  day: number;
  hour: number;
  people: number;
}

export interface EngagedSummary {
  /** Distinct people who reacted. */
  people: number;
  /** Reactions read (likes, boosts, mentions). */
  reactions: number;
  /** Distinct people per slot, [day][hour]. */
  grid: number[][];
  /** Largest cell, for shading. */
  peak: number;
  /** The busiest slots, most people first. */
  best: EngagedSlot[];
  /** Distinct people per weekday, summed over hours (a person counts once per day). */
  byDay: number[];
  /** Languages of mentions and replies (strong: their own words, declared language). */
  replyLanguages: LangShare[];
  replies: number;
  /** Languages of the reacting people's bios (weak: a bio is short and often mixed). */
  bioLanguages: LangShare[];
  bios: number;
}

/**
 * Collects notifications page by page and summarizes them once.
 *
 * Keeps only a set of slots per person, a bounded list of reply texts, and one
 * bio per person, so a long walk does not hold every notification.
 */
export class EngagedAccumulator {
  private readonly slots = new Map<string, Set<number>>();
  private readonly days = new Map<string, Set<number>>();
  private readonly replyTexts: { text: string; meta?: string | null }[] = [];
  private readonly bioTexts = new Map<string, string>();
  private reactions = 0;

  add(notification: MastodonNotification): void {
    const at = Date.parse(notification.created_at);
    const person = notification.account?.id;
    if (Number.isNaN(at) || !person) {
      return;
    }
    if (!['favourite', 'reblog', 'mention'].includes(notification.type)) {
      return;
    }
    this.reactions++;
    const slot = slotOf(at);
    let set = this.slots.get(person);
    if (!set) {
      set = new Set();
      this.slots.set(person, set);
    }
    set.add(slot);
    let days = this.days.get(person);
    if (!days) {
      days = new Set();
      this.days.set(person, days);
    }
    days.add(Math.floor(slot / HOURS));

    if (notification.type === 'mention' && notification.status) {
      if (this.replyTexts.length < MAX_REPLY_TEXTS) {
        this.replyTexts.push({
          text: stripHtml(notification.status.content ?? ''),
          meta: notification.status.language,
        });
      }
    }
    const note = notification.account.note;
    if (note && !this.bioTexts.has(person) && this.bioTexts.size < MAX_BIOS) {
      this.bioTexts.set(person, stripHtml(note));
    }
  }

  summary(): EngagedSummary {
    const grid = Array.from({ length: WEEKDAYS }, () => new Array<number>(HOURS).fill(0));
    for (const set of this.slots.values()) {
      for (const slot of set) {
        grid[Math.floor(slot / HOURS)][slot % HOURS]++;
      }
    }
    const byDay = new Array<number>(WEEKDAYS).fill(0);
    for (const set of this.days.values()) {
      for (const day of set) byDay[day]++;
    }
    const cells: EngagedSlot[] = [];
    grid.forEach((row, day) => row.forEach((people, hour) => cells.push({ day, hour, people })));
    const best = cells
      .filter((c) => c.people > 0)
      .sort((a, b) => b.people - a.people || a.day - b.day || a.hour - b.hour)
      .slice(0, BEST_SLOTS);
    const bios = [...this.bioTexts.values()].filter((t) => t.trim());
    return {
      people: this.slots.size,
      reactions: this.reactions,
      grid,
      peak: Math.max(0, ...cells.map((c) => c.people)),
      best,
      byDay,
      replyLanguages: detectLanguageMix(this.replyTexts, 0.02),
      replies: this.replyTexts.filter((r) => r.text.trim()).length,
      bioLanguages: detectLanguageMix(
        bios.map((text) => ({ text })),
        0.02,
      ),
      bios: bios.length,
    };
  }
}

/** Your own posts per slot, for the comparison grid. */
export function postingGrid(createdAt: number[]): number[][] {
  const grid = Array.from({ length: WEEKDAYS }, () => new Array<number>(HOURS).fill(0));
  for (const at of createdAt) {
    const slot = slotOf(at);
    grid[Math.floor(slot / HOURS)][slot % HOURS]++;
  }
  return grid;
}

/** 0 (empty) to 4 (peak), for shading. */
export function level(value: number, peak: number): number {
  if (value <= 0 || peak <= 0) return 0;
  return Math.min(4, Math.max(1, Math.ceil((value / peak) * 4)));
}
