import { HttpHeaders, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Signal, WritableSignal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { translocoTesting } from '../../i18n/i18n.testing';
import { ScheduledStatus } from '../../models';
import { Cadence, DAILY_LIMIT, toLocalInput } from './schedule-plan';
import { ScheduleWorkbench } from './schedule-workbench';

const LIST = '/api/v1/scheduled_statuses';
const POST = '/api/v1/statuses';

interface Internals {
  cadence: WritableSignal<Cadence>;
  rows: Signal<{ key: string; text: string; pinnedAt: string | null; error: string | null }[]>;
  canSend: Signal<boolean>;
  setText(index: number, text: string): void;
  removeRow(index: number): void;
  send(): Promise<void>;
  pendingCancel: WritableSignal<ScheduledStatus | null>;
  confirmCancel(): void;
}

function scheduled(id: string, at: string, text = `post ${id}`): ScheduledStatus {
  return { id, scheduled_at: at, params: { text }, media_attachments: [] };
}

/** An upcoming (not parked) scheduled time, `days` from now. */
function soon(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

/** A cadence start comfortably in the future, on its own UTC day. */
function startIn(days: number): string {
  const at = new Date();
  at.setDate(at.getDate() + days);
  at.setHours(12, 0, 0, 0);
  return toLocalInput(at);
}

describe('ScheduleWorkbench', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<ScheduleWorkbench>;
  let wb: Internals;
  let el: HTMLElement;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [ScheduleWorkbench, translocoTesting()],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ScheduleWorkbench);
    wb = fixture.componentInstance as unknown as Internals;
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  async function settle(): Promise<void> {
    for (let i = 0; i < 6; i++) await Promise.resolve();
    fixture.detectChanges();
  }

  /** Answer the scheduled-posts load, one page per argument. */
  async function loadExisting(...pages: ScheduledStatus[][]): Promise<void> {
    for (const [i, page] of pages.entries()) {
      const req = http.expectOne((r) => r.url === LIST && r.method === 'GET');
      expect(req.request.params.get('limit')).toBe('40');
      const last = i === pages.length - 1;
      req.flush(page, {
        headers: last
          ? new HttpHeaders()
          : new HttpHeaders({
              Link: `<https://x.test${LIST}?max_id=${page.at(-1)!.id}>; rel="next"`,
            }),
      });
      await settle();
    }
  }

  function sendButton(): HTMLButtonElement {
    return [...el.querySelectorAll<HTMLButtonElement>('.send button')].at(-1)!;
  }

  it('reads every page of scheduled posts and lists the upcoming ones', async () => {
    expect(wb.canSend()).toBe(false);
    await loadExisting(
      [scheduled('3', soon(3)), scheduled('2', soon(2))],
      [scheduled('1', soon(1))],
    );
    const items = el.querySelectorAll('.upcoming li');
    expect(items).toHaveLength(3);
    // Soonest first, whatever order the pages came in.
    expect(items[0].textContent).toContain('post 1');
    expect(el.textContent).toContain('3 of 300 scheduled slots in use');
  });

  it('leaves parked far-future drafts off the upcoming list but counts them', async () => {
    const farOut = new Date();
    farOut.setFullYear(farOut.getFullYear() + 20);
    await loadExisting([scheduled('p', farOut.toISOString()), scheduled('1', soon(1))]);
    expect(el.querySelectorAll('.upcoming li')).toHaveLength(1);
    expect(el.textContent).toContain('2 of 300 scheduled slots in use');
  });

  it('schedules each post on the cadence with its own idempotency key, then shows next steps', async () => {
    await loadExisting([]);
    wb.cadence.set({ start: startIn(2), every: 1, unit: 'days' });
    wb.removeRow(2);
    wb.setText(0, 'first');
    wb.setText(1, 'second');
    fixture.detectChanges();
    expect(sendButton().textContent).toContain('Schedule 2 posts');
    expect(el.querySelector('app-focused-next-steps')).toBeNull();
    const keys = wb.rows().map((row) => row.key);

    sendButton().click();
    await settle();
    const first = http.expectOne(POST);
    expect(first.request.body.status).toBe('first');
    expect(first.request.body.scheduled_at).toBe(new Date(startIn(2)).toISOString());
    expect(first.request.headers.get('Idempotency-Key')).toBe(keys[0]);
    first.flush({ id: 's1' });
    await settle();
    const second = http.expectOne(POST);
    expect(second.request.body.scheduled_at).toBe(new Date(startIn(3)).toISOString());
    expect(second.request.headers.get('Idempotency-Key')).toBe(keys[1]);
    second.flush({ id: 's2' });
    await settle();

    await loadExisting([scheduled('s1', soon(1))]);
    expect(wb.rows()).toHaveLength(1);
    expect(wb.rows()[0].text).toBe('');
    expect(el.textContent).toContain('Scheduled 2 posts');
    expect(el.querySelector('app-focused-next-steps')).not.toBeNull();
  });

  it('keeps a refused post, with the reason, pinned to its time and key for a retry', async () => {
    await loadExisting([]);
    wb.cadence.set({ start: startIn(2), every: 1, unit: 'days' });
    wb.removeRow(2);
    wb.setText(0, 'lands');
    wb.setText(1, 'refused');
    const refusedKey = wb.rows()[1].key;

    // send() awaits each post in turn: answer them as they arrive.
    const sending = wb.send();
    await settle();
    http.expectOne(POST).flush({ id: 's1' });
    await settle();
    http
      .expectOne(POST)
      .flush(
        { error: 'Scheduled at the specified time limit exceeded' },
        { status: 422, statusText: 'Unprocessable' },
      );
    await settle();
    // The batch ends by re-reading the list; answer that before awaiting it.
    await loadExisting([]);
    await sending;
    fixture.detectChanges();

    expect(wb.rows()).toHaveLength(1);
    const [left] = wb.rows();
    expect(left.text).toBe('refused');
    expect(left.key).toBe(refusedKey);
    expect(left.error).toBe('Scheduled at the specified time limit exceeded');
    // Its own slot, not the one the first post vacated.
    expect(left.pinnedAt).toBe(startIn(3));
    expect(el.textContent).toContain('Scheduled 1 post.');
    expect(el.textContent).toContain('One post was not scheduled');
  });

  it('will not send past the daily limit', async () => {
    const start = startIn(2);
    const day = new Date(start).toISOString();
    await loadExisting(Array.from({ length: DAILY_LIMIT }, (_, i) => scheduled(`e${i}`, day)));
    wb.cadence.set({ start, every: 1, unit: 'days' });
    wb.removeRow(2);
    wb.removeRow(1);
    wb.setText(0, 'one too many');
    fixture.detectChanges();
    expect(wb.canSend()).toBe(false);
    expect(el.textContent).toContain(`Mastodon allows ${DAILY_LIMIT} a day`);
  });

  it('will not send a post due in under ten minutes', async () => {
    await loadExisting([]);
    wb.cadence.set({ start: toLocalInput(new Date(Date.now() + 60_000)), every: 1, unit: 'days' });
    wb.removeRow(2);
    wb.removeRow(1);
    wb.setText(0, 'too soon');
    fixture.detectChanges();
    expect(wb.canSend()).toBe(false);
    expect(el.textContent).toContain('At least 10 minutes from now');
  });

  it('keeps sending off and offers a retry when the scheduled list fails to load', async () => {
    http.expectOne((r) => r.url === LIST).flush('down', { status: 500, statusText: 'Error' });
    await settle();
    wb.setText(0, 'x');
    fixture.detectChanges();
    expect(wb.canSend()).toBe(false);
    expect(el.textContent).toContain("limits can't be checked yet");
  });

  it('cancels a scheduled post only after confirmation', async () => {
    await loadExisting([scheduled('1', soon(1))]);
    el.querySelector<HTMLButtonElement>('.upcoming button')!.click();
    fixture.detectChanges();
    // Asking is not cancelling: nothing is sent until the dialog is confirmed.
    expect(el.querySelector('app-confirm-dialog')).not.toBeNull();
    http.expectNone({ url: `${LIST}/1`, method: 'DELETE' });
    wb.confirmCancel();
    http.expectOne({ url: `${LIST}/1`, method: 'DELETE' }).flush(null);
    fixture.detectChanges();
    expect(el.querySelectorAll('.upcoming li')).toHaveLength(0);
    expect(el.textContent).toContain('Nothing scheduled yet');
  });
});
