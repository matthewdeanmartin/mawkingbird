import { beforeEach, describe, expect, it } from 'vitest';
import {
  PROFILE_SYNC_KEY,
  isSyncing,
  readSyncRecord,
  shouldOfferRemote,
  shouldOfferResume,
  shouldOfferSync,
  updateSyncRecord,
  writeSyncRecord,
} from './profile-sync-state';

/**
 * The four sync states.
 *
 * The cases worth the most care are the ones that decide whether a person is
 * asked something: a prompt that returns after a decline is a nag, and a prompt
 * that never appears is a feature nobody finds.
 */
describe('profile sync state', () => {
  beforeEach(() => {
    localStorage.removeItem(PROFILE_SYNC_KEY);
  });

  it('starts unasked', () => {
    expect(readSyncRecord().state).toBe('unasked');
  });

  it('round-trips a full record', () => {
    writeSyncRecord({
      state: 'on',
      etag: '"abc"',
      revision: 12,
      dirty: true,
      lastSyncedAt: 1000,
      failures: 2,
    });
    const read = readSyncRecord();
    expect(read).toEqual({
      state: 'on',
      etag: '"abc"',
      revision: 12,
      dirty: true,
      lastSyncedAt: 1000,
      failures: 2,
    });
  });

  it('merges a partial update', () => {
    writeSyncRecord({ state: 'on', etag: '"abc"', revision: 3 });
    const next = updateSyncRecord({ revision: 4, dirty: true });
    expect(next.state).toBe('on');
    expect(next.etag).toBe('"abc"');
    expect(next.revision).toBe(4);
    expect(next.dirty).toBe(true);
  });

  describe('a damaged record', () => {
    it('resets to unasked rather than guessing', () => {
      // The safe direction: being asked once more costs a click, whereas
      // guessing `on` would start uploading without consent.
      localStorage.setItem(PROFILE_SYNC_KEY, 'not json at all');
      expect(readSyncRecord().state).toBe('unasked');
    });

    it('resets when the state is not one we know', () => {
      localStorage.setItem(PROFILE_SYNC_KEY, JSON.stringify({ state: 'maybe' }));
      expect(readSyncRecord().state).toBe('unasked');
    });

    it('drops fields of the wrong type rather than trusting them', () => {
      localStorage.setItem(
        PROFILE_SYNC_KEY,
        JSON.stringify({ state: 'on', revision: 'twelve', etag: 42 }),
      );
      const read = readSyncRecord();
      expect(read.state).toBe('on');
      expect(read.revision).toBeUndefined();
      expect(read.etag).toBeUndefined();
    });
  });

  describe('isSyncing', () => {
    it('is true only for on', () => {
      expect(isSyncing({ state: 'on' })).toBe(true);
      expect(isSyncing({ state: 'off' })).toBe(false);
      expect(isSyncing({ state: 'unasked' })).toBe(false);
      expect(isSyncing({ state: 'off-but-remote-exists' })).toBe(false);
    });
  });

  describe('shouldOfferSync', () => {
    it('offers once, when entitled and never asked', () => {
      expect(shouldOfferSync({ state: 'unasked' }, true)).toBe(true);
    });

    it('does not offer to someone who is not entitled', () => {
      expect(shouldOfferSync({ state: 'unasked' }, false)).toBe(false);
    });

    it('never returns after a decline', () => {
      // The whole point of `off` being distinct from `unasked`. A prompt that
      // comes back teaches people to dismiss dialogs without reading them.
      expect(shouldOfferSync({ state: 'off' }, true)).toBe(false);
    });

    it('does not offer when already syncing', () => {
      expect(shouldOfferSync({ state: 'on' }, true)).toBe(false);
    });

    it('does not use the first-enable prompt for the remote-exists case', () => {
      // That case gets its own, different offer: "adopt what is already there"
      // rather than "upload what is here".
      expect(shouldOfferSync({ state: 'off-but-remote-exists' }, true)).toBe(false);
    });
  });

  describe('shouldOfferRemote', () => {
    it('offers only in the remote-exists state', () => {
      expect(shouldOfferRemote({ state: 'off-but-remote-exists' })).toBe(true);
      expect(shouldOfferRemote({ state: 'unasked' })).toBe(false);
      expect(shouldOfferRemote({ state: 'on' })).toBe(false);
      expect(shouldOfferRemote({ state: 'off' })).toBe(false);
      expect(shouldOfferRemote({ state: 'paused' })).toBe(false);
    });
  });

  describe('shouldOfferResume', () => {
    it('offers a way back from both stopped states', () => {
      // `paused` is a misclicked off switch; `off` is a considered decline. The
      // page offers both a control, because neither is a reason to hide it —
      // only the unsolicited prompt is suppressed after a decline.
      expect(shouldOfferResume({ state: 'paused' }, true)).toBe(true);
      expect(shouldOfferResume({ state: 'off' }, true)).toBe(true);
    });

    it('stays out of the way of the states with their own offer', () => {
      expect(shouldOfferResume({ state: 'unasked' }, true)).toBe(false);
      expect(shouldOfferResume({ state: 'off-but-remote-exists' }, true)).toBe(false);
      expect(shouldOfferResume({ state: 'on' }, true)).toBe(false);
    });

    it('requires entitlement', () => {
      expect(shouldOfferResume({ state: 'paused' }, false)).toBe(false);
    });
  });

  describe('readSyncRecord', () => {
    it('round-trips the paused state', () => {
      // A state the parser does not recognise resets to `unasked`, which for a
      // paused browser would resurrect the first-run prompt.
      writeSyncRecord({ state: 'paused', etag: '"a"', revision: 2 }, localStorage);
      expect(readSyncRecord(localStorage).state).toBe('paused');
      expect(readSyncRecord(localStorage).revision).toBe(2);
    });
  });
});
