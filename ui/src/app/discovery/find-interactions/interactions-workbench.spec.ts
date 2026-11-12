import { Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Status } from '../../platform/api/models';
import { StatusCard } from '../../posts/status-card/status-card';
import { InteractionFinder } from './interaction-finder';
import { InteractionsWorkbench } from './interactions-workbench';

@Component({ selector: 'app-status-card', template: '{{ status().id }}' })
class FakeCard {
  readonly status = input.required<Status>();
}

describe('InteractionsWorkbench', () => {
  const find = vi.fn();
  const navigate = vi.fn().mockResolvedValue(true);

  beforeEach(() => {
    find.mockReset();
    navigate.mockClear();
  });

  async function render(params: Record<string, string>) {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(params) } },
        },
        { provide: Router, useValue: { navigate } },
      ],
    });
    TestBed.overrideComponent(InteractionsWorkbench, {
      remove: { imports: [StatusCard] },
      add: { imports: [FakeCard] },
    });
    const finder = TestBed.inject(InteractionFinder);
    vi.spyOn(finder, 'find').mockImplementation(find);
    const fixture = TestBed.createComponent(InteractionsWorkbench);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('runs a linked search on arrival and lists what passed between them', async () => {
    find.mockResolvedValue({
      network: 'mastodon',
      posts: [{ id: 'p1' }, { id: 'p2' }],
      scanned: [200, 120],
      searched: false,
    });
    const el = await render({ a: '@alice@a.example', b: '@bob@b.example' });
    expect(find).toHaveBeenCalledWith('@alice@a.example', '@bob@b.example');
    expect([...el.querySelectorAll('app-status-card')].map((c) => c.textContent)).toEqual([
      'p1',
      'p2',
    ]);
    expect(el.textContent).toContain('2 posts between them.');
    expect(el.textContent).toContain(
      'Checked the latest 200 posts by @alice@a.example and 120 by @bob@b.example',
    );
  });

  it('explains, without reading anything, why two networks cannot be compared', async () => {
    const el = await render({ a: '@alice@a.example', b: 'bob.bsky.social' });
    expect(find).not.toHaveBeenCalled();
    expect(el.querySelector('mb-notice')?.textContent).toContain('different networks');
  });

  it('waits for two handles before reading', async () => {
    await render({ a: '@alice@a.example' });
    expect(find).not.toHaveBeenCalled();
  });
});
