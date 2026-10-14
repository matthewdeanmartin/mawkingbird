import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MbMenuGroup } from './menu-group';
import { MbMenuItem } from './menu-item';
import { MbMenuSeparator } from './menu-separator';
import { MbPostMenu } from './post-menu';

@Component({
  imports: [MbPostMenu, MbMenuItem, MbMenuGroup, MbMenuSeparator],
  // The host stands in for a clickable post card.
  host: { '(click)': 'cardClicks = cardClicks + 1', '(keydown)': 'cardKeys.push($event.key)' },
  template: `
    <mb-post-menu label="More actions for this post" closeLabel="Close menu">
      <button type="button" mbMenuItem (click)="saved = saved + 1">Save as to-do</button>
      <button type="button" mbMenuItem [pressed]="liked()" (click)="liked.set(!liked())">
        Private like
      </button>
      <button type="button" mbMenuItem [expanded]="tags()" (click)="tags.set(!tags())">
        Mute a hashtag (7)
      </button>
      <a mbMenuItem href="https://social.example/@pizza/1" target="_blank">Open original</a>
      <mb-menu-group label="Mute @pizza for" layout="inline">
        <button type="button" mbMenuItem>1 hour</button>
      </mb-menu-group>
      <mb-menu-group nested>
        <button type="button" mbMenuItem keepOpen>Stay</button>
      </mb-menu-group>
      <mb-menu-separator />
      <button type="button" mbMenuItem tone="danger">Block @pizza</button>
    </mb-post-menu>
  `,
})
class Host {
  saved = 0;
  cardClicks = 0;
  cardKeys: string[] = [];
  readonly liked = signal(false);
  readonly tags = signal(false);
}

describe('MbPostMenu', () => {
  let fixture: ComponentFixture<Host>;
  let el: HTMLElement;

  function setUp(): void {
    fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
    const panel = el.querySelector<HTMLElement>('[popover]')!;
    panel.showPopover = vi.fn();
    panel.hidePopover = vi.fn();
  }
  const trigger = () => el.querySelector<HTMLButtonElement>('mb-post-menu button[aria-haspopup]')!;
  const panel = () => el.querySelector<HTMLElement>('[popover]')!;
  const row = (name: string) =>
    Array.from(el.querySelectorAll<HTMLElement>('[popover] button, [popover] a')).find(
      (item) => item.textContent!.trim() === name,
    )!;
  function open(): void {
    trigger().click();
    fixture.detectChanges();
    expect(trigger().getAttribute('aria-expanded')).toBe('true');
  }

  afterEach(() => fixture?.destroy());

  it('renders a compact ••• post action that names the menu and the dialog it opens', () => {
    setUp();
    expect(trigger().hasAttribute('mbPostAction')).toBe(true);
    expect(trigger().getAttribute('aria-label')).toBe('More actions for this post');
    expect(trigger().getAttribute('aria-haspopup')).toBe('dialog');
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(trigger().textContent!.trim()).toBe('•••');
    expect(panel().getAttribute('role')).toBe('dialog');
    expect(panel().classList).toContain('list');
    open();
    expect(trigger().dataset['active']).toBe('true');
    expect(document.activeElement).toBe(row('Save as to-do'));
  });

  it('ends with a separator and a Close row that closes and returns focus to •••', () => {
    setUp();
    open();
    const close = row('Close menu');
    expect(panel().lastElementChild).toBe(close);
    expect(close.previousElementSibling!.getAttribute('role')).toBe('separator');
    close.click();
    fixture.detectChanges();
    expect(panel().hidePopover).toHaveBeenCalledOnce();
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger());
  });

  it('closes after commands and links but stays open for toggles, disclosures and keepOpen rows', () => {
    setUp();
    for (const name of ['Private like', 'Mute a hashtag (7)', 'Stay']) {
      open();
      row(name).click();
      fixture.detectChanges();
      expect(trigger().getAttribute('aria-expanded')).toBe('true');
      trigger().click();
      fixture.detectChanges();
    }
    expect(row('Private like').getAttribute('aria-pressed')).toBe('true');
    expect(row('Mute a hashtag (7)').getAttribute('aria-expanded')).toBe('true');

    for (const name of ['Save as to-do', '1 hour', 'Block @pizza']) {
      open();
      row(name).click();
      fixture.detectChanges();
      expect(trigger().getAttribute('aria-expanded')).toBe('false');
    }
    expect(fixture.componentInstance.saved).toBe(1);

    open();
    const link = row('Open original') as HTMLAnchorElement;
    link.addEventListener('click', (event) => event.preventDefault());
    link.click();
    fixture.detectChanges();
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(link.getAttribute('href')).toBe('https://social.example/@pizza/1');
  });

  it('keeps clicks and keys other than Escape from the parent card', () => {
    setUp();
    open();
    row('Private like').click();
    row('Save as to-do').click();
    trigger().click();
    expect(fixture.componentInstance.cardClicks).toBe(0);
    for (const key of ['j', 'Enter', 'Escape']) {
      trigger().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    }
    expect(fixture.componentInstance.cardKeys).toEqual(['Escape']);
  });

  it('marks tone and inline choices, and names groups by their visible caption', () => {
    setUp();
    expect(row('Block @pizza').dataset['tone']).toBe('danger');
    expect(row('1 hour').hasAttribute('data-inline')).toBe(true);
    expect(row('Save as to-do').hasAttribute('data-inline')).toBe(false);
    const [inline, nested] = Array.from(el.querySelectorAll('mb-menu-group'));
    expect(inline.getAttribute('role')).toBe('group');
    const caption = el.querySelector(`#${inline.getAttribute('aria-labelledby')}`)!;
    expect(caption.textContent).toBe('Mute @pizza for');
    expect(nested.hasAttribute('aria-labelledby')).toBe(false);
    expect(nested.hasAttribute('data-nested')).toBe(true);
  });
});

