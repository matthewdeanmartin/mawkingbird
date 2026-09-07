import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MawkingbirdSession } from './mawkingbird-session';
import { PROFILE_ORIGIN } from './profile-client';
import { SupporterStatus } from './supporter-status';
import { ProfileSync, SETTINGS_KIND, SETTINGS_SCHEMA_VERSION } from './profile-sync';
import { PROFILE_SYNC_KEY, writeSyncRecord } from './profile-sync-state';

/**
 * Settings sync.
 *
 * Driven through the real `ProfileClient` against a stubbed `fetch`, rather than
 * mocking the client: the conditional-request headers are half of what this
 * feature *is*, and a mocked client would let a missing `If-Match` pass.
 */

const ORIGIN = 'https://profile-test.mawkingbird.com';
const PREFS = 'mockingbird_client_prefs';

class FakeMawkingbirdSession {
  user = signal<unknown>({ id: 'account-a' });
  token = vi.fn().mockResolvedValue('mawkingbird-token');
  /**
   * Present because `recheckEntitlement()` calls it. A double missing a method
   * the subject calls fails as a thrown TypeError rather than as a wrong
   * answer, which is a confusing way to learn the fake is incomplete.
   */
  upgradeIfStale = vi.fn().mockResolvedValue(false);
  heldTier = vi.fn().mockReturnValue('plus');
  /**
   * Signed in, so every test here exercises the real request path. The
   * anonymous short-circuit `ProfileClient.send()` applies to this answer is
   * covered in `profile-client.spec.ts`; these tests are about what sync does
   * with the service's replies, which presupposes reaching it.
   */
  canOwnStorage = vi.fn().mockReturnValue(true);
}

/** The last request `fetch` was called with. */
interface Call {
  url: string;
  init: RequestInit;
}

let calls: Call[] = [];
let fetchStub: ReturnType<typeof vi.fn<(url: string, init: RequestInit) => Promise<Response>>>;

function respond(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(status === 304 ? null : JSON.stringify(body), { status, headers });
}

function storedDocument(overrides: Record<string, unknown> = {}) {
  return {
    kind: SETTINGS_KIND,
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    minimumReaderVersion: SETTINGS_SCHEMA_VERSION,
    revision: 5,
    updatedAt: '2026-08-17T09:00:00.000Z',
    writer: 'dev_other',
    values: { [PREFS]: '{"theme":"dark"}' },
    keys: [PREFS],
    ...overrides,
  };
}

