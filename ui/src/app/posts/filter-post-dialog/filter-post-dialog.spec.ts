import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ContentFilter, FilterResult, Status } from '../../platform/api/models';
import { FilterPostDialog } from './filter-post-dialog';

interface Internals {
  choice: { (): string; set(v: string): void };
  newTitle: { (): string; set(v: string): void };
  canSave: () => boolean;
  error: () => string;
  save(): Promise<void>;
}

const existing: ContentFilter = {
  id: 'f1',
  title: 'Spoilers',
  context: ['home', 'public'],
  expires_at: null,
  filter_action: 'warn',
  keywords: [],
  statuses: [],
};

describe('FilterPostDialog', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function open(filters: ContentFilter[]) {
    const f: ComponentFixture<FilterPostDialog> = TestBed.createComponent(FilterPostDialog);
    f.componentRef.setInput('status', { id: 's9' } as Status);
    const results: FilterResult[] = [];
    f.componentInstance.filtered.subscribe((r) => results.push(r));
    f.detectChanges();
    http.expectOne('/api/v2/filters').flush(filters);
    f.detectChanges();
    return { ui: f.componentInstance as unknown as Internals, results };
  }

  it('adds the post to an existing filter and reports it like a server match', async () => {
    const { ui, results } = open([existing]);
    expect(ui.choice()).toBe('f1');

    const saving = ui.save();
    const add = http.expectOne('/api/v2/filters/f1/statuses');
    expect(add.request.method).toBe('POST');
    expect(add.request.body).toEqual({ status_id: 's9' });
    add.flush({ id: 'fs1', status_id: 's9' });
    await saving;

    expect(results).toEqual([
      {
        filter: {
          id: 'f1',
          title: 'Spoilers',
          context: ['home', 'public'],
          expires_at: null,
          filter_action: 'warn',
        },
        keyword_matches: null,
        status_matches: ['s9'],
      },
    ]);
  });

  it('creates a hiding filter first when there is none', async () => {
    const { ui, results } = open([]);
    expect(ui.choice()).toBe('__new__');
    ui.newTitle.set('Not for me');

    const saving = ui.save();
    const create = http.expectOne('/api/v2/filters');
    expect(create.request.body).toEqual({
      title: 'Not for me',
      context: ['home', 'public', 'thread', 'account'],
      filter_action: 'hide',
    });
    create.flush({ ...existing, id: 'f2', title: 'Not for me', filter_action: 'hide' });
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    http.expectOne('/api/v2/filters/f2/statuses').flush({ id: 'fs2', status_id: 's9' });
    await saving;
    expect(results[0].filter.filter_action).toBe('hide');
  });

  it('keeps the dialog open with a reason when the server refuses', async () => {
    const { ui, results } = open([existing]);
    const saving = ui.save();
    http
      .expectOne('/api/v2/filters/f1/statuses')
      .flush({ error: 'Validation failed' }, { status: 422, statusText: 'Unprocessable' });
    await saving;
    expect(results).toEqual([]);
    expect(ui.error()).toContain('The post was not filtered.');
  });

  it('needs a name for a new filter', () => {
    const { ui } = open([]);
    ui.newTitle.set('  ');
    expect(ui.canSave()).toBe(false);
  });
});
