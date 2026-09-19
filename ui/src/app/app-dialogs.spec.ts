import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { AppDialogs } from './app-dialogs';

async function dialog(): Promise<HTMLElement> {
  await vi.waitFor(() =>
    expect(document.querySelector('app-confirm-dialog [role="alertdialog"]')).not.toBeNull(),
  );
  return document.querySelector<HTMLElement>('app-confirm-dialog [role="alertdialog"]')!;
}

describe('AppDialogs', () => {
  it('rejects duplicate requests while one decision is pending', async () => {
    const service = TestBed.inject(AppDialogs);
    const first = service.confirm('Delete?');
    expect(await service.confirm('Delete?')).toBe(false);
    (await dialog()).querySelectorAll<HTMLButtonElement>('button')[1].click();
    expect(await first).toBe(true);
    expect(document.querySelector('app-confirm-dialog')).toBeNull();
  });
  it('renders confirmation copy and waits for an explicit decision', async () => {
    const native = vi.spyOn(window, 'confirm');
    const result = TestBed.inject(AppDialogs).confirm('Notifications cannot be recalled.', {
      title: 'Follow 30 accounts?',
      confirmLabel: 'Follow 30',
    });
    const modal = await dialog();
    expect(modal.textContent).toContain('Follow 30 accounts?');
    expect(modal.textContent).toContain('Notifications cannot be recalled.');
    expect(modal.getAttribute('aria-describedby')).toBe('confirm-message');
    modal.querySelectorAll<HTMLButtonElement>('button')[0].click();
    expect(await result).toBe(false);
    expect(document.querySelector('app-confirm-dialog')).toBeNull();
    expect(native).not.toHaveBeenCalled();
    native.mockRestore();
  });
  it('accepts confirmations and closes notices with one OK action', async () => {
    const service = TestBed.inject(AppDialogs);
    const confirmed = service.confirm('Continue?');
    (await dialog()).querySelectorAll<HTMLButtonElement>('button')[1].click();
    expect(await confirmed).toBe(true);
    const notice = service.alert('Saved.');
    const modal = await dialog();
    expect(modal.querySelectorAll('button')).toHaveLength(1);
    modal.querySelector('button')!.click();
    await notice;
  });
  it('returns entered text, preserves empty input, and returns null on escape', async () => {
    const service = TestBed.inject(AppDialogs);
    const result = service.prompt('Choose a name.', 'Initial', { inputLabel: 'Name' });
    const modal = await dialog();
    const input = modal.querySelector('input')!;
    expect(input.value).toBe('Initial');
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    modal.querySelectorAll<HTMLButtonElement>('button')[1].click();
    expect(await result).toBe('');
    const cancelled = service.prompt('Choose a name.');
    await dialog();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(await cancelled).toBeNull();
  });
});