/** The header value a request carried, whatever shape `headers` took. */
function headerOf(init: RequestInit, name: string): string | null {
  return new Headers(init.headers).get(name);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

describe('ProfileSync', () => {
  let sync: ProfileSync;

  beforeEach(() => {
    localStorage.clear();
    calls = [];
    fetchStub = vi.fn<(url: string, init: RequestInit) => Promise<Response>>();
    vi.stubGlobal('fetch', (url: string, init: RequestInit = {}) => {
      calls.push({ url, init });
      return fetchStub(url, init);
    });

    TestBed.configureTestingModule({
      providers: [
        { provide: MawkingbirdSession, useValue: new FakeMawkingbirdSession() },
        { provide: PROFILE_ORIGIN, useValue: ORIGIN },
      ],
    });
    sync = TestBed.inject(ProfileSync);
    // Settle the service's initial account watcher before a test deliberately
    // holds a request; otherwise its first scheduled run looks like a sign-out.
    TestBed.flushEffects();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  describe('a 402 caused by a stale token', () => {
    /**
     * The reported bug, end to end.
     *
     * Auth tokens and proxy tokens are minted by different Workers. On a cold
     * load the auth token is minted before the subscription lookup can answer,
     * so it carries `tier: free`; the proxy token minted moments later correctly
     * says `plus`. Every profile write then authenticates with the stale claim
     * and the service answers 402 — a subscriber who cannot save, with both
     * halves individually behaving correctly.
     */
    it('re-mints and retries rather than reporting a lapsed subscription', async () => {
      const session = TestBed.inject(MawkingbirdSession) as unknown as FakeMawkingbirdSession;
      TestBed.inject(SupporterStatus).isSupporter.set(true);
      writeSyncRecord({ state: 'on', revision: 1 });
      sync.resetForTest({ state: 'on', revision: 1 });

      // The upgrade succeeds, standing in for a fresh token that says `plus`.
      session.upgradeIfStale.mockResolvedValue(true);
      fetchStub
        .mockResolvedValueOnce(respond(402, { error: 'Profile storage is part of Plus.' }))
        .mockResolvedValueOnce(respond(200, { etag: '"b"', revision: 2 }));

      const outcome = await sync.push(true);

      expect(session.upgradeIfStale).toHaveBeenCalledWith(true);
      expect(outcome.kind).toBe('saved');
      // And the read-only flag must not be left set, or every later push is
      // skipped before it can even try.
      expect(sync.readOnly()).toBe(false);
    });

    it('still reports read-only when the account really is not entitled', async () => {
      TestBed.inject(SupporterStatus).isSupporter.set(false);
      writeSyncRecord({ state: 'on', revision: 1 });
      sync.resetForTest({ state: 'on', revision: 1 });

      fetchStub.mockResolvedValue(respond(402, { error: 'Profile storage is part of Plus.' }));
      const outcome = await sync.push(true);

      expect(outcome.kind).toBe('read-only');
    });

    it('does not retry forever when the fresh token is refused too', async () => {
      const session = TestBed.inject(MawkingbirdSession) as unknown as FakeMawkingbirdSession;
      TestBed.inject(SupporterStatus).isSupporter.set(true);
      writeSyncRecord({ state: 'on', revision: 1 });
      sync.resetForTest({ state: 'on', revision: 1 });

      session.upgradeIfStale.mockResolvedValue(true);
      fetchStub.mockResolvedValue(respond(402, { error: 'Profile storage is part of Plus.' }));

      const outcome = await sync.push(true);

      expect(outcome.kind).toBe('read-only');
      // Exactly one retry: the PUT, then the retried PUT, and no more.
      expect(calls.filter((c) => c.init.method === 'PUT')).toHaveLength(2);
    });
  });

  describe('start', () => {
    it('detects settings stored by another browser', async () => {
      // Locally never asked, remotely present. The state that gets forgotten and
      // then becomes a support question.
      fetchStub.mockResolvedValue(
        respond(200, {
          readOnly: false,
          settings: { etag: '"a"', revision: 3, updatedAt: '…', size: 10 },
          quota: { used: 10, limit: 100 },
          conflicts: 0,
        }),
      );

      await sync.start();

      expect(sync.record().state).toBe('off-but-remote-exists');
      expect(sync.offersRemote()).toBe(true);
    });

    it('stays unasked when nothing is stored', async () => {
      fetchStub.mockResolvedValue(
        respond(200, { readOnly: false, quota: { used: 0, limit: 100 }, conflicts: 0 }),
      );
      await sync.start();
      expect(sync.record().state).toBe('unasked');
    });

    it('notices a lapsed subscription without turning sync off', async () => {
      // readOnly is reported by the manifest so the UI need not discover it one
      // failed write at a time.
      writeSyncRecord({ state: 'on', revision: 1 });
      sync.resetForTest({ state: 'on', revision: 1 });
      fetchStub.mockResolvedValue(
        respond(200, { readOnly: true, quota: { used: 0, limit: 100 }, conflicts: 0 }),
      );

      await sync.start();

      expect(sync.readOnly()).toBe(true);
      expect(sync.record().state).toBe('on');
    });

    it('does not fetch when the remote revision is not ahead', async () => {
      sync.resetForTest({ state: 'on', revision: 7, etag: '"a"' });
      fetchStub.mockResolvedValue(
        respond(200, {
          readOnly: false,
          settings: { etag: '"a"', revision: 7, updatedAt: '…', size: 10 },
          quota: { used: 10, limit: 100 },
          conflicts: 0,
        }),
      );

      await sync.start();

      expect(calls).toHaveLength(1);
      expect(calls[0]!.url).toContain('/manifest');
    });

    it('does nothing when signed out', async () => {
      fetchStub.mockResolvedValue(respond(401, { error: 'Sign in.' }));
      await sync.start();
      expect(sync.record().state).toBe('unasked');
    });
  });

  describe('enable', () => {
    it('uploads this browser as the baseline, creating with If-None-Match', async () => {
      localStorage.setItem(PREFS, '{"theme":"light"}');
      fetchStub.mockResolvedValue(respond(200, { ok: true, etag: '"new"', revision: 1 }));

      const outcome = await sync.enable();

      expect(outcome.kind).toBe('saved');
      // The counts the UI reports come from here, so they are asserted rather
      // than assumed: a wrong number is a confidently wrong claim to the user.
      expect(outcome.kind === 'saved' && outcome.revision).toBe(1);
      expect(outcome.kind === 'saved' && outcome.keys).toBeGreaterThan(0);
      const put = calls.find((call) => call.init.method === 'PUT')!;
      // A create, not an update: nothing was stored, so there is no ETag to
      // match and an unconditional write would be refused with 428.
      expect(headerOf(put.init, 'If-None-Match')).toBe('*');
      expect(headerOf(put.init, 'If-Match')).toBeNull();
      expect(sync.record().state).toBe('on');
      expect(sync.record().dirty).toBeFalsy();
    });

    it('stays on when the first push fails, so the decision is not lost', async () => {
      fetchStub.mockResolvedValue(respond(500, { error: 'boom' }));
      const outcome = await sync.enable();

      // Names the failure rather than merely being falsy — the whole point of
      // replacing the boolean, since a discarded `false` was reported as success.
      expect(outcome.kind).toBe('failed');
      // Turning it back off would discard an explicit decision because of a
      // transient network failure.
      expect(sync.record().state).toBe('on');
      expect(sync.record().dirty).toBe(true);
    });

    it('sends a bearer token and no cookies', async () => {
      fetchStub.mockResolvedValue(respond(200, { ok: true, etag: '"new"', revision: 1 }));
      await sync.enable();

      const put = calls.find((call) => call.init.method === 'PUT')!;
      expect(headerOf(put.init, 'Authorization')).toBe('Bearer mawkingbird-token');
      expect(put.init.credentials).toBe('omit');
    });

    it('sends the exact key allowlist the service cannot derive', async () => {
      fetchStub.mockResolvedValue(respond(200, { ok: true, etag: '"new"', revision: 1 }));
      await sync.enable();

      const put = calls.find((call) => call.init.method === 'PUT')!;
      const body = JSON.parse(put.init.body as string) as { keys: string[] };
      expect(body.keys).toContain(PREFS);
      expect(body.keys.length).toBeGreaterThan(0);
    });
  });

  describe('decline and disable', () => {
    it('records a decline permanently', () => {
      sync.decline();
      expect(sync.record().state).toBe('off');
      // The *prompt* never returns...
      expect(sync.offersSync(true)).toBe(false);
      // ...but the settings page still offers a way back. Suppressing a nag is
      // not the same as taking the control away.
      expect(sync.offersResume(true)).toBe(true);
    });

    it('stops syncing without deleting anything', async () => {
      sync.resetForTest({ state: 'on', etag: '"a"', revision: 4 });
      sync.disable();

      expect(sync.record().state).toBe('paused');
      // No DELETE. Turning sync off says "stop changing my browser", not
      // "destroy my profile", and conflating those makes the off switch
      // frightening to use.
      expect(calls.filter((call) => call.init.method === 'DELETE')).toHaveLength(0);
      // The position is kept, so resuming picks up where this browser left off
      // rather than colliding with its own last write.
      expect(sync.record().etag).toBe('"a"');
      expect(sync.record().revision).toBe(4);
    });

    it('offers a way back after stopping, and takes it', async () => {
      // The bug this pair exists for: `disable()` used to write the same
      // terminal `off` as a decline, so a misclicked off switch was permanent
      // and the settings page rendered a status line with no controls at all.
      sync.resetForTest({ state: 'on', etag: '"a"', revision: 4 });
      sync.disable();
      expect(sync.offersResume(true)).toBe(true);

      fetchStub.mockResolvedValue(respond(200, storedDocument(), { ETag: '"remote"' }));
      await sync.resume();

      expect(sync.record().state).toBe('on');
      expect(sync.syncing()).toBe(true);
    });

    it('does not discard edits made while sync was stopped', async () => {
      // While paused, `noteLocalChange()` returns early, so the dirty flag says
      // nothing about that window — and settings changing during it is the
      // whole point of the window. Resuming has to assume there are edits, or
      // `pull()` takes the silent-overwrite path and they are gone with no
      // prompt.
      sync.resetForTest({ state: 'on', etag: '"a"', revision: 4, dirty: false });
      sync.disable();
      localStorage.setItem(PREFS, '{"theme":"light"}');
      fetchStub.mockResolvedValue(respond(200, storedDocument(), { ETag: '"remote"' }));

      const outcome = await sync.resume();

      expect(outcome.kind).toBe('needs-decision');
      // Untouched until the user answers.
      expect(localStorage.getItem(PREFS)).toBe('{"theme":"light"}');
    });

    it('offers no resume to an account that is not entitled', () => {
      // A button whose only possible outcome is 402 is worse than no button.
      sync.resetForTest({ state: 'on' });
      sync.disable();
      expect(sync.offersResume(false)).toBe(false);
    });
  });

  describe('pull', () => {
    it('applies a remote change silently when nothing local is unsaved', async () => {
      // The overwhelmingly common path. Prompting here would train people to
      // click through.
      localStorage.setItem(PREFS, '{"theme":"light"}');
      sync.resetForTest({ state: 'on', revision: 1, dirty: false });
      fetchStub.mockResolvedValue(respond(200, storedDocument(), { ETag: '"remote"' }));

      const outcome = await sync.pull();

      expect(outcome.kind).toBe('applied');
      expect(localStorage.getItem(PREFS)).toBe('{"theme":"dark"}');
      expect(sync.record().etag).toBe('"remote"');
      expect(sync.record().revision).toBe(5);
    });

    it('preserves an edit made while the remote document is in flight', async () => {
      localStorage.setItem(PREFS, '{"theme":"light"}');
      sync.resetForTest({ state: 'on', revision: 1, dirty: false });
      const response = deferred<Response>();
      fetchStub.mockReturnValue(response.promise);

      const pulling = sync.pull();
      await vi.waitFor(() => expect(fetchStub).toHaveBeenCalledOnce());
      localStorage.setItem(PREFS, '{"theme":"blue"}');
      sync.noteLocalChange();
      response.resolve(respond(200, storedDocument(), { ETag: '"remote"' }));

      const outcome = await pulling;
      expect(outcome.kind).toBe('needs-decision');
      expect(localStorage.getItem(PREFS)).toBe('{"theme":"blue"}');
      expect(sync.record().dirty).toBe(true);
    });

    it('does not apply a response requested for an account that signed out', async () => {
      const session = TestBed.inject(MawkingbirdSession) as unknown as FakeMawkingbirdSession;
      localStorage.setItem(PREFS, '{"theme":"light"}');
      sync.resetForTest({ state: 'on', revision: 1, dirty: false });
      const response = deferred<Response>();
      fetchStub.mockReturnValue(response.promise);

      const pulling = sync.pull();
      await vi.waitFor(() => expect(fetchStub).toHaveBeenCalledOnce());
      localStorage.removeItem(PROFILE_SYNC_KEY);
      session.user.set(null);
      TestBed.flushEffects();
      response.resolve(respond(200, storedDocument(), { ETag: '"remote"' }));

      expect((await pulling).kind).toBe('failed');
      expect(localStorage.getItem(PREFS)).toBe('{"theme":"light"}');
      expect(sync.record().state).toBe('unasked');
    });

    /**
     * Regression: a bad stored etag wedged sync permanently.
     *
     * `If-None-Match` is sent from an etag kept in localStorage, so a value the
     * service will not accept makes every pull fail identically — through
     * reloads, and for as long as it sits there. The user sees sync simply stop
     * working, with no way to see or clear the value responsible. One
     * unconditional retry costs a single request and turns that dead end into a
     * self-repair.
     */
    it('retries without the stored etag when a conditional read fails', async () => {
      localStorage.setItem(PREFS, '{"theme":"light"}');
      sync.resetForTest({ state: 'on', revision: 1, dirty: false, etag: '"stale"' });
      fetchStub
        .mockResolvedValueOnce(respond(500, { error: 'no' }))
        .mockResolvedValueOnce(respond(200, storedDocument(), { ETag: '"fresh"' }));

      const outcome = await sync.pull();

      expect(outcome.kind).toBe('applied');
      expect(sync.record().etag).toBe('"fresh"');
      // The second request must not carry the etag that just failed.
      const retry = fetchStub.mock.calls[1]?.[1] as RequestInit | undefined;
      expect(new Headers(retry?.headers).get('If-None-Match')).toBeNull();
    });

    it('reports the failure when the plain read fails too', async () => {
      // The retry is one attempt, not a loop: if an unconditional read also
      // fails, the problem is not the etag and saying so is the honest answer.
      sync.resetForTest({ state: 'on', revision: 1, dirty: false, etag: '"stale"' });
      fetchStub.mockResolvedValue(respond(500, { error: 'no' }));

      const outcome = await sync.pull();

      expect(outcome.kind).toBe('failed');
      expect(fetchStub).toHaveBeenCalledTimes(2);
    });

    it('does not retry when there was no etag to blame', async () => {
      sync.resetForTest({ state: 'on', revision: 1, dirty: false });
      fetchStub.mockResolvedValue(respond(500, { error: 'no' }));

      const outcome = await sync.pull();

      expect(outcome.kind).toBe('failed');
      expect(fetchStub).toHaveBeenCalledOnce();
    });

    it('asks when the remote is ahead and this browser has unsaved edits', async () => {
      // The one case that must ask: either answer loses something, so it is not
      // ours to choose.
      localStorage.setItem(PREFS, '{"theme":"light"}');
      sync.resetForTest({ state: 'on', revision: 1, dirty: true });
      fetchStub.mockResolvedValue(respond(200, storedDocument(), { ETag: '"remote"' }));

      const outcome = await sync.pull();

      expect(outcome.kind).toBe('needs-decision');
      // Nothing applied yet: the user may keep this browser's copy, and a
      // partial application would already have destroyed it.
      expect(localStorage.getItem(PREFS)).toBe('{"theme":"light"}');
    });

    it('reports a diff with the decision, so the UI can show what differs', async () => {
      localStorage.setItem(PREFS, '{"theme":"light"}');
      sync.resetForTest({ state: 'on', revision: 1, dirty: true });
      fetchStub.mockResolvedValue(respond(200, storedDocument(), { ETag: '"remote"' }));

      const outcome = await sync.pull();

      expect(outcome.kind).toBe('needs-decision');
      if (outcome.kind === 'needs-decision') {
        expect(outcome.changes.some((change) => change.key === PREFS)).toBe(true);
      }
    });

    it('does nothing on 304', async () => {
      sync.resetForTest({ state: 'on', revision: 5, etag: '"a"', dirty: false });
      fetchStub.mockResolvedValue(respond(304, null));

      const outcome = await sync.pull();

      expect(outcome.kind).toBe('unchanged');
      expect(headerOf(calls[0]!.init, 'If-None-Match')).toBe('"a"');
    });

    it('reports absent when nothing is stored', async () => {
      sync.resetForTest({ state: 'on' });
      fetchStub.mockResolvedValue(respond(404, { error: 'nothing' }));
      expect((await sync.pull()).kind).toBe('absent');
    });

    it('leaves localStorage alone when the pull fails', async () => {
      // The app worked signed out before this feature existed and must still.
      localStorage.setItem(PREFS, '{"theme":"light"}');
      sync.resetForTest({ state: 'on', revision: 1 });
      fetchStub.mockResolvedValue(respond(500, { error: 'boom' }));

      const outcome = await sync.pull();

      expect(outcome.kind).toBe('failed');
      expect(localStorage.getItem(PREFS)).toBe('{"theme":"light"}');
    });
  });

  describe('resolving a decision', () => {
    it('useRemote applies the other browser and clears the dirty flag', () => {
      localStorage.setItem(PREFS, '{"theme":"light"}');
      sync.resetForTest({ state: 'on', revision: 1, dirty: true });

      sync.useRemote(
        {
          kind: 'mockingbird-client-config',
          schemaVersion: 1,
          minimumReaderVersion: 1,
          exportedAt: '2026-08-17T09:00:00.000Z',
          privacy: 'standard',
          values: { [PREFS]: '{"theme":"dark"}' },
        },
        '"remote"',
        5,
      );

      expect(localStorage.getItem(PREFS)).toBe('{"theme":"dark"}');
      expect(sync.record().dirty).toBeFalsy();
      expect(sync.record().revision).toBe(5);
    });

    it('keepLocal pushes this browser as an update, not a create', async () => {
      // Adopting the remote ETag is what makes the retry a legal update: the
      // local *content* wins, the remote *position in the sequence* is
      // respected.
      localStorage.setItem(PREFS, '{"theme":"light"}');
      sync.resetForTest({ state: 'on', revision: 1, dirty: true });
      fetchStub.mockResolvedValue(respond(200, { ok: true, etag: '"newer"', revision: 6 }));

      await sync.keepLocal('"remote"', 5);

      const put = calls.find((call) => call.init.method === 'PUT')!;
      expect(headerOf(put.init, 'If-Match')).toBe('"remote"');
      const body = JSON.parse(put.init.body as string) as { revision: number };
      // Must advance past the remote's 5, or the service answers 409.
      expect(body.revision).toBe(6);
    });
  });

  describe('push', () => {
    it('updates with If-Match once something is stored', async () => {
      sync.resetForTest({ state: 'on', etag: '"a"', revision: 3, dirty: true });
      fetchStub.mockResolvedValue(respond(200, { ok: true, etag: '"b"', revision: 4 }));

      await sync.push();

      const put = calls.find((call) => call.init.method === 'PUT')!;
      expect(headerOf(put.init, 'If-Match')).toBe('"a"');
      expect(sync.record().dirty).toBeFalsy();
      expect(sync.record().revision).toBe(4);
    });

    it('keeps a later edit dirty when an older snapshot finishes saving', async () => {
      localStorage.setItem(PREFS, '{"theme":"light"}');
      sync.resetForTest({ state: 'on', etag: '"a"', revision: 3, dirty: true });
      const response = deferred<Response>();
      fetchStub.mockReturnValue(response.promise);

      const pushing = sync.push();
      await vi.waitFor(() => expect(fetchStub).toHaveBeenCalledOnce());
      localStorage.setItem(PREFS, '{"theme":"blue"}');
      sync.noteLocalChange();
      response.resolve(respond(200, { ok: true, etag: '"b"', revision: 4 }));

      expect((await pushing).kind).toBe('saved');
      expect(sync.record().etag).toBe('"b"');
      expect(sync.record().revision).toBe(4);
      expect(sync.record().dirty).toBe(true);
    });

    it('does not adopt a saved version after its account signs out', async () => {
      const session = TestBed.inject(MawkingbirdSession) as unknown as FakeMawkingbirdSession;
      sync.resetForTest({ state: 'on', etag: '"a"', revision: 3, dirty: true });
      const response = deferred<Response>();
      fetchStub.mockReturnValue(response.promise);

      const pushing = sync.push();
      await vi.waitFor(() => expect(fetchStub).toHaveBeenCalledOnce());
      localStorage.removeItem(PROFILE_SYNC_KEY);
      session.user.set(null);
      TestBed.flushEffects();
      response.resolve(respond(200, { ok: true, etag: '"b"', revision: 4 }));

      expect((await pushing).kind).toBe('not-syncing');
      expect(sync.record().state).toBe('unasked');
      expect(sync.record().etag).toBeUndefined();
    });

    it('serializes an overlapping pull and push', async () => {
      sync.resetForTest({ state: 'on', etag: '"a"', revision: 3, dirty: false });
      const response = deferred<Response>();
      fetchStub
        .mockReturnValueOnce(response.promise)
        .mockResolvedValueOnce(respond(200, { ok: true, etag: '"c"', revision: 5 }));

      const pulling = sync.pull();
      const pushing = sync.push();
      await vi.waitFor(() => expect(fetchStub).toHaveBeenCalledOnce());
      expect(calls[0]!.init.method).toBe('GET');
      response.resolve(respond(200, storedDocument({ revision: 4 }), { ETag: '"b"' }));

      await pulling;
      await pushing;
      expect(calls.map((call) => call.init.method)).toEqual(['GET', 'PUT']);
      expect(headerOf(calls[1]!.init, 'If-Match')).toBe('"b"');
    });

    it('advances the revision, since an equal one is refused with 409', async () => {
      sync.resetForTest({ state: 'on', etag: '"a"', revision: 3, dirty: true });
      fetchStub.mockResolvedValue(respond(200, { ok: true, etag: '"b"', revision: 4 }));

      await sync.push();

      const put = calls.find((call) => call.init.method === 'PUT')!;
      const body = JSON.parse(put.init.body as string) as { revision: number };
      expect(body.revision).toBe(4);
    });

    it('holds the winner on a 412 without adopting it for automatic writes', async () => {
      sync.resetForTest({ state: 'on', etag: '"stale"', revision: 3, dirty: true });
      fetchStub.mockResolvedValue(
        respond(
          412,
          { code: 'conflict', current: storedDocument({ revision: 9 }) },
          {
            ETag: '"winner"',
          },
        ),
      );

      const outcome = await sync.push();

      expect(outcome.kind).toBe('conflict');
      expect(sync.record().etag).toBe('"stale"');
      expect(sync.record().revision).toBe(3);
      // Still unsaved: this browser's edits have not been stored anywhere.
      expect(sync.record().dirty).toBe(true);

      localStorage.setItem(PREFS, '{"theme":"blue"}');
      sync.noteLocalChange();
      const blocked = await sync.push();
      expect(blocked.kind).toBe('conflict');
      expect(fetchStub).toHaveBeenCalledOnce();

      const presentedAgain = await sync.pull();
      expect(presentedAgain.kind).toBe('needs-decision');
      expect(fetchStub).toHaveBeenCalledOnce();
    });

    it('uses the held winner only after keep-local resolves the conflict', async () => {
      localStorage.setItem(PREFS, '{"theme":"light"}');
      sync.resetForTest({ state: 'on', etag: '"stale"', revision: 3, dirty: true });
      fetchStub
        .mockResolvedValueOnce(
          respond(
            412,
            { code: 'conflict', current: storedDocument({ revision: 9 }) },
            { ETag: '"winner"' },
          ),
        )
        .mockResolvedValueOnce(respond(200, { ok: true, etag: '"mine"', revision: 10 }));

      const conflict = await sync.push();
      expect(conflict.kind).toBe('conflict');
      if (conflict.kind !== 'conflict') return;
      expect((await sync.keepLocal(conflict.etag, conflict.revision)).kind).toBe('saved');
      expect(headerOf(calls[1]!.init, 'If-Match')).toBe('"winner"');
    });

    it('applies the held winner only after use-remote resolves the conflict', async () => {
      localStorage.setItem(PREFS, '{"theme":"light"}');
      sync.resetForTest({ state: 'on', etag: '"stale"', revision: 3, dirty: true });
      fetchStub.mockResolvedValue(
        respond(
          412,
          { code: 'conflict', current: storedDocument({ revision: 9 }) },
          { ETag: '"winner"' },
        ),
      );

      const conflict = await sync.push();
      expect(conflict.kind).toBe('conflict');
      if (conflict.kind !== 'conflict') return;
      sync.useRemote(conflict.remote, conflict.etag, conflict.revision);

      expect(localStorage.getItem(PREFS)).toBe('{"theme":"dark"}');
      expect(sync.record().etag).toBe('"winner"');
      expect(sync.record().revision).toBe(9);
      expect(sync.record().dirty).toBeFalsy();
    });

    /**
     * Regression, from a real session.
     *
     * GET /settings returned 404 (correct — nothing stored yet), the follow-up
     * push failed, and the config page said "Saved this browser's settings."
     * The cause was `push()` returning a boolean that all three call sites
     * discarded. What makes the fix real is not that the message changed but
     * that a failure is now *unrepresentable* as a success: there is no boolean
     * left to drop.
     */
    it('reports a failure as a failure, never as saved', async () => {
      sync.resetForTest({ state: 'on', dirty: true });
      fetchStub.mockResolvedValue(respond(500, { error: 'boom' }));

      const outcome = await sync.push();

      expect(outcome.kind).toBe('failed');
      expect(outcome.kind === 'failed' && outcome.message).toBeTruthy();
      // Nothing recorded as synced, so the UI cannot claim a save happened.
      expect(sync.record().lastSyncedAt).toBeUndefined();
      expect(sync.record().dirty).toBe(true);
    });

    it('an interactive push surfaces the first failure immediately', async () => {
      // Background pushes stay quiet until a failure looks persistent, which is
      // right for a blip and wrong for a button the user just clicked.
      sync.resetForTest({ state: 'on', dirty: true });
      fetchStub.mockResolvedValue(respond(500, { error: 'boom' }));

      await sync.push(true);

      expect(sync.error()).toBeTruthy();
    });

    it('a background push stays quiet on a first failure', async () => {
      sync.resetForTest({ state: 'on', dirty: true });
      fetchStub.mockResolvedValue(respond(500, { error: 'boom' }));

      await sync.push();

      expect(sync.error()).toBeNull();
    });

    it('reports what was uploaded, grouped by registry category', async () => {
      localStorage.setItem(PREFS, '{"theme":"light"}');
      fetchStub.mockResolvedValue(respond(200, { ok: true, etag: '"new"', revision: 4 }));
      sync.resetForTest({ state: 'on', dirty: true });

      const outcome = await sync.push(true);

      expect(outcome.kind).toBe('saved');
      if (outcome.kind !== 'saved') {
        return;
      }
      expect(outcome.bytes).toBeGreaterThan(0);
      // Grouped from storage-registry.ts, so the breakdown shown to the user
      // cannot drift from the classification that decides what may be exported.
      expect(Object.keys(outcome.byCategory).length).toBeGreaterThan(0);
      const grouped = Object.values(outcome.byCategory).flat();
      expect(grouped).toHaveLength(outcome.keys);
      expect(outcome.byCategory['unclassified']).toBeUndefined();
    });

    /**
     * Regression, from a real session.
     *
     * Tokens are minted twice on a cold load: the first says `tier: 'free'`
     * because the subscription lookup has not finished, the second says
     * `tier: 'plus'`. `start()` ran in that window, the manifest came back
     * `readOnly: true`, and the flag was latched — so a paying account was told
     * "your subscription has lapsed" and every push was skipped for the rest of
     * the session.
     *
     * The fix is that `readOnly` is *derived* rather than stored, so it cannot
     * outlive the fact it was about.
     */
    it('stops being read-only once the corrected tier arrives', async () => {
      const supporter = TestBed.inject(SupporterStatus);
      supporter.isSupporter.set(false);
      sync.resetForTest({ state: 'on', etag: '"a"', revision: 1 });
      fetchStub.mockResolvedValue(
        respond(200, { readOnly: true, quota: { used: 0, limit: 100 }, conflicts: 0 }),
      );

      await sync.start();
      expect(sync.readOnly()).toBe(true);

      // The second mint lands, reporting the real tier.
      supporter.isSupporter.set(true);

      expect(sync.readOnly()).toBe(false);
    });

    it('stays read-only when the account genuinely is not entitled', async () => {
      // The other direction, so the fix cannot become "never read-only": a
      // refusal with no supporter flag behind it is a real lapse.
      TestBed.inject(SupporterStatus).isSupporter.set(false);
      sync.resetForTest({ state: 'on', etag: '"a"', revision: 1 });
      fetchStub.mockResolvedValue(
        respond(200, { readOnly: true, quota: { used: 0, limit: 100 }, conflicts: 0 }),
      );

      await sync.start();

      expect(sync.readOnly()).toBe(true);
      expect((await sync.push()).kind).toBe('read-only');
    });

    it('re-reads the manifest when entitlement improves after startup', async () => {
      // Clearing the flag is not enough on its own: the manifest itself was
      // read under the wrong identity, so the offers and revisions taken from
      // it are stale too.
      const supporter = TestBed.inject(SupporterStatus);
      supporter.isSupporter.set(false);
      sync.resetForTest({ state: 'unasked' });
      fetchStub.mockResolvedValue(
        respond(200, { readOnly: true, quota: { used: 0, limit: 100 }, conflicts: 0 }),
      );

      await sync.start();
      const before = calls.length;

      supporter.isSupporter.set(true);
      await sync.recheckEntitlement();

      expect(calls.length).toBeGreaterThan(before);
    });

    it('does not refetch when entitlement was already correct', async () => {
      const supporter = TestBed.inject(SupporterStatus);
      supporter.isSupporter.set(true);
      sync.resetForTest({ state: 'on', etag: '"a"', revision: 1 });
      fetchStub.mockResolvedValue(
        respond(200, { readOnly: false, quota: { used: 0, limit: 100 }, conflicts: 0 }),
      );

      await sync.start();
      const before = calls.length;
      await sync.recheckEntitlement();

      // A boolean comparison, not a request: repeated mints of an
      // already-correct token must stay free.
      expect(calls).toHaveLength(before);
    });

    /**
     * Regression: re-reading the manifest is useless while the token is stale.
     *
     * The held token is cached until it expires, so a `recheckEntitlement()`
     * that only refetched kept presenting the same free-tier claim and kept
     * getting the same correct 402. The retry was real; it was re-asking with
     * the wrong credential — which is what made this look racy rather than
     * simply wrong.
     */
    it('discards a stale free-tier token before re-reading the manifest', async () => {
      const supporter = TestBed.inject(SupporterStatus);
      const session = TestBed.inject(MawkingbirdSession);
      const upgrade = vi.spyOn(session, 'upgradeIfStale').mockResolvedValue(true);

      supporter.isSupporter.set(false);
      sync.resetForTest({ state: 'unasked' });
      fetchStub.mockResolvedValue(
        respond(200, { readOnly: true, quota: { used: 0, limit: 100 }, conflicts: 0 }),
      );
      await sync.start();

      supporter.isSupporter.set(true);
      await sync.recheckEntitlement();

      expect(upgrade).toHaveBeenCalledWith(true);
    });

    it('does not push when sync is off', async () => {
      sync.resetForTest({ state: 'off' });
      expect((await sync.push()).kind).toBe('not-syncing');
      expect(calls).toHaveLength(0);
    });

    it('does not push on a lapsed subscription', async () => {
      sync.resetForTest({ state: 'on', etag: '"a"', revision: 1 });
      fetchStub.mockResolvedValue(
        respond(200, { readOnly: true, quota: { used: 0, limit: 100 }, conflicts: 0 }),
      );
      await sync.start();
      calls = [];

      expect((await sync.push()).kind).toBe('read-only');
      expect(calls).toHaveLength(0);
    });

    it('surfaces a 402 rather than retrying forever', async () => {
      sync.resetForTest({ state: 'on', etag: '"a"', revision: 1, dirty: true });
      fetchStub.mockResolvedValue(
        respond(402, { error: 'Profile storage is part of Mawkingbird Plus.' }),
      );

      await sync.push();

      expect(sync.readOnly()).toBe(true);
      expect(sync.error()).toContain('Mawkingbird Plus');
    });

    it('stays quiet on the first failures, then reports a persistent one', async () => {
      // One failed push is usually a tunnel or a sleeping laptop. Five is how
      // someone discovers on a new laptop that nothing has synced since March.
      sync.resetForTest({ state: 'on', etag: '"a"', revision: 1, dirty: true });
      fetchStub.mockResolvedValue(respond(500, { error: 'boom' }));

      await sync.push();
      expect(sync.error()).toBeNull();

      for (let attempt = 0; attempt < 4; attempt += 1) {
        await sync.push();
      }
      expect(sync.error()).not.toBeNull();
      expect(sync.record().dirty).toBe(true);
    });
  });

  describe('noteLocalChange', () => {
    it('marks the browser dirty while syncing', () => {
      sync.resetForTest({ state: 'on', etag: '"a"', revision: 1 });
      sync.noteLocalChange();
      expect(sync.record().dirty).toBe(true);
      sync.cancelPush();
    });

    it('does nothing when sync is off', () => {
      sync.resetForTest({ state: 'off' });
      sync.noteLocalChange();
      expect(sync.record().dirty).toBeFalsy();
    });
  });

  it('never stores its own sync state in an uploaded document', async () => {
    // A document describing its own sync position would be describing the wrong
    // browser the moment it arrived somewhere else.
    localStorage.setItem(PREFS, '{"theme":"light"}');
    sync.resetForTest({ state: 'on', etag: '"a"', revision: 1, dirty: true });
    fetchStub.mockResolvedValue(respond(200, { ok: true, etag: '"b"', revision: 2 }));

    await sync.push();

    const put = calls.find((call) => call.init.method === 'PUT')!;
    const body = JSON.parse(put.init.body as string) as { values: Record<string, string> };
    expect(body.values[PROFILE_SYNC_KEY]).toBeUndefined();
    expect(Object.keys(body.values)).not.toContain('mockingbird_profile_writer');
  });
});
