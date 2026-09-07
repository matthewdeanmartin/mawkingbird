import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WritableSignal } from '@angular/core';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { afterEach, describe, expect, it } from 'vitest';
import { ContentFilter, FilterAction, FilterContext } from '../../../models';
import { SettingsFilterEdit } from './settings-filter-edit';

interface KeywordRow {
  id: string | null;
  keyword: string;
  whole_word: boolean;
}

interface SettingsFilterEditInternals {
  title: WritableSignal<string>;
  contexts: WritableSignal<FilterContext[]>;
  action: WritableSignal<FilterAction>;
  keywords: WritableSignal<KeywordRow[]>;
  error: WritableSignal<string | null>;
  addKeywordRow(): void;
  removeKeywordRow(index: number): void;
  setKeyword(index: number, key: 'keyword' | 'whole_word', value: string | boolean): void;
  save(): void;
}

function internals(fixture: ComponentFixture<SettingsFilterEdit>): SettingsFilterEditInternals {
  return fixture.componentInstance as unknown as SettingsFilterEditInternals;
}

function makeFilter(): ContentFilter {
  return {
    id: '42',
    title: 'Spoilers',
    context: ['home', 'public'],
    expires_at: null,
    filter_action: 'hide',
    keywords: [{ id: 'k1', keyword: 'finale', whole_word: true }],
    statuses: [],
  };
}

describe('SettingsFilterEdit', () => {
  let httpMock: HttpTestingController;

  function configure(routeId: string | null): void {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        // The component navigates to /settings/filters after saving; give the
        // test router a componentless match so that navigation resolves.
        provideRouter([{ path: 'settings', children: [{ path: 'filters', children: [] }] }]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: new Map([['id', routeId]]) } },
        },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
  }

  afterEach(() => {
    httpMock.verify();
  });

  it('creates a new filter with keywords_attributes', () => {
    configure(null);
    const fixture = TestBed.createComponent(SettingsFilterEdit);
    fixture.detectChanges();

    const c = internals(fixture);
    c.title.set('Politics');
    c.setKeyword(0, 'keyword', 'election');
    c.save();

    const req = httpMock.expectOne('/api/v2/filters');
    expect(req.request.method).toBe('POST');
    expect(req.request.body.title).toBe('Politics');
    expect(req.request.body.keywords_attributes).toEqual([
      { keyword: 'election', whole_word: true },
    ]);
    req.flush(makeFilter());
  });

  it('requires a title before saving', () => {
    configure(null);
    const fixture = TestBed.createComponent(SettingsFilterEdit);
    fixture.detectChanges();

    const c = internals(fixture);
    c.save();
    expect(c.error()).toBe('A title is required.');
    httpMock.expectNone('/api/v2/filters');
  });

  it('loads an existing filter and saves changes + keyword removals', () => {
    configure('42');
    const fixture = TestBed.createComponent(SettingsFilterEdit);
    fixture.detectChanges();
    httpMock.expectOne('/api/v2/filters/42').flush(makeFilter());

    const c = internals(fixture);
    expect(c.title()).toBe('Spoilers');
    expect(c.keywords()).toEqual([{ id: 'k1', keyword: 'finale', whole_word: true }]);

    c.removeKeywordRow(0);
    c.addKeywordRow();
    c.setKeyword(0, 'keyword', 'ending');
    c.save();

    const update = httpMock.expectOne('/api/v2/filters/42');
    expect(update.request.method).toBe('PUT');
    expect(update.request.body.title).toBe('Spoilers');
    update.flush(makeFilter());

    const del = httpMock.expectOne('/api/v2/filters/keywords/k1');
    expect(del.request.method).toBe('DELETE');
    del.flush({});

    const add = httpMock.expectOne('/api/v2/filters/42/keywords');
    expect(add.request.method).toBe('POST');
    expect(add.request.body).toEqual({ keyword: 'ending', whole_word: true });
    add.flush({ id: 'k2', keyword: 'ending', whole_word: true });
  });
});
