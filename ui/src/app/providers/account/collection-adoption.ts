/**
 * Reconciling a local collection with the one stored on the account.
 *
 * ## Two answers, not a merge algorithm
 *
 * When a browser with local data turns a collection's sync on, and the account
 * already holds a different set, there are exactly two answers offered:
 *
 * - **Merge** — keep both sides. Remote wins any item that exists in both.
 * - **Replace** — take the remote copy and drop this browser's local one.
 *
 * There is deliberately no third answer that pushes local over remote. That
 * direction is the one that destroys data belonging to a browser which is not in
 * front of the user, and defending against it properly means per-item history,
 * tombstones and causality — reinventing git for a trust list. Refusing to
 * support it is the cheaper, safer, and more honest position.
 *
 * The consequence, stated plainly so nobody is surprised: **remote is
 * authoritative on a conflict.** A local item that disagrees with a stored one
 * loses. Only items the account has never seen survive from this browser.
 *
 * ## Why remote wins ties in a merge
 *
 * The alternative is "newest wins", which needs a trustworthy clock on both
 * sides. `profile-sync.ts` already explains why client clocks are not that. The
 * stored copy is the one every *other* browser agreed on, so preferring it keeps
 * every browser converging on one answer instead of oscillating.
 *
 * ## An upload never *replaces* a stored item with an unrelated one
 *
 * A merge writes only the items the remote lacks — never the whole local set —
 * so the upload is bounded by what is genuinely new. An empty remote is the one
 * case where the whole local set is written, and there is nothing to lose there.
 *
 * The single exception is a caller that passes `combine`, used for lists, where
 * two entries with the same name are the same list with possibly different
 * members. There the combined item *is* uploaded over the stored one — but it is
 * built from both sides, so it only ever adds. The invariant that matters holds
 * either way: **nothing another browser put on the account is dropped.**
 */

/** What to do about a local set and a stored set that disagree. */
export type AdoptionChoice = 'merge' | 'replace';

export interface AdoptionPlan<T> {
  /** Items to write to the account. Empty for `replace`. */
  upload: T[];
  /** What the local store should end up holding. */
  local: T[];
  /** True when the account had nothing, so no question needs asking. */
  remoteEmpty: boolean;
}

/**
 * Work out what a choice implies, without performing it.
 *
 * Pure, and separated from the stores on purpose: this is the part with the
 * data-loss risk in it, so it is the part that has to be testable without a
 * network, a signal, or a TestBed.
 *
 * `identity` names an item — a feed URL, an account key. Two items with the same
 * identity are the same thing held twice, never two things.
 */
export function planAdoption<T>(
  local: readonly T[],
  remote: readonly T[],
  choice: AdoptionChoice,
  identity: (item: T) => string,
  /**
   * How to combine two items that are the same thing held in both places.
   *
   * Omitted, the stored copy simply wins — right for a trust verdict or a feed
   * subscription, where the item *is* its identity and there is nothing else to
   * reconcile. A list is different: two lists with the same name are the same
   * list, but their memberships are not necessarily the same, and taking the
   * remote wholesale would silently drop members added on this browser.
   *
   * The combined item is uploaded, because it differs from what the account
   * holds. That is the one case where a merge writes over a stored item, and it
   * is safe in the way the blanket rule protects against: it *adds* to the
   * stored version rather than replacing it with an unrelated one.
   */
  combine?: (localItem: T, remoteItem: T) => T,
): AdoptionPlan<T> {
  if (remote.length === 0) {
    // Nothing stored: the local set becomes the account's, whatever was chosen.
    // There is no conflict to resolve and nothing that could be lost.
    return { upload: [...local], local: [...local], remoteEmpty: true };
  }

  if (choice === 'replace') {
    // The remote copy, exactly. Nothing is uploaded — replace means this
    // browser's version was the one being discarded.
    return { upload: [], local: [...remote], remoteEmpty: false };
  }

  const remoteById = new Map(remote.map((item) => [identity(item), item]));
  const additions = local.filter((item) => !remoteById.has(identity(item)));

  if (!combine) {
    return {
      // Only what the account has never seen. An item present on both sides keeps
      // the stored version, so a merge cannot overwrite another browser's edit.
      upload: additions,
      local: [...remote, ...additions],
      remoteEmpty: false,
    };
  }

  const localById = new Map(local.map((item) => [identity(item), item]));
  const combined: T[] = [];
  const merged = remote.map((remoteItem) => {
    const localItem = localById.get(identity(remoteItem));
    if (localItem === undefined) {
      return remoteItem;
    }
    const result = combine(localItem, remoteItem);
    // Only worth uploading when combining actually produced something the
    // account does not already hold.
    if (result !== remoteItem) {
      combined.push(result);
    }
    return result;
  });

  return {
    upload: [...combined, ...additions],
    local: [...merged, ...additions],
    remoteEmpty: false,
  };
}

/**
 * Whether the user has to be asked at all.
 *
 * Only when both sides hold something. An empty local set has nothing to lose
 * and an empty remote has nothing to overwrite, so both adopt silently — asking
 * a question with one possible answer trains people to click through the ones
 * that matter.
 */
export function needsAdoptionChoice(localCount: number, remoteCount: number): boolean {
  return localCount > 0 && remoteCount > 0;
}
