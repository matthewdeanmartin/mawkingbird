import { Component, computed, input, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Api } from '../../api';
import { RailOutlet } from '../../rail-outlet';
import { Auth } from '../../auth';
import { Discussion, summarize } from '../../forum/discussion';
import { ForumScan, ForumSource, ScanState } from '../../forum/forum-scan';
import { Status } from '../../models';
import { StatusCard } from '../../status-card/status-card';
import { post, reply, who } from '../../testing/forum-fixtures';
import { ForumPage } from './forum-page';

@Component({ selector: 'app-status-card', template: '<p class="card">{{ status().id }}</p>' })
class CardStub {
  readonly status = input.required<Status>();
}

function thread(id: string, starter: string, replier: string, extra: Partial<Status> = {}) {
  const root = post(id, starter, extra);
  const answer = reply(`${id}1`, replier, root);
  return {
    key: root.uri!,
    anchor: root,
    partial: false,
    posts: [root, answer],
    treeLoaded: true,
  } satisfies Discussion;
}

/** The scan's public surface, driven by the test. */
class FakeScan {
  source = signal<ForumSource | null>(null);
  state = signal<ScanState>('idle');
  callsUsed = signal(0);
  allowance = signal(10);
  postsSampled = signal(0);
  found = signal<Discussion[]>([]);
  following = signal<ReadonlySet<string>>(new Set());
  summaries = computed(() =>
    this.found().map((discussion) => summarize(discussion, who('me'), this.following())),
  );
  scanning = computed(() => this.state() === 'scanning');
  headroom = computed(() => 50 - this.callsUsed());
  canGoDeeper = computed(() => !this.scanning() && this.headroom() > 0);
  start = vi.fn((source: ForumSource) => {
    this.source.set(source);
    this.state.set('scanning');
  });
  deeper = vi.fn();
  stop = vi.fn(() => this.state.set('stopped'));
}

