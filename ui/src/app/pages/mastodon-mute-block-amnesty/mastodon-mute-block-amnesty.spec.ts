import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BulkActions, BulkJob } from '../../bulk-actions';
import { AmnestyWorkbench } from './amnesty-workbench';
import { MastodonMuteBlockAmnesty } from './mastodon-mute-block-amnesty';

describe('MastodonMuteBlockAmnesty', () => {
  beforeEach(() => localStorage.clear());

  async function page(data: Record<string, unknown>): Promise<HTMLElement> {
    TestBed.configureTestingModule({
      imports: [MastodonMuteBlockAmnesty],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { data } } },
      ],
    });
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(MastodonMuteBlockAmnesty);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('signed out, names Mute Amnesty and Block Amnesty and signs in back to this page', async () => {
    const root = await page({});
    expect(root.querySelector('h1')?.textContent).toContain('Unmute and unblock everyone');
    expect(root.textContent).toContain('Mute Amnesty');
    expect(root.textContent).toContain('Block Amnesty');
    expect(root.querySelector('.sign-in-choices a')?.getAttribute('href')).toBe(
      '/login/mastodon?next=%2Fmastodon-mute-block-amnesty',
    );
    expect(root.querySelector('app-amnesty-workbench')).toBeNull();
  });

  it('signed in, shows the amnesties instead of the pitch', async () => {
    const root = await page({ inShell: true });
    expect(root.querySelector('.steps')).toBeNull();
    expect(root.querySelector('.sign-in-choices')).toBeNull();
  });
});

function doneJob(action: BulkJob['action']): BulkJob {
  return {
    action,
    phase: 'done',
    total: 2,
    done: 2,
    changed: 2,
    skipped: 0,
    failed: 0,
    startedAt: Date.now(),
    pausedUntil: null,
  };
}

describe('AmnestyWorkbench', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [AmnestyWorkbench],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
  });

  it('starts an amnesty only after its count-first dialog is confirmed', () => {
    const start = vi.spyOn(TestBed.inject(BulkActions), 'start').mockResolvedValue(undefined);
    const fixture = TestBed.createComponent(AmnestyWorkbench);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    const [mute, block] = root.querySelectorAll<HTMLButtonElement>('section button');
    expect(mute.textContent).toContain('Review Mute Amnesty');
    expect(block.textContent).toContain('Review Block Amnesty');

    block.click();
    fixture.detectChanges();
    expect(root.querySelector('app-bulk-actions-dialog')).not.toBeNull();
    expect(start).not.toHaveBeenCalled();
    (fixture.componentInstance as unknown as { confirm(): void }).confirm();
    expect(start).toHaveBeenCalledWith('block-amnesty');
  });

  it('offers the next steps once an amnesty has finished, not another bulk job', () => {
    const bulk = TestBed.inject(BulkActions);
    const fixture = TestBed.createComponent(AmnestyWorkbench);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    bulk.job.set(doneJob('reblogs-off'));
    fixture.detectChanges();
    expect(root.querySelector('app-focused-next-steps')).toBeNull();

    bulk.job.set(doneJob('mute-amnesty'));
    fixture.detectChanges();
    expect(root.querySelector('app-focused-next-steps')).not.toBeNull();
  });
});
