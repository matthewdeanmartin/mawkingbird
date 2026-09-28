import { TestBed } from '@angular/core/testing';
import { ClientPrefs } from '../client-prefs';
import { ReaderToolbar } from './reader-toolbar';

describe('ReaderToolbar adoption', () => {
  it('keeps font preferences and native selects independent of button focus navigation', async () => {
    const fixture = TestBed.createComponent(ReaderToolbar);
    const prefs = TestBed.inject(ClientPrefs);
    prefs.setReaderFontSize(18);
    await fixture.whenStable();
    const root: HTMLElement = fixture.nativeElement;
    const buttons = [...root.querySelectorAll<HTMLButtonElement>('mb-toolbar button')];
    expect(buttons.map((button) => button.tabIndex)).toEqual([0, -1]);
    buttons[1].click();
    await fixture.whenStable();
    expect(prefs.readerFontSize()).toBe(19);
    buttons[0].click();
    await fixture.whenStable();
    expect(prefs.readerFontSize()).toBe(18);
    const selects = [...root.querySelectorAll('select')];
    expect(selects).toHaveLength(2);
    expect(selects.every((select) => !select.closest('mb-toolbar'))).toBe(true);
    selects[1].value = 'sepia';
    selects[1].dispatchEvent(new Event('change'));
    expect(prefs.readerTheme()).toBe('sepia');
    // Shared ClientPrefs is reset by test setup; restore root theme immediately too.
    prefs.setReaderTheme('app');
  });
});
