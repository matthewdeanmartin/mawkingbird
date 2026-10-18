import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppDialogs } from '../../app-dialogs';
import { WatchQueue } from '../../providers/videos/watch-queue';
import { WatchQueuePage } from './watch-queue-page';

describe('WatchQueuePage', () => {
  let fixture: ComponentFixture<WatchQueuePage>;
  let queue: WatchQueue;
  const confirm = vi.fn<(message: string) => Promise<boolean>>();

  beforeEach(() => {
    localStorage.clear();
    confirm.mockReset();
    TestBed.configureTestingModule({
      imports: [WatchQueuePage],
      providers: [provideRouter([]), { provide: AppDialogs, useValue: { confirm } }],
    });
    queue = TestBed.inject(WatchQueue);
  });

  function mount(): HTMLElement {
    fixture = TestBed.createComponent(WatchQueuePage);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const titles = (host: HTMLElement) =>
    [...host.querySelectorAll('li strong')].map((el) => el.textContent?.trim());

  it('says how to fill an empty queue', () => {
    expect(mount().textContent).toContain('Nothing queued yet');
  });

  it('lists videos in play order with Watch links and reorders them', () => {
    queue.add({ title: 'First', params: { youtube: 'aaaaaaaaaaa' } });
    queue.add({
      title: '',
      params: { post: '7', server: 'https://a.example', youtube: 'bbbbbbbbbbb' },
    });
    const host = mount();
    expect(titles(host)).toEqual(['First', 'Untitled video']);
    expect(host.querySelector('li a')!.getAttribute('href')).toBe('/watch?youtube=aaaaaaaaaaa');
    expect(host.querySelectorAll('li')[1].textContent).toContain('Fediverse post');

    const firstUp = host.querySelector('li button') as HTMLButtonElement;
    expect(firstUp.disabled).toBe(true);
    const secondUp = host.querySelectorAll('li')[1].querySelector('button') as HTMLButtonElement;
    secondUp.click();
    fixture.detectChanges();
    expect(titles(host)).toEqual(['Untitled video', 'First']);
  });

  it('clears only after confirmation', async () => {
    queue.add({ title: 'First', params: { youtube: 'aaaaaaaaaaa' } });
    const host = mount();
    const clear = [...host.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Clear queue'),
    )!;

    confirm.mockResolvedValue(false);
    clear.click();
    await fixture.whenStable();
    expect(queue.items()).toHaveLength(1);

    confirm.mockResolvedValue(true);
    clear.click();
    await fixture.whenStable();
    expect(confirm).toHaveBeenLastCalledWith(
      'Remove everything from your watch queue?',
      expect.anything(),
    );
    expect(queue.items()).toEqual([]);
  });
});
