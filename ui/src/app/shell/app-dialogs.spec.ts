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
    expect(document.getElementById(modal.getAttribute('aria-describedby')!)?.textContent).toContain(
      'Notifications cannot be recalled.',
    );
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
    (await dialog()).dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(await cancelled).toBeNull();
  });
});

describe('AppDialogs adoption parity', () => {
  it('keeps distinct requests queued and continues after cancellation', async () => {
    const service = TestBed.inject(AppDialogs);
    const first = service.confirm('First decision');
    const second = service.alert('Second decision');
    const firstModal = await dialog();
    expect(document.querySelectorAll('app-confirm-dialog')).toHaveLength(1);
    expect(firstModal.textContent).toContain('First decision');
    firstModal.querySelector('button')!.click();
    expect(await first).toBe(false);
    const secondModal = await dialog();
    expect(document.querySelectorAll('app-confirm-dialog')).toHaveLength(1);
    expect(secondModal.textContent).toContain('Second decision');
    secondModal.querySelector('button')!.click();
    await second;
    expect(document.querySelector('app-confirm-dialog')).toBeNull();
  });

  it('consumes prompt Enter so focus return cannot activate the opener again', async () => {
    const result = TestBed.inject(AppDialogs).prompt('Name', 'Initial');
    const modal = await dialog();
    const input = modal.querySelector('input')!;
    input.value = 'Edited';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    input.dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(true);
    expect(await result).toBe('Edited');
    expect(document.querySelector('app-confirm-dialog')).toBeNull();
  });
});
