import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientPrefs } from '../../../platform/storage/client-prefs';
import { Status } from '../../../platform/api/models';
import { POST_HISTORY_PAGE, PostHistory } from '../../../publishing/post-history';
import { HistoryPanel } from './history-panel';

const status = (id: string, text = `post ${id}`) =>
  ({
    id,
    url: `https://home.example/@a/${id}`,
    content: `<p>${text}</p>`,
    spoiler_text: '',
    account: { acct: `author${id}`, display_name: '' },
    reblog: null,
  }) as unknown as Status;

describe('HistoryPanel', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('mastodon_mock_token', 'alice');
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => vi.restoreAllMocks());

  function render() {
    const fixture = TestBed.createComponent(HistoryPanel);
    fixture.detectChanges();
    return fixture;
  }

  it('says how to start when nothing has been seen yet', () => {
    const el = render().nativeElement as HTMLElement;
    expect(el.textContent).toContain('Posts appear here as they scroll past');
    http.expectNone(() => true);
  });

  it('asks for one page of cards and shows the remembered snippet for posts that are gone', async () => {
    const history = TestBed.inject(PostHistory);
    for (let i = 0; i < POST_HISTORY_PAGE + 3; i++) history.record(status(String(i)));
    const fixture = render();
    const batches = http.match((r) => r.url === '/api/v1/statuses');
    const asked = batches.flatMap((b) => b.request.params.getAll('id[]'));
    expect(asked).toHaveLength(POST_HISTORY_PAGE);
    for (const batch of batches) batch.flush([]);
    const el = fixture.nativeElement as HTMLElement;
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(el.textContent).toContain('Could not load this post');
    });
    expect(el.textContent).toContain(`post ${POST_HISTORY_PAGE + 2}`);
    expect(el.textContent).toContain('Load more');
  });

  it('filters by remembered text without any request', () => {
    const history = TestBed.inject(PostHistory);
    history.record(status('1', 'about cats'));
    history.record(status('2', 'about dogs'));
    const fixture = render();
    http.match(() => true);
    const input = fixture.nativeElement.querySelector('#history-filter-input') as HTMLInputElement;
    input.value = 'CATS';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('1 of 2 remembered posts');
    http.expectNone(() => true);
  });

  it('clears only after a second, confirming press', () => {
    TestBed.inject(PostHistory).record(status('1'));
    const fixture = render();
    http.match(() => true);
    const button = () =>
      fixture.nativeElement.querySelector('mb-toolbar button') as HTMLButtonElement;
    button().click();
    fixture.detectChanges();
    expect(button().textContent).toContain('Really clear all 1?');
    expect(TestBed.inject(PostHistory).current()!.entries()).toHaveLength(1);
    button().click();
    fixture.detectChanges();
    expect(TestBed.inject(PostHistory).current()!.entries()).toEqual([]);
  });

  it('says when recording is off, but still shows what is kept', () => {
    TestBed.inject(PostHistory).record(status('1'));
    TestBed.inject(ClientPrefs).setPostHistory(false);
    const fixture = render();
    http.match(() => true);
    expect(fixture.nativeElement.textContent).toContain('History is off');
    expect(fixture.nativeElement.textContent).toContain('post 1');
  });
});
