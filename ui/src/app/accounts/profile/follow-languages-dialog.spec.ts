import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Account, Relationship } from '../../platform/api/models';
import { FollowLanguagesDialog } from './follow-languages-dialog';

interface Internals {
  chosen(): Set<string>;
  toggle(code: string, on: boolean): void;
  save(): void;
  error(): string;
}

const zoe = { id: 'z1', username: 'zoe', display_name: 'Zoe' } as Account;

describe('FollowLanguagesDialog', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function open(rel: Partial<Relationship>) {
    const f: ComponentFixture<FollowLanguagesDialog> =
      TestBed.createComponent(FollowLanguagesDialog);
    f.componentRef.setInput('account', zoe);
    f.componentRef.setInput('relationship', { id: 'z1', following: true, ...rel } as Relationship);
    const saved: Relationship[] = [];
    f.componentInstance.saved.subscribe((r) => saved.push(r));
    f.detectChanges();
    return { f, ui: f.componentInstance as unknown as Internals, saved };
  }

  it('re-follows with the chosen languages, keeping the boosts setting', () => {
    const { ui, saved } = open({ showing_reblogs: false, languages: ['de'] });
    expect([...ui.chosen()]).toEqual(['de']);
    ui.toggle('en', true);
    ui.save();
    const req = http.expectOne('/api/v1/accounts/z1/follow');
    expect(req.request.body).toEqual({ reblogs: false, languages: ['de', 'en'] });
    req.flush({ id: 'z1', following: true, languages: ['de', 'en'] });
    expect(saved[0].languages).toEqual(['de', 'en']);
  });

  it('sends null for every language when nothing is ticked', () => {
    const { ui } = open({ languages: ['de'] });
    ui.toggle('de', false);
    ui.save();
    const req = http.expectOne('/api/v1/accounts/z1/follow');
    expect(req.request.body).toEqual({ reblogs: true, languages: null });
    req.flush({ id: 'z1', following: true, languages: null });
  });

  it('keeps the dialog with a reason when the server refuses', () => {
    const { ui, saved } = open({});
    ui.save();
    http
      .expectOne('/api/v1/accounts/z1/follow')
      .flush({ error: 'nope' }, { status: 422, statusText: 'Unprocessable' });
    expect(saved).toEqual([]);
    expect(ui.error()).toContain('Not saved.');
  });
});
