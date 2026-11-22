import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { Account, Status } from '../../platform/api/models';
import { ClientPrefs } from '../../platform/storage/client-prefs';
import { AdultVerdict } from './adult-classifier';
import { AdultCollapsed, AdultFilterControl } from './adult-explain';
import { AdultResults } from './adult-results';

const VERDICT: AdultVerdict = {
  adult: true,
  reasons: [
    { kind: 'declared', evidence: '18+' },
    { kind: 'posts', evidence: '', count: 3, of: 4 },
  ],
  weak: [{ kind: 'sensitive', evidence: '' }],
};

describe('AdultCollapsed', () => {
  it('shows the first reason, explains all of them, and reveals on request', () => {
    const fixture = TestBed.createComponent(AdultCollapsed);
    fixture.componentRef.setInput('verdict', VERDICT);
    fixture.componentRef.setInput('kind', 'account');
    let revealed = 0;
    fixture.componentInstance.reveal.subscribe(() => revealed++);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.label')?.textContent).toContain('Adult account');
    expect(el.querySelector('.reason')?.textContent).toContain('Their profile says “18+”');
    // The explainer lives in the (i) popover.
    const why = el.querySelector('app-adult-reasons')?.textContent ?? '';
    expect(why).toContain('3 of 4 of their loaded posts are adult');
    expect(why).toContain('Marked sensitive, with no warning saying why');
    expect(why).toContain('“sensitive” flag alone never counts');
    el.querySelector<HTMLButtonElement>('button.show')!.click();
    expect(revealed).toBe(1);
  });
});

describe('AdultFilterControl', () => {
  it('emits the chosen value and reports what it did', () => {
    const fixture = TestBed.createComponent(AdultFilterControl);
    fixture.componentRef.setInput('value', 'hide');
    fixture.componentRef.setInput('hidden', 3);
    const chosen: string[] = [];
    fixture.componentInstance.valueChange.subscribe((v) => chosen.push(v));
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-adult-count]')?.textContent).toContain('3 hidden as adult');
    const select = el.querySelector('select')!;
    expect(select.value).toBe('hide');
    select.value = 'only';
    select.dispatchEvent(new Event('change'));
    expect(chosen).toEqual(['only']);

    fixture.componentRef.setInput('value', 'only');
    fixture.componentRef.setInput('dropped', 1);
    fixture.detectChanges();
    expect(el.querySelector('[data-adult-count]')?.textContent).toContain('1 not adult, left out');
  });
});

describe('AdultResults', () => {
  beforeEach(() => localStorage.clear());

  function person(id: string, note: string): { account: Account; matchingPosts: Status[] } {
    return { account: { id, acct: id, note, fields: [] } as unknown as Account, matchingPosts: [] };
  }

  it('remembers a reader’s choice but not a link’s', () => {
    const prefs = TestBed.inject(ClientPrefs);
    const results = new AdultResults(
      prefs,
      () => [],
      () => [],
    );
    expect(results.filter()).toBe('either');
    results.choose('hide');
    expect(prefs.adultFilter()).toBe('hide');
    results.override('only');
    expect(results.filter()).toBe('only');
    expect(prefs.adultFilter()).toBe('hide');
    expect(
      new AdultResults(
        prefs,
        () => [],
        () => [],
      ).filter(),
    ).toBe('hide');
  });

  it('offers the filter only when someone loaded is adult, or under Only', () => {
    const people = signal([person('b', 'gardener')]);
    const results = new AdultResults(TestBed.inject(ClientPrefs), () => [], people);
    expect(results.offerForPeople()).toBe(false);
    results.choose('hide');
    expect(results.offerForPeople()).toBe(false);
    results.choose('only');
    expect(results.offerForPeople()).toBe(true);
    results.choose('either');
    people.set([person('a', '18+'), person('b', 'gardener')]);
    expect(results.offerForPeople()).toBe(true);
  });

  it('keeps, collapses and counts people by the filter', () => {
    const people = signal([person('a', '18+'), person('b', 'gardener')]);
    const results = new AdultResults(TestBed.inject(ClientPrefs), () => [], people);
    expect(results.keepPeople(people()).length).toBe(2);
    results.choose('hide');
    expect(results.collapsedAccount('a')?.adult).toBe(true);
    expect(results.collapsedAccount('b')).toBeNull();
    results.reveal('a:a');
    expect(results.collapsedAccount('a')).toBeNull();
    results.choose('only');
    expect(results.keepPeople(people()).map((p) => p.account.id)).toEqual(['a']);
    expect(results.droppedPeople()).toBe(1);
  });
});
