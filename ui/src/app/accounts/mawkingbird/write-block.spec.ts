import { describe, expect, it } from 'vitest';
import { CollectionResult } from './profile-collections';
import { isDurableBlock, writeBlockFor, writeBlockMessage } from './write-block';

describe('writeBlockFor', () => {
  it('reports success and absence as no block', () => {
    // `absent` is an empty collection, not a refusal. Treating it as one is how
    // a brand-new account got told it could not write.
    expect(writeBlockFor({ kind: 'ok', value: null })).toBeNull();
    expect(writeBlockFor({ kind: 'unchanged' })).toBeNull();
    expect(writeBlockFor({ kind: 'absent' })).toBeNull();
  });

  it('keeps 402, 401 and 403 apart', () => {
    // The bug this file exists for: 401 and 403 were one `forbidden` kind, and
    // every consumer read that as "not entitled" and said so.
    expect(writeBlockFor({ kind: 'payment-required', message: 'x' })?.reason).toBe('not-entitled');
    expect(writeBlockFor({ kind: 'unauthenticated', message: 'x' })?.reason).toBe('signed-out');
    expect(writeBlockFor({ kind: 'forbidden', message: 'x' })?.reason).toBe('not-allowed');
  });

  it('maps a transport failure to "unknown" rather than to any refusal', () => {
    expect(writeBlockFor({ kind: 'failed', message: 'offline' })?.reason).toBe('unknown');
  });
});

describe('isDurableBlock', () => {
  it('latches only the two states that are genuinely durable', () => {
    // A network blip must not leave the UI asserting something about the
    // account after the network is back.
    expect(isDurableBlock({ reason: 'not-entitled', message: '' })).toBe(true);
    expect(isDurableBlock({ reason: 'not-allowed', message: '' })).toBe(true);
    expect(isDurableBlock({ reason: 'signed-out', message: '' })).toBe(false);
    expect(isDurableBlock({ reason: 'unknown', message: '' })).toBe(false);
    expect(isDurableBlock({ reason: 'no-account', message: '' })).toBe(false);
  });
});

describe('writeBlockMessage', () => {
  it('blames the subscription only when the subscription is the reason', () => {
    const lapsed = writeBlockMessage({ reason: 'not-entitled', message: '' }, 'your lists');
    expect(lapsed).toContain('Mawkingbird Plus');

    // The heart of the complaint: an expired sign-in and an unreachable service
    // must not tell the reader anything about their subscription.
    for (const reason of ['signed-out', 'unknown', 'no-account'] as const) {
      const text = writeBlockMessage({ reason, message: '' }, 'your lists');
      expect(text).not.toContain('Plus');
      expect(text).not.toMatch(/lapsed|expired subscription/i);
    }
  });

  it("says explicitly that an unreachable service is not the reader's fault", () => {
    const text = writeBlockMessage({ reason: 'unknown', message: '' }, 'your lists');
    expect(text).toContain('not with your subscription');
  });

  it('tells a signed-out reader to sign in, not to pay', () => {
    const text = writeBlockMessage({ reason: 'signed-out', message: '' }, 'your lists');
    expect(text).toContain('sign in again');
  });

  it('never claims anything was deleted', () => {
    // Every one of these states leaves the stored data intact and readable, and
    // the reader must be told so in all of them.
    const reasons = ['not-entitled', 'signed-out', 'not-allowed', 'unknown'] as const;
    for (const reason of reasons) {
      expect(writeBlockMessage({ reason, message: '' }, 'your lists')).toContain(
        'Nothing has been deleted',
      );
    }
  });
});

/** Compile-time guard: every CollectionResult kind is mapped. */
const _exhaustive: (r: CollectionResult<unknown>) => unknown = writeBlockFor;
void _exhaustive;
