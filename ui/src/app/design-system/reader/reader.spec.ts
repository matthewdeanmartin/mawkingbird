import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { MbReaderLibrary, MbReaderPreferences, MbReaderSearch, MbReaderSurface } from './reader';

@Component({
  imports: [FormsModule, MbReaderLibrary, MbReaderPreferences, MbReaderSearch, MbReaderSurface],
  template: `
    <div mbReaderPreferences>
      <label class="typo-row">
        <span class="typo-label">Typeface</span>
        <select [(ngModel)]="font">
          <option value="serif">Georgia</option>
          <option value="mono">Monospace</option>
        </select>
      </label>
      <label class="typo-row">
        <span class="typo-label">Line height</span>
        <input type="range" min="1.2" max="2.2" step="0.05" [(ngModel)]="height" />
      </label>
      <label class="typo-row typo-stack">
        <span class="typo-label">Dictionary URL</span>
        <input type="url" [attr.aria-invalid]="invalid() ? true : null" />
      </label>
    </div>
    <aside mbReaderLibrary aria-label="Library">
      <button
        class="rail-row rail-folder"
        type="button"
        [attr.aria-expanded]="expanded()"
        (click)="expanded.set(!expanded())"
      >
        Reading
      </button>
      @if (expanded()) {
        <div class="row-wrap active">
          <a class="rail-row rail-feed nested" href="/read/example" aria-current="true">Document</a>
        </div>
      }
    </aside>
    <div
      mbReaderSearch
      role="dialog"
      aria-label="Find in document"
      (keydown.escape)="closed.set(true)"
    >
      <input class="search-field" type="search" aria-label="Find" [(ngModel)]="query" />
      <button class="search-result on-this-page" type="button" (click)="selected.set(true)">
        <span class="search-context">A <mark>quiet</mark> passage</span>
        <span class="search-page">Page 1</span>
      </button>
    </div>
    <aside mbReaderSurface aria-label="Notes">A note</aside>
    <div mbReaderSurface surface="selection" role="toolbar" aria-label="Selection tools">
      Commands
    </div>
  `,
})
class ReaderHost {
  font = 'serif';
  height = 1.6;
  query = '';
  invalid = signal(false);
  expanded = signal(true);
  closed = signal(false);
  selected = signal(false);
}

describe('reader presentation contracts', () => {
  it('projects native labelled controls without adding layout wrappers or replacing forms', async () => {
    const fixture = TestBed.createComponent(ReaderHost);
    await fixture.whenStable();
    const root: HTMLElement = fixture.nativeElement;
    const labels = root.querySelectorAll<HTMLLabelElement>('[mbReaderPreferences] > label');
    expect(labels.length).toBe(3);
    const select = root.querySelector('select')!;
    expect(labels[0].control).toBe(select);
    expect(select.options.length).toBe(2);
    select.value = 'mono';
    select.dispatchEvent(new Event('change'));
    const range = root.querySelector<HTMLInputElement>('input[type="range"]')!;
    expect(labels[1].control).toBe(range);
    range.value = '1.8';
    range.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(fixture.componentInstance.font).toBe('mono');
    expect(fixture.componentInstance.height).toBe(1.8);
    fixture.componentInstance.invalid.set(true);
    await fixture.whenStable();
    expect(labels[2].control?.getAttribute('aria-invalid')).toBe('true');
    fixture.componentInstance.invalid.set(false);
    await fixture.whenStable();
    expect(labels[2].control?.hasAttribute('aria-invalid')).toBe(false);
  });

  it('leaves shelf disclosure and current native links owned by the reader', async () => {
    const fixture = TestBed.createComponent(ReaderHost);
    await fixture.whenStable();
    const root: HTMLElement = fixture.nativeElement;
    const link = root.querySelector('[mbReaderLibrary] a')!;
    expect(link.getAttribute('href')).toBe('/read/example');
    expect(link.getAttribute('aria-current')).toBe('true');
    const shelf = root.querySelector<HTMLButtonElement>('.rail-folder')!;
    shelf.click();
    await fixture.whenStable();
    expect(shelf.getAttribute('aria-expanded')).toBe('false');
    expect(root.querySelector('[mbReaderLibrary] a')).toBeNull();
    shelf.click();
    await fixture.whenStable();
    expect(root.querySelector('[mbReaderLibrary] a')).not.toBeNull();
  });

  it('preserves search bindings, match activation and caller-owned Escape behavior', async () => {
    const fixture = TestBed.createComponent(ReaderHost);
    await fixture.whenStable();
    const root: HTMLElement = fixture.nativeElement;
    const field = root.querySelector<HTMLInputElement>('.search-field')!;
    field.value = 'quiet';
    field.dispatchEvent(new Event('input'));
    root.querySelector<HTMLButtonElement>('.search-result')!.click();
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();
    expect(fixture.componentInstance.query).toBe('quiet');
    expect(fixture.componentInstance.selected()).toBe(true);
    expect(fixture.componentInstance.closed()).toBe(true);
    expect(root.querySelector('mark')?.textContent).toBe('quiet');
    expect(root.querySelector('.search-result')?.hasAttribute('disabled')).toBe(false);
    expect(root.querySelector('[mbReaderSearch]')?.hasAttribute('aria-modal')).toBe(false);
  });

  it('uses the original surface elements without taking over roles or positioning', async () => {
    const fixture = TestBed.createComponent(ReaderHost);
    await fixture.whenStable();
    const surfaces = fixture.nativeElement.querySelectorAll('[mbReaderSurface]');
    expect(surfaces[0].tagName).toBe('ASIDE');
    expect(surfaces[0].getAttribute('data-surface')).toBe('notes');
    expect(surfaces[0].textContent).toBe('A note');
    expect(surfaces[1].tagName).toBe('DIV');
    expect(surfaces[1].getAttribute('data-surface')).toBe('selection');
    expect(surfaces[1].getAttribute('role')).toBe('toolbar');
    expect(surfaces[1].style.position).toBe('');
  });
});
