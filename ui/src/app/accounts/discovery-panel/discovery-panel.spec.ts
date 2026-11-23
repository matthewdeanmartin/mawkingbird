import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Api } from '../../platform/api/api';
import { Account, MastodonNotification, Status } from '../../platform/api/models';
import { CHECK_BATCH, CHECK_LIMIT, DiscoveryCheck } from '../discovery-check';
import { InteractionDecayScan } from '../interaction-decay-scan';
import { ReactionLogBuilder } from '../reaction-log';
import { TopBoostersPanel } from '../top-boosters-panel/top-boosters-panel';
import { DiscoveryPanel } from './discovery-panel';

const NOW = Date.now();

/** Every other person follows; all of them boosted the same post. */
function seedScan(people: number): void {
  const builder = new ReactionLogBuilder('me');
  for (let i = 0; i < people; i++) {
    builder.add({
      id: `n${i}`,
      type: 'reblog',
      created_at: new Date(NOW - i * 1000).toISOString(),
      account: { id: `p${i}`, acct: `p${i}`, username: `p${i}`, followers_count: i } as Account,
      status: { id: 's1', content: '<p>Hello there</p>', tags: [] } as unknown as Status,
    } as MastodonNotification);
  }
  TestBed.inject(InteractionDecayScan).state.set({
    phase: 'done',
    accountId: 'me',
    pages: 1,
    read: people,
    matched: 0,
    reachedBack: NOW - 86_400_000,
    oldestPost: 0,
    stop: 'serverEnd',
    log: builder.build(),
  });
}

describe('discovery check and panels', () => {
  const relationships = vi.fn((ids: string[]) =>
    of(ids.map((id) => ({ id, followed_by: Number(id.slice(1)) % 2 === 0 }))),
  );

  beforeEach(() => {
    relationships.mockClear();
    TestBed.configureTestingModule({
      imports: [DiscoveryPanel, TopBoostersPanel],
      providers: [provideRouter([]), { provide: Api, useValue: { relationships } }],
    });
  });

  function render(type: typeof DiscoveryPanel | typeof TopBoostersPanel) {
    const fixture = TestBed.createComponent<DiscoveryPanel | TopBoostersPanel>(type);
    fixture.componentRef.setInput('accountId', 'me');
    fixture.componentRef.setInput('posts', []);
    fixture.detectChanges();
    return fixture;
  }

  it('asks in batches and caps how many people it asks about', async () => {
    const check = TestBed.inject(DiscoveryCheck);
    await check.start(
      'me',
      Array.from({ length: CHECK_LIMIT + 50 }, (_, i) => `p${i}`),
    );
    expect(relationships).toHaveBeenCalledTimes(CHECK_LIMIT / CHECK_BATCH);
    expect(check.state()?.phase).toBe('done');
    expect(check.state()?.followsYou.size).toBe(CHECK_LIMIT);
  });

  it('keeps the answers received when a later batch fails', async () => {
    relationships
      .mockImplementationOnce((ids) => of(ids.map((id) => ({ id, followed_by: true }))))
      .mockImplementationOnce(() => throwError(() => new Error('boom')));
    const check = TestBed.inject(DiscoveryCheck);
    await check.start(
      'me',
      Array.from({ length: 60 }, (_, i) => `p${i}`),
    );
    expect(check.state()?.phase).toBe('failed');
    expect(check.state()?.followsYou.size).toBe(CHECK_BATCH);
  });

  it('shows no rate until the check has run, then the rate and the top post', async () => {
    const fixture = render(DiscoveryPanel);
    const root = fixture.nativeElement as HTMLElement;
    seedScan(10);
    fixture.detectChanges();
    expect(root.querySelector('dl')).toBeNull();
    await TestBed.inject(DiscoveryCheck).start(
      'me',
      Array.from({ length: 10 }, (_, i) => `p${i}`),
    );
    fixture.detectChanges();
    expect(root.querySelector('dl dd')?.textContent).toContain('50');
    const link = root.querySelector('.post a');
    expect(link?.textContent).toContain('Hello there');
    expect(link?.getAttribute('href')).toBe('/statuses/s1');
  });

  it('ignores a check that belongs to another account', async () => {
    const fixture = render(DiscoveryPanel);
    seedScan(10);
    await TestBed.inject(DiscoveryCheck).start('someone-else', ['p0']);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('dl')).toBeNull();
  });

  it('lists boosters by audience, ten at first, and re-sorts', () => {
    const fixture = render(TopBoostersPanel);
    const root = fixture.nativeElement as HTMLElement;
    seedScan(15);
    fixture.detectChanges();
    expect(root.querySelectorAll('li')).toHaveLength(10);
    expect(root.querySelector('li a')?.textContent).toContain('p14');
    const pressed = () => root.querySelector('.sorts [aria-pressed="true"]')?.textContent;
    const before = pressed();
    (root.querySelectorAll('.sorts button')[1] as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(pressed()).not.toBe(before);
  });
});
