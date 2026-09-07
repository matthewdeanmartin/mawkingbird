import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { HouseAdStore } from '../../../house-ad-store';
import { HOUSE_ADS } from '../../../house-ads';
import { SettingsSpotlight } from './settings-spotlight';

describe('SettingsSpotlight (Ads)', () => {
  function setUp(): ComponentFixture<SettingsSpotlight> {
    const fixture = TestBed.createComponent(SettingsSpotlight);
    fixture.detectChanges();
    return fixture;
  }

  function root(fixture: ComponentFixture<SettingsSpotlight>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function rows(fixture: ComponentFixture<SettingsSpotlight>): HTMLLIElement[] {
    return [...root(fixture).querySelectorAll<HTMLLIElement>('li.spotlight-row')];
  }

  function rowFor(fixture: ComponentFixture<SettingsSpotlight>, title: string): HTMLLIElement {
    return rows(fixture).find((row) => row.textContent?.includes(title))!;
  }

  function masterSwitch(fixture: ComponentFixture<SettingsSpotlight>): HTMLInputElement {
    return root(fixture).querySelector<HTMLInputElement>('.checkline input')!;
  }

  function toggle(input: HTMLInputElement, checked: boolean): void {
    input.checked = checked;
    input.dispatchEvent(new Event('change'));
  }

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  it('lists the whole inventory, not just the pair on screen', () => {
    const fixture = setUp();
    expect(rows(fixture)).toHaveLength(HOUSE_ADS.length);
    for (const ad of HOUSE_ADS) {
      expect(root(fixture).textContent).toContain(ad.title);
    }
  });

  it('says which ads are showing now and which are waiting', () => {
    const fixture = setUp();
    const showing = TestBed.inject(HouseAdStore).visible();

    expect(rowFor(fixture, showing[0].title).textContent).toContain('Showing now');
    const waiting = HOUSE_ADS.find((ad) => !showing.some((v) => v.id === ad.id))!;
    expect(rowFor(fixture, waiting.title).textContent).toContain('Up next');
  });

  it('shows the click tally per ad, and says so plainly when there is none', () => {
    const store = TestBed.inject(HouseAdStore);
    store.recordClick(HOUSE_ADS[0].id);
    store.recordClick(HOUSE_ADS[0].id);
    const fixture = setUp();

    const clicked = rowFor(fixture, HOUSE_ADS[0].title).textContent ?? '';
    expect(clicked).toContain('2');
    expect(clicked).toContain('clicks');
    expect(clicked).toContain('last');
    expect(rowFor(fixture, HOUSE_ADS[1].title).textContent).toContain('Never clicked');
  });

  it('turns one ad off, and the rail stops offering it', () => {
    const fixture = setUp();
    const store = TestBed.inject(HouseAdStore);
    const target = store.visible()[0];

    const input = rowFor(fixture, target.title).querySelector<HTMLInputElement>('input')!;
    expect(input.checked).toBe(true);
    toggle(input, false);
    fixture.detectChanges();

    expect(store.visible().map((ad) => ad.id)).not.toContain(target.id);
    expect(rowFor(fixture, target.title).textContent).toContain('Off');
  });

  it('turns every ad off at once and disables the per-ad switches', () => {
    const fixture = setUp();
    toggle(masterSwitch(fixture), false);
    fixture.detectChanges();

    expect(TestBed.inject(HouseAdStore).visible()).toEqual([]);
    // The individual switches keep their state but stop being actionable, so the
    // page can't claim an ad is "on" while nothing shows.
    for (const row of rows(fixture)) {
      expect(row.querySelector<HTMLInputElement>('input')!.disabled).toBe(true);
      expect(row.textContent).toContain('All endorsements off');
    }
  });

  it('puts everything back with one button', () => {
    const store = TestBed.inject(HouseAdStore);
    store.setAdEnabled(HOUSE_ADS[0].id, false);
    store.setEnabled(false);
    const fixture = setUp();

    [...root(fixture).querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.includes('back on'))!
      .click();
    fixture.detectChanges();

    expect(masterSwitch(fixture).checked).toBe(true);
    expect(
      rows(fixture).every((row) => row.querySelector<HTMLInputElement>('input')!.checked),
    ).toBe(true);
  });

  it('offers to forget the clicks only once there are some', () => {
    const fixture = setUp();
    const forget = () =>
      [...root(fixture).querySelectorAll<HTMLButtonElement>('button')].find((button) =>
        button.textContent?.includes('Forget'),
      );
    expect(forget()).toBeUndefined();

    TestBed.inject(HouseAdStore).recordClick(HOUSE_ADS[0].id);
    fixture.detectChanges();
    forget()!.click();
    fixture.detectChanges();

    expect(TestBed.inject(HouseAdStore).totalClicks()).toBe(0);
    expect(rowFor(fixture, HOUSE_ADS[0].title).textContent).toContain('Never clicked');
  });

  it('never communicates an ad’s state with colour alone', () => {
    const fixture = setUp();
    // Every row carries a text pill, so the dimming is decoration rather than
    // the only signal.
    for (const row of rows(fixture)) {
      expect(row.querySelector('.pill')?.textContent?.trim()).toBeTruthy();
    }
  });

  it('carries no ad-* class names (blockers hide those cosmetically)', () => {
    // The same precaution right-rail.spec pins, extended to this page: a
    // Settings page that half-vanishes under uBlock is a support question.
    const fixture = setUp();
    const adClassed = [...root(fixture).querySelectorAll('*')].filter((node) =>
      [...node.classList].some((cls) => /^ad[s]?([-_]|$)/i.test(cls)),
    );
    expect(adClassed).toHaveLength(0);
  });
});
