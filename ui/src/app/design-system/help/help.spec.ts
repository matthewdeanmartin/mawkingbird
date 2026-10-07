import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MbHelp } from './help';

@Component({
  imports: [MbHelp],
  template: `<mb-help label="About playback"><p>Playback stays paused.</p></mb-help>
    <mb-help label="About uploads">Uploads are posted separately.</mb-help>`,
})
class Host {}

describe('MbHelp', () => {
  afterEach(() => vi.restoreAllMocks());

  it('provides distinct named icon buttons and closed, associated help surfaces', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const buttons: HTMLButtonElement[] = [...fixture.nativeElement.querySelectorAll('button')];
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
      'About playback',
      'About uploads',
    ]);
    expect(
      buttons.every(
        (button) => button.type === 'button' && button.getAttribute('aria-expanded') === 'false',
      ),
    ).toBe(true);
    expect(buttons[0].getAttribute('aria-controls')).not.toBe(
      buttons[1].getAttribute('aria-controls'),
    );
    expect(buttons[0].querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(buttons[0].textContent?.trim()).toBe('');
    const panel = fixture.nativeElement.querySelector('[popover]');
    expect(panel.id).toBe(buttons[0].getAttribute('aria-controls'));
    expect(panel.textContent).toContain('Playback stays paused.');
  });

  it('opens on click, isolates parent actions, and restores focus on Escape', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    const panel: HTMLElement = fixture.nativeElement.querySelector('[popover]');
    panel.showPopover = vi.fn();
    panel.hidePopover = vi.fn();
    const parentClick = vi.fn();
    fixture.nativeElement.addEventListener('click', parentClick);
    button.click();
    fixture.detectChanges();
    expect(panel.showPopover).toHaveBeenCalledOnce();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(panel);
    expect(parentClick).not.toHaveBeenCalled();
    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(panel.hidePopover).toHaveBeenCalledOnce();
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(button);
  });

  it('tracks native light dismissal without reopening or claiming focus', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    const panel: HTMLElement = fixture.nativeElement.querySelector('[popover]');
    panel.showPopover = vi.fn();
    button.click();
    const toggle = new Event('toggle');
    Object.defineProperty(toggle, 'newState', { value: 'closed' });
    panel.dispatchEvent(toggle);
    fixture.detectChanges();
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(panel.showPopover).toHaveBeenCalledOnce();
  });
});