describe('MbPopover list layout', () => {
  let fixture: ComponentFixture<Host>;
  afterEach(() => {
    fixture.destroy();
    vi.unstubAllGlobals();
  });

  /** Lays out a trigger at `top` in a 700px viewport and a panel `natural` px tall. */
  function openAt(top: number, natural: number): { y: number; maxHeight: number | null } {
    vi.stubGlobal('innerHeight', 700);
    vi.stubGlobal('innerWidth', 360);
    fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const panel = el.querySelector<HTMLElement>('[popover]')!;
    panel.showPopover = vi.fn();
    panel.hidePopover = vi.fn();
    const trigger = el.querySelector<HTMLButtonElement>('button[aria-haspopup]')!;
    trigger.getBoundingClientRect = () =>
      ({ top, bottom: top + 28, left: 300, right: 328, width: 28, height: 28 }) as DOMRect;
    panel.getBoundingClientRect = () =>
      ({ top: 0, bottom: 200, left: 0, right: 280, width: 280, height: 200 }) as DOMRect;
    Object.defineProperty(panel, 'scrollHeight', { value: natural });
    Object.defineProperty(panel, 'clientHeight', { value: 200 });
    trigger.click();
    fixture.detectChanges();
    const style = panel.style;
    return {
      y: parseFloat(style.top),
      maxHeight: style.maxHeight ? parseFloat(style.maxHeight) : null,
    };
  }

  it('opens below the trigger when the menu fits there', () => {
    expect(openAt(100, 300)).toEqual({ y: 132, maxHeight: null });
  });

  it('opens above a trigger near the bottom of the screen and ends above it', () => {
    const { y, maxHeight } = openAt(600, 400);
    expect(maxHeight).toBeNull();
    expect(y + 400).toBeLessThanOrEqual(600);
  });

  it('caps a menu taller than either side to the larger side instead of covering the trigger', () => {
    const { y, maxHeight } = openAt(400, 900);
    expect(maxHeight).toBe(388);
    expect(y + maxHeight!).toBeLessThanOrEqual(400);
  });
});
