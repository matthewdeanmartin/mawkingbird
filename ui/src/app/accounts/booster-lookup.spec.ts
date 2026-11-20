import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { Status } from '../platform/api/models';
import { BoosterLookup, REFINE_CALL_BUDGET } from './booster-lookup';

function status(id: string, reblogs: number, extra: Partial<Status> = {}): Status {
  return { id, reblogs_count: reblogs, reblog: null, ...extra } as Status;
}

const booster = (id: string, followers: number) => ({
  id,
  username: id,
  acct: id,
  followers_count: followers,
});

describe('BoosterLookup', () => {
  let http: HttpTestingController;
  let lookup: BoosterLookup;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    lookup = TestBed.inject(BoosterLookup);
  });

  const pendingCalls = () => http.match((req) => req.url.includes('/reblogged_by'));

  it('asks nothing until refine is called, then two at a time, most-boosted first', () => {
    const sample = [status('a', 1), status('b', 9), status('c', 0), status('d', 4)];
    expect(lookup.cost(sample)).toBe(3);
    expect(pendingCalls()).toHaveLength(0);

    lookup.refine(sample);
    const first = pendingCalls();
    expect(first.map((r) => r.request.url)).toEqual([
      '/api/v1/statuses/b/reblogged_by',
      '/api/v1/statuses/d/reblogged_by',
    ]);
    expect(first[0].request.params.get('limit')).toBe('80');
    first[0].flush([booster('x', 100)]);
    first[1].flush([]);
    pendingCalls()[0].flush([booster('y', 5)]);

    expect(lookup.run()).toEqual({ total: 3, finished: 3, ended: 'done' });
    expect(lookup.boostersOf(sample[1])).toEqual([{ id: 'x', followers_count: 100 }]);
    expect(lookup.boostersOf(sample[2])).toBeNull();
    expect(lookup.cost(sample)).toBe(0);
  });

  it(`spends at most ${REFINE_CALL_BUDGET} calls per refine`, () => {
    const sample = Array.from({ length: REFINE_CALL_BUDGET + 5 }, (_, i) => status(`s${i}`, 1));
    lookup.refine(sample);
    expect(lookup.run()?.total).toBe(REFINE_CALL_BUDGET);
    for (let i = 0; i < REFINE_CALL_BUDGET; i++) pendingCalls().forEach((r) => r.flush([]));
    expect(lookup.cost(sample)).toBe(5);
  });

  it('stops on a rate limit and keeps what it found', () => {
    const sample = [status('a', 3), status('b', 2), status('c', 1)];
    lookup.refine(sample);
    const [a, b] = pendingCalls();
    a.flush([booster('x', 10)]);
    b.flush(null, { status: 429, statusText: 'Too Many Requests' });
    expect(lookup.run()?.ended).toBe('rateLimited');
    // The call that started after `a` finished is abandoned, not left running.
    expect(pendingCalls().every((r) => r.cancelled)).toBe(true);
    expect(lookup.boostersOf(sample[0])).toHaveLength(1);
    expect(lookup.cost(sample)).toBe(2);
  });

  it('skips a post whose server refuses the list, without retrying it', () => {
    const sample = [status('a', 2), status('b', 1)];
    lookup.refine(sample);
    const [a, b] = pendingCalls();
    a.flush(null, { status: 404, statusText: 'Not Found' });
    b.flush([]);
    expect(lookup.run()?.ended).toBe('done');
    expect(lookup.boostersOf(sample[0])).toBeNull();
    expect(lookup.cost(sample)).toBe(0);
  });

  it('can be stopped', () => {
    lookup.refine([status('a', 1), status('b', 1), status('c', 1)]);
    lookup.cancel();
    expect(lookup.run()?.ended).toBe('cancelled');
    expect(pendingCalls().every((r) => r.cancelled)).toBe(true);
  });

  it("reads anonymously from the post's own server with its raw id", () => {
    const anon = status('anonymous-mastodon:far.example:77', 1, {
      providerRef: { server: 'https://far.example', statusId: '77', accountId: '1' },
    } as Partial<Status>);
    lookup.refine([anon], { server: 'https://far.example', id: '1' });
    const [req] = pendingCalls();
    expect(req.request.url).toBe('https://far.example/api/v1/statuses/77/reblogged_by');
    req.flush([booster('z', 3)]);
    expect(lookup.boostersOf(anon)).toHaveLength(1);
  });
});
