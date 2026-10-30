import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BulkActions, BulkJob } from '../../bulk-actions';
import { BoostsWorkbench } from './boosts-workbench';
import { TurnOffBoostsMastodon } from './turn-off-boosts-mastodon';

describe('TurnOffBoostsMastodon', () => {
  beforeEach(() => localStorage.clear());

  async function page(data: Record<string, unknown>): Promise<HTMLElement> {
    TestBed.configureTestingModule({
      imports: [TurnOffBoostsMastodon],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { data } } },
      ],
    });
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(TurnOffBoostsMastodon);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('signed out, explains it unfollows nobody and signs in back to this page', async () => {
    const root = await page({});
    expect(root.querySelector('h1')?.textContent).toContain('Turn off boosts on Mastodon');
    expect(root.querySelectorAll('.steps li')).toHaveLength(3);
    expect(root.textContent).toContain('Does this unfollow anyone?');
    expect(root.querySelector('.sign-in-choices a')?.getAttribute('href')).toBe(
      '/login/mastodon?next=%2Fturn-off-boosts-mastodon',
    );
    expect(root.querySelector('app-boosts-workbench')).toBeNull();
  });

  it('signed in, shows the action instead of the pitch', async () => {
    const root = await page({ inShell: true });
    expect(root.querySelector('.steps')).toBeNull();
    expect(root.querySelector('.sign-in-choices')).toBeNull();
  });
});

function doneJob(action: BulkJob['action']): BulkJob {
  return {
    action,
    phase: 'done',
    total: 3,
    done: 3,
    changed: 2,
    skipped: 1,
    failed: 0,
    startedAt: Date.now(),
    pausedUntil: null,
  };
}

describe('BoostsWorkbench', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [BoostsWorkbench],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
  });

  it('starts nothing until the count-first dialog is confirmed', () => {
    const bulk = TestBed.inject(BulkActions);
    const start = vi.spyOn(bulk, 'start').mockResolvedValue(undefined);
    const fixture = TestBed.createComponent(BoostsWorkbench);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    root.querySelector<HTMLButtonElement>('section button')!.click();
    fixture.detectChanges();
    expect(root.querySelector('app-bulk-actions-dialog')).not.toBeNull();
    expect(start).not.toHaveBeenCalled();

    (fixture.componentInstance as unknown as { confirm(): void }).confirm();
    fixture.detectChanges();
    expect(start).toHaveBeenCalledWith('reblogs-off');
    expect(root.querySelector('app-bulk-actions-dialog')).toBeNull();
  });

  it('offers the next steps once a boosts job has finished, not before', () => {
    const bulk = TestBed.inject(BulkActions);
    const fixture = TestBed.createComponent(BoostsWorkbench);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('app-focused-next-steps')).toBeNull();

    bulk.job.set(doneJob('reblogs-off'));
    fixture.detectChanges();
    expect(root.querySelector('app-focused-next-steps')).not.toBeNull();

    // Another bulk job finishing is not this page's task being done.
    bulk.job.set(doneJob('mute-amnesty'));
    fixture.detectChanges();
    expect(root.querySelector('app-focused-next-steps')).toBeNull();
  });
});
