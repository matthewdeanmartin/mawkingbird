import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  MbAccountCard,
  MbDiscoveryCandidate,
  MbProfileStack,
  MbRailCard,
  MbServerPickerSurface,
  MbSpinner,
  MbSwitch,
} from './identity';

@Component({
  imports: [
    MbAccountCard,
    MbDiscoveryCandidate,
    MbProfileStack,
    MbRailCard,
    MbServerPickerSurface,
    MbSpinner,
    MbSwitch,
  ],
  template: `
    <section mbRailCard overflow="visible" tone="accent">
      <h2 class="card-title">People</h2>
      <a href="/people">Find people</a>
    </section>
    <section mbProfileStack>
      <button type="button" class="peek" (click)="selected.set(true)">Another identity</button>
      <article mbRailCard>Current identity</article>
    </section>
    <div mbAccountCard [inline]="inline()">
      <strong class="hc-name">A reader</strong><a href="/accounts/reader">Profile</a>
    </div>
    <div mbServerPickerSurface>
      <input aria-label="Server" />
      <ul class="server-suggest">
        <li>Example</li>
      </ul>
    </div>
    <div mbDiscoveryCandidate>
      <strong>Server found</strong>
      <div data-candidate-actions>
        <button type="button" (click)="accepted.set(true)">Use this server</button>
      </div>
    </div>
    <label mbSwitch
      ><input
        type="checkbox"
        aria-label="Server mode"
        [checked]="checked()"
        [disabled]="disabled()"
        (change)="checked.set($any($event.target).checked)" /><span aria-hidden="true"></span
    ></label>
    <span mbSpinner aria-hidden="true"></span>
  `,
})
class IdentityHost {
  readonly selected = signal(false);
  readonly accepted = signal(false);
  readonly inline = signal(false);
  readonly checked = signal(false);
  readonly disabled = signal(false);
}

describe('identity presentation contracts', () => {
  it('projects native rail links and profile choices without adding navigation behavior', async () => {
    const fixture = TestBed.createComponent(IdentityHost);
    await fixture.whenStable();
    const root: HTMLElement = fixture.nativeElement;
    const rail = root.querySelector('[mbRailCard]')!;
    expect(rail.tagName).toBe('SECTION');
    expect(rail.getAttribute('data-overflow')).toBe('visible');
    expect(rail.getAttribute('data-tone')).toBe('accent');
    expect(rail.querySelector(':scope > a')?.getAttribute('href')).toBe('/people');
    root.querySelector<HTMLButtonElement>('.peek')!.click();
    expect(fixture.componentInstance.selected()).toBe(true);
  });

  it('keeps account inline presentation independent from follow and disclosure state', async () => {
    const fixture = TestBed.createComponent(IdentityHost);
    await fixture.whenStable();
    const card: HTMLElement = fixture.nativeElement.querySelector('[mbAccountCard]');
    expect(card.getAttribute('data-inline')).toBe('false');
    fixture.componentInstance.inline.set(true);
    await fixture.whenStable();
    expect(card.getAttribute('data-inline')).toBe('true');
    expect(card.querySelector(':scope > a')?.getAttribute('href')).toBe('/accounts/reader');
    expect(card.hasAttribute('aria-expanded')).toBe(false);
    expect(card.hasAttribute('role')).toBe(false);
  });

  it('leaves discovery approval and native picker ownership with callers', async () => {
    const fixture = TestBed.createComponent(IdentityHost);
    await fixture.whenStable();
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector('[mbServerPickerSurface] > input')?.getAttribute('aria-label')).toBe(
      'Server',
    );
    expect(fixture.componentInstance.accepted()).toBe(false);
    root.querySelector<HTMLButtonElement>('[mbDiscoveryCandidate] button')!.click();
    expect(fixture.componentInstance.accepted()).toBe(true);
    expect(root.querySelector('[mbSpinner]')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('retains native label activation, checked binding and disabled semantics for switches', async () => {
    const fixture = TestBed.createComponent(IdentityHost);
    await fixture.whenStable();
    const label: HTMLLabelElement = fixture.nativeElement.querySelector('[mbSwitch]');
    const control = label.control as HTMLInputElement;
    expect(control.type).toBe('checkbox');
    label.click();
    await fixture.whenStable();
    expect(control.checked).toBe(true);
    expect(fixture.componentInstance.checked()).toBe(true);
    fixture.componentInstance.disabled.set(true);
    await fixture.whenStable();
    label.click();
    expect(control.disabled).toBe(true);
    expect(control.checked).toBe(true);
    fixture.componentInstance.checked.set(false);
    await fixture.whenStable();
    expect(control.checked).toBe(false);
  });
});