describe('ForumPage', () => {
  let fixture: ComponentFixture<ForumPage>;
  let scan: FakeScan;
  let lacksMastodonToken: boolean;

  beforeEach(() => {
    scan = new FakeScan();
    lacksMastodonToken = false;
    TestBed.configureTestingModule({
      imports: [ForumPage],
      providers: [
        provideRouter([]),
        { provide: ForumScan, useValue: scan },
        { provide: Api, useValue: { lists: () => of([{ id: '7', title: 'Friends' }]) } },
        {
          provide: Auth,
          useValue: {
            account: signal({ id: 'me' }),
            get lacksMastodonToken() {
              return lacksMastodonToken;
            },
          },
        },
      ],
    });
    TestBed.overrideComponent(ForumPage, {
      remove: { imports: [StatusCard] },
      add: { imports: [CardStub] },
    });
  });

  async function mount(queryParams: Record<string, string> = {}): Promise<HTMLElement> {
    await TestBed.inject(Router).navigate([], { queryParams });
    fixture = TestBed.createComponent(ForumPage);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  function cards(host: HTMLElement): string[] {
    return [...host.querySelectorAll('.card')].map((card) => card.textContent!.trim());
  }

  it('starts a scan of the source in the URL, and offers Stop while it runs', async () => {
    const host = await mount({ source: 'tag:rust' });
    expect(scan.start).toHaveBeenCalledWith({ kind: 'tag', name: 'rust' });
    expect(host.textContent).toContain('Looking for discussions');
    const stop = [...host.querySelectorAll('button')].find((b) => b.textContent!.includes('Stop'));
    stop!.click();
    expect(scan.stop).toHaveBeenCalled();
  });

  it('does not rescan when coming back to the same source', async () => {
    scan.source.set({ kind: 'home' });
    scan.state.set('spent');
    await mount();
    expect(scan.start).not.toHaveBeenCalled();
  });

  it('lists the discussions for the tab in the URL', async () => {
    scan.source.set({ kind: 'home' });
    scan.state.set('spent');
    scan.found.set([
      thread('1', 'a', 'b', { content: '<p>Why?</p>' }),
      thread('2', 'me', 'b'),
      thread('3', 'c', 'me'),
    ]);
    expect(cards(await mount())).toEqual(['3', '2', '1']);
    fixture.destroy();
    expect(cards(await mount({ filter: 'asked' }))).toEqual(['1']);
    fixture.destroy();
    expect(cards(await mount({ filter: 'joined' }))).toEqual(['3']);
  });

  it('applies the facet choices in the URL, and says when none match', async () => {
    scan.source.set({ kind: 'home' });
    scan.state.set('spent');
    scan.found.set([
      thread('1', 'a', 'b', { tags: [{ name: 'rust', url: '' }] }),
      thread('2', 'c', 'd'),
    ]);
    expect(cards(await mount({ tag: 'rust' }))).toEqual(['1']);
    fixture.destroy();
    const host = await mount({ tag: 'go' });
    expect(cards(host)).toEqual([]);
    expect(host.textContent).toContain('match these filters');
  });

  it('claims the shell’s rails for Forum, and gives them back on leaving', async () => {
    await mount();
    const outlet = TestBed.inject(RailOutlet);
    expect(outlet.left()?.labelKey).toBe('forum.facets.rail');
    expect(outlet.right()?.labelKey).toBe('forum.members.rail');
    fixture.destroy();
    expect(outlet.left()).toBeNull();
  });

  it('keeps rows in place as results arrive, and re-sorts on request', async () => {
    scan.source.set({ kind: 'home' });
    scan.state.set('scanning');
    scan.found.set([thread('1', 'a', 'b')]);
    const host = await mount();
    scan.found.set([thread('1', 'a', 'b'), thread('2', 'c', 'd')]);
    fixture.detectChanges();
    expect(cards(host)).toEqual(['1', '2']);
    const resort = host.querySelector<HTMLButtonElement>('.resort')!;
    expect(resort.textContent).toContain('Sort the list again');
    resort.click();
    fixture.detectChanges();
    expect(cards(host)).toEqual(['2', '1']);
  });

  it('offers Scan deeper once the allowance is spent, capped by the ceiling', async () => {
    scan.source.set({ kind: 'home' });
    scan.state.set('spent');
    scan.callsUsed.set(40);
    const host = await mount();
    const labels = [...host.querySelectorAll('.deeper button')].map((b) => b.textContent!.trim());
    expect(labels).toEqual(['Scan deeper (+10 calls)']);
    (host.querySelector('.deeper button') as HTMLButtonElement).click();
    expect(scan.deeper).toHaveBeenCalledWith(10);
  });

  it('explains an empty result rather than showing nothing', async () => {
    scan.source.set({ kind: 'home' });
    scan.state.set('exhausted');
    const host = await mount();
    expect(host.textContent).toContain('A discussion needs at least two people');
  });

  it('marks questions and partial threads', async () => {
    scan.source.set({ kind: 'home' });
    scan.state.set('spent');
    scan.found.set([{ ...thread('1', 'a', 'b', { content: '<p>Why?</p>' }), partial: true }]);
    const host = await mount();
    expect(host.textContent).toContain('Question');
    expect(host.textContent).toContain('Partial thread');
  });

  it('explains that Forum needs Mastodon instead of scanning', async () => {
    lacksMastodonToken = true;
    const host = await mount();
    expect(scan.start).not.toHaveBeenCalled();
    expect(host.textContent).toContain('Forum needs a Mastodon account');
  });

  it('puts the sort in the URL', async () => {
    scan.source.set({ kind: 'home' });
    scan.state.set('spent');
    const host = await mount();
    const popular = [...host.querySelectorAll('.sort button')].find((b) =>
      b.textContent!.includes('Popular'),
    ) as HTMLButtonElement;
    popular.click();
    await fixture.whenStable();
    expect(TestBed.inject(Router).url).toContain('sort=popular');
  });
});
