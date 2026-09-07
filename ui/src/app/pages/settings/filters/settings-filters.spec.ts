import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WritableSignal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ContentFilter } from '../../../models';
import { SettingsFilters } from './settings-filters';

interface SettingsFiltersInternals {
  filters: WritableSignal<ContentFilter[]>;
  remove(filter: ContentFilter): void;
  keywordSummary(filter: ContentFilter): string;
}

function internals(fixture: ComponentFixture<SettingsFilters>): SettingsFiltersInternals {
  return fixture.componentInstance as unknown as SettingsFiltersInternals;
}

function makeFilter(id: string, keywords: string[] = []): ContentFilter {
  return {
    id,
    title: `Filter ${id}`,
    context: ['home'],
    expires_at: null,
    filter_action: 'warn',
    keywords: keywords.map((k, i) => ({ id: `${id}-${i}`, keyword: k, whole_word: true })),
    statuses: [],
  };
}

describe('SettingsFilters', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  function setUp(filters: ContentFilter[]): ComponentFixture<SettingsFilters> {
    const fixture = TestBed.createComponent(SettingsFilters);
    fixture.detectChanges();
    httpMock.expectOne('/api/v2/filters').flush(filters);
    return fixture;
  }

  it('lists filters and summarizes keywords', () => {
    const fixture = setUp([makeFilter('1', ['cats', 'dogs', 'birds', 'fish', 'mice'])]);
    const c = internals(fixture);
    expect(c.filters().length).toBe(1);
    expect(c.keywordSummary(c.filters()[0])).toBe('cats, dogs, birds, fish +1 more');
  });

  it('deletes a filter and removes the row', () => {
    const filter = makeFilter('7');
    const fixture = setUp([filter]);
    internals(fixture).remove(filter);
    const req = httpMock.expectOne('/api/v2/filters/7');
    expect(req.request.method).toBe('DELETE');
    req.flush({});
    expect(internals(fixture).filters()).toEqual([]);
  });
});
