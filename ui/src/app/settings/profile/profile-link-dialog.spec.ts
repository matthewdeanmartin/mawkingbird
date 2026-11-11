import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfileLinkDialog, profileLink } from './profile-link-dialog';

describe('ProfileLinkDialog', () => {
  const modalDescriptor = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
  const closeDescriptor = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close');
  beforeEach(() => {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value() {
        this.open = true;
      },
    });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
      configurable: true,
      value() {
        this.open = false;
      },
    });
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    for (const [name, descriptor] of [
      ['showModal', modalDescriptor],
      ['close', closeDescriptor],
    ] as const) {
      if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
      else delete (HTMLDialogElement.prototype as unknown as Record<string, unknown>)[name];
    }
  });
  async function setup(mode: 'link' | 'profile') {
    const fixture = TestBed.createComponent(ProfileLinkDialog);
    fixture.componentRef.setInput('mode', mode);
    fixture.detectChanges();
    await fixture.whenStable();
    const added = vi.fn();
    const closed = vi.fn();
    fixture.componentInstance.added.subscribe(added);
    fixture.componentInstance.closed.subscribe(closed);
    const el: HTMLElement = fixture.nativeElement;
    function fill(name: string, value: string) {
      const control = el.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`)!;
      control.value = value;
      control.dispatchEvent(new Event(control.tagName === 'SELECT' ? 'change' : 'input'));
      fixture.detectChanges();
    }
    function submit() {
      el.querySelector('form')!.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      );
      fixture.detectChanges();
    }
    return { fixture, el, added, closed, fill, submit };
  }

  it('adds a labelled web address and rejects empty labels and unsafe URLs', async () => {
    const dialog = await setup('link');
    dialog.submit();
    expect(dialog.added).not.toHaveBeenCalled();
    expect(dialog.el.querySelectorAll('[aria-invalid="true"]')).toHaveLength(2);
    dialog.fill('link_label', ' My blog ');
    for (const url of [
      'javascript:alert(1)',
      'data:text/html,hello',
      'https://alice:secret@example.com',
      'example.com',
    ]) {
      dialog.fill('link_url', url);
      dialog.submit();
      expect(dialog.added).not.toHaveBeenCalled();
    }
    dialog.fill('link_url', ' https://example.com/blog ');
    dialog.submit();
    expect(dialog.added).toHaveBeenCalledExactlyOnceWith({
      name: 'My blog',
      value: 'https://example.com/blog',
    });
  });

  it('lets users explore either full-slot form but blocks button and form submission', async () => {
    for (const mode of ['link', 'profile'] as const) {
      const dialog = await setup(mode);
      dialog.fixture.componentRef.setInput('canAdd', false);
      dialog.fixture.detectChanges();
      if (mode === 'link') {
        dialog.fill('link_label', 'Website');
        dialog.fill('link_url', 'https://example.com/');
      } else {
        dialog.fill('profile_username', '@alice@mastodon.social');
        expect(dialog.el.querySelector<HTMLInputElement>('input[readonly]')?.value).toBe(
          'https://mastodon.social/@alice',
        );
      }
      expect(dialog.el.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(
        true,
      );
      dialog.submit();
      expect(dialog.added).not.toHaveBeenCalled();
      expect(dialog.el.textContent).toContain('cancel and remove a row');
      dialog.el.querySelector<HTMLButtonElement>('button[type="button"]')!.click();
      expect(dialog.closed).toHaveBeenCalledOnce();
      dialog.fixture.destroy();
    }
  });

  it('previews the selected site and adds the generated profile link', async () => {
    const dialog = await setup('profile');
    dialog.fill('profile_username', '@alice@mastodon.social');
    expect(dialog.el.querySelector<HTMLInputElement>('input[readonly]')?.value).toBe(
      'https://mastodon.social/@alice',
    );
    dialog.fill('profile_site', 'github');
    dialog.submit();
    expect(dialog.added).not.toHaveBeenCalled();
    dialog.fill('profile_username', '@alice');
    expect(dialog.el.querySelector<HTMLInputElement>('input[readonly]')?.value).toBe(
      'https://github.com/alice',
    );
    dialog.submit();
    expect(dialog.added).toHaveBeenCalledExactlyOnceWith({
      name: 'GitHub',
      value: 'https://github.com/alice',
    });
  });

  it('cancels without adding a link and describes browser-local profiles accurately', async () => {
    const dialog = await setup('profile');
    dialog.fixture.componentRef.setInput('local', true);
    dialog.fixture.detectChanges();
    expect(dialog.el.textContent).toContain('not published or verified');
    dialog.fill('profile_username', 'alice@mastodon.social');
    dialog.el.querySelector<HTMLButtonElement>('button[type="button"]')!.click();
    expect(dialog.closed).toHaveBeenCalledOnce();
    expect(dialog.added).not.toHaveBeenCalled();
  });

  it('dismisses with Escape without adding a link', async () => {
    const dialog = await setup('link');
    dialog.el.querySelector('dialog')!.dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(dialog.closed).toHaveBeenCalledOnce();
    expect(dialog.added).not.toHaveBeenCalled();
  });

  it('builds supported profile addresses and rejects paths or credentials as usernames', () => {
    expect(profileLink('gitlab', '@alice.dev')).toBe('https://gitlab.com/alice.dev');
    expect(profileLink('mastodon', '@alice@EXAMPLE.COM')).toBe('https://example.com/@alice');
    expect(profileLink('github', 'alice.dev')).toBeNull();
    for (const site of ['github', 'gitlab', 'mastodon'] as const) {
      for (const username of [
        '',
        'https://example.com/alice',
        '../alice',
        'alice?tab=repos',
        'alice:password@example.com',
      ]) {
        expect(profileLink(site, username)).toBeNull();
      }
    }
  });
});
