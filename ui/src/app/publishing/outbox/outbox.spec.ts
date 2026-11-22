import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectionMeter } from '../../platform/network/connection-meter';
import {
  OUTBOX_KEY,
  OutboxEntry,
  OutboxSummary,
  readOutbox,
} from '../../platform/offline/outbox-summary';
import { scopeSuffixForToken } from '../../platform/session/account-scope';
import { Drafts } from '../drafts';
import { OUTBOX_AUTO_SEND_MS, Outbox, outboxDecision, partKey, partOptions } from './outbox';

const ME = scopeSuffixForToken('tok-me');

function entry(overrides: Partial<OutboxEntry> = {}): OutboxEntry {
  return {
    id: 'op1',
    scope: ME,
    parts: ['one', 'two'],
    options: { visibility: 'unlisted', inReplyToId: 'parent', spoilerText: 'cw' },
    posted: [],
    createdAt: Date.now(),
    state: 'waiting',
    ...overrides,
  };
}

describe('outbox rules', () => {
  it('sends young posts and holds old ones for the reader', () => {
    const now = Date.now();
    expect(outboxDecision(entry({ createdAt: now - 60_000 }), now)).toBe('send');
    expect(outboxDecision(entry({ createdAt: now - OUTBOX_AUTO_SEND_MS - 1 }), now)).toBe('hold');
  });

  it('chains thread parts like compose and reuses its keys', () => {
    const e = entry({ posted: ['s1'] });
    expect(partOptions(e, 0)).toMatchObject({ inReplyToId: 'parent', spoilerText: 'cw' });
    expect(partOptions(e, 1)).toEqual({
      inReplyToId: 's1',
      visibility: 'unlisted',
      quoteApprovalPolicy: undefined,
      muteNotifications: undefined,
    });
    expect(partKey(e, 1)).toBe('op1:fedi:1');
  });
});

describe('Outbox', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('mastodon_mock_token', 'tok-me');
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  function seed(...entries: OutboxEntry[]): void {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(entries));
  }

  it('sends a queued thread in order with its idempotency keys, then forgets it', async () => {
    seed(entry());
    const outbox = TestBed.inject(Outbox);
    const done = outbox.flush();
    const first = await vi.waitFor(() => httpMock.expectOne('/api/v1/statuses'));
    expect(first.request.headers.get('Idempotency-Key')).toBe('op1:fedi:0');
    expect(first.request.body).toMatchObject({ status: 'one', in_reply_to_id: 'parent' });
    first.flush({ id: 's1' });
    const second = await vi.waitFor(() => httpMock.expectOne('/api/v1/statuses'));
    expect(second.request.headers.get('Idempotency-Key')).toBe('op1:fedi:1');
    expect(second.request.body).toMatchObject({ status: 'two', in_reply_to_id: 's1' });
    second.flush({ id: 's2' });
    await done;
    expect(readOutbox()).toEqual([]);
    expect(TestBed.inject(OutboxSummary).waiting()).toBe(0);
  });

  it('keeps waiting when there is still no connection', async () => {
    seed(entry({ parts: ['solo'] }));
    const outbox = TestBed.inject(Outbox);
    const done = outbox.flush();
    (await vi.waitFor(() => httpMock.expectOne('/api/v1/statuses'))).error(
      new ProgressEvent('error'),
      { status: 0 },
    );
    await done;
    expect(readOutbox()[0].state).toBe('waiting');
    expect(readOutbox()[0].note).toContain("Couldn't reach");
  });

  it('holds what the server refuses, and what is too old to send unasked', async () => {
    seed(
      entry({ id: 'old', createdAt: Date.now() - OUTBOX_AUTO_SEND_MS - 1000 }),
      entry({ id: 'bad', parts: ['nope'] }),
    );
    const outbox = TestBed.inject(Outbox);
    const done = outbox.flush();
    (await vi.waitFor(() => httpMock.expectOne('/api/v1/statuses'))).flush(
      { error: 'Validation failed' },
      { status: 422, statusText: 'Unprocessable' },
    );
    await done;
    const states = Object.fromEntries(readOutbox().map((e) => [e.id, e.state]));
    expect(states).toEqual({ old: 'held', bad: 'held' });
    expect(TestBed.inject(OutboxSummary).held()).toBe(2);
  });

  it('holds everything for review when the reader chose not to send on reconnect', async () => {
    TestBed.inject(OutboxSummary).setSendMode('review');
    seed(entry({ parts: ['wait'] }));
    await TestBed.inject(Outbox).flush();
    httpMock.expectNone('/api/v1/statuses');
    expect(readOutbox()[0].state).toBe('held');
    expect(TestBed.inject(OutboxSummary).held()).toBe(1);
  });

  it("never sends another account's post", async () => {
    seed(entry({ scope: scopeSuffixForToken('tok-someone-else') }));
    await TestBed.inject(Outbox).flush();
    httpMock.expectNone('/api/v1/statuses');
    expect(readOutbox()).toHaveLength(1);
  });

  it('flushes by itself when the connection comes back', async () => {
    const meter = TestBed.inject(ConnectionMeter);
    meter.hints.set({ online: false });
    seed(entry({ parts: ['later'] }));
    TestBed.inject(Outbox);
    TestBed.tick();
    httpMock.expectNone('/api/v1/statuses');
    meter.hints.set({ online: true });
    TestBed.tick();
    (await vi.waitFor(() => httpMock.expectOne('/api/v1/statuses'))).flush({ id: 'x' });
    await vi.waitFor(() => expect(readOutbox()).toEqual([]));
  });

  it('moves the unsent rest of a thread back to Drafts', () => {
    seed(entry({ posted: ['s1'] }));
    const outbox = TestBed.inject(Outbox);
    expect(outbox.toDraft('op1')).toBe(true);
    const draft = TestBed.inject(Drafts).drafts()[0];
    expect(draft.segments).toEqual(['two']);
    expect(draft.inReplyToId).toBe('s1');
    expect(readOutbox()).toEqual([]);
  });
});
