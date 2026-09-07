import { CollectionResult } from './profile-collections';

/**
 * Why a profile collection is read-only, when it is.
 *
 * The distinction this type exists to keep is between **"you are not entitled"**
 * and **"we do not know"**. Every one of these used to render the same sentence
 * — "Your subscription has lapsed, so these are read-only" — because the two
 * refusals that mean opposite things (402 and 401) were collapsed into one
 * `forbidden` state on the way here. An expired sign-in, a service outage and a
 * genuinely lapsed subscription all told the reader they had let their
 * subscription run out, which in two of the three cases is a false accusation
 * about the reader's own account.
 *
 * `null` means writes are fine.
 */
export type WriteBlock =
  /** 402. The one case where "lapsed or never subscribed" is actually true. */
  | { reason: 'not-entitled'; message: string }
  /** 401. The credential expired or was rejected — an identity problem, not a billing one. */
  | { reason: 'signed-out'; message: string }
  /** 403. Known, but not permitted. Not something the reader can fix by paying. */
  | { reason: 'not-allowed'; message: string }
  /** 400 with no usable account key. */
  | { reason: 'no-account'; message: string }
  /**
   * Anything else: offline, 5xx, a malformed body.
   *
   * The important member of this union. Previously there was no such state, so
   * an unreachable service fell through to whatever the last known answer was —
   * which is how "we could not check" came out as "you did something wrong".
   */
  | { reason: 'unknown'; message: string };

/**
 * Map a refusal to a write block, or null if it was not one.
 *
 * `absent` is not a refusal — nothing stored is an empty collection — and `ok`
 * and `unchanged` obviously are not either.
 */
export function writeBlockFor(result: CollectionResult<unknown>): WriteBlock | null {
  switch (result.kind) {
    case 'ok':
    case 'unchanged':
    case 'absent':
      return null;
    case 'payment-required':
      return { reason: 'not-entitled', message: result.message };
    case 'unauthenticated':
      return { reason: 'signed-out', message: result.message };
    case 'forbidden':
      return { reason: 'not-allowed', message: result.message };
    case 'no-account':
      return { reason: 'no-account', message: result.message };
    default:
      return { reason: 'unknown', message: result.message };
  }
}

/**
 * Whether a block should latch the collection read-only, rather than being
 * reported once and retried.
 *
 * Only the two states that are genuinely durable do. A network blip must not
 * flip the UI into a mode that says the account cannot write, because that
 * outlives the blip and reads as a statement about the account.
 */
export function isDurableBlock(block: WriteBlock): boolean {
  return block.reason === 'not-entitled' || block.reason === 'not-allowed';
}

/**
 * What to tell someone, given a block and the thing being blocked.
 *
 * One function rather than a sentence per page, because the same block was
 * being described three different ways on three screens — and the "lapsed"
 * wording was pasted into all of them regardless of what had actually happened.
 *
 * `subject` names the collection in the plural ("your lists", "these feeds") and
 * is dropped into a sentence, so it should read as a noun phrase.
 */
export function writeBlockMessage(block: WriteBlock, subject: string): string {
  switch (block.reason) {
    case 'not-entitled':
      return (
        `${capitalize(subject)} are read-only because storing them on your account is part of ` +
        'Mawkingbird Plus. Nothing has been deleted, and you can still remove or export anything here.'
      );
    case 'signed-out':
      return (
        `Your sign-in has expired, so ${subject} are read-only until you sign in again. ` +
        'This says nothing about your subscription. Nothing has been deleted.'
      );
    case 'not-allowed':
      return `This account is not allowed to change ${subject}. Nothing has been deleted.`;
    case 'no-account':
      return `Mawkingbird could not tell which account to save ${subject} to, so they are read-only.`;
    case 'unknown':
      // Deliberately admits ignorance. The whole point of this state is that
      // guessing here is what produced the false "your subscription has lapsed".
      return (
        `Mawkingbird could not reach your account, so ${subject} are read-only for now. ` +
        'This is a problem on our side, not with your subscription. Nothing has been deleted.'
      );
  }
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
