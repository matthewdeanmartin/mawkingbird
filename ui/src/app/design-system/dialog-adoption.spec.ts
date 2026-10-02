import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BugReportDialog } from '../bug-report-dialog/bug-report-dialog';
import { BugReport } from '../bug-report';
import { ErrorLog } from '../error-log';
import { DiagnosticLog } from '../diagnostic-log';
import { PageDiagnostics } from '../page-diagnostics';
import { BulkActionsDialog } from '../bulk-actions-dialog/bulk-actions-dialog';
import { BulkActions } from '../bulk-actions';

describe('Shared dialog adoption', () => {
  const descriptors = ['showModal', 'close'].map(
    (name) => [name, Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name)] as const,
  );
  const buildMarkdown = vi.fn(
    (input: { description: string; includeErrors: boolean }) =>
      input.description + (input.includeErrors ? ' fixture error' : ''),
  );
  const preview = vi.fn();
  const cancelPlanning = vi.fn();

  beforeEach(() => {
    for (const [name] of descriptors) {
      Object.defineProperty(HTMLDialogElement.prototype, name, {
        configurable: true,
        value(this: HTMLDialogElement) {
          this.open = name === 'showModal';
        },
      });
    }
    buildMarkdown.mockClear();
    preview.mockReset();
    cancelPlanning.mockReset();
    TestBed.configureTestingModule({
      providers: [
        { provide: BugReport, useValue: { buildMarkdown } },
        { provide: ErrorLog, useValue: { entries: signal([{ text: 'fixture error' }]) } },
        { provide: DiagnosticLog, useValue: { entries: signal([]) } },
        { provide: PageDiagnostics, useValue: { error: vi.fn() } },
        { provide: BulkActions, useValue: { preview, cancelPlanning, planning: signal(null) } },
      ],
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    for (const [name, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
      else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
    }
  });

  it('keeps the report editable and error inclusion caller-controlled', async () => {
    const fixture = TestBed.createComponent(BugReportDialog);
    fixture.detectChanges();
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const textarea = element.querySelector('textarea')!;
    expect(element.querySelector('mb-field label')?.getAttribute('for')).toBe(textarea.id);
    textarea.value = 'The page failed';
    textarea.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    const checkbox = element.querySelector('input[type="checkbox"]') as HTMLInputElement;
    checkbox.click();
    await fixture.whenStable();
    expect(buildMarkdown).toHaveBeenLastCalledWith({
      description: 'The page failed',
      includeErrors: false,
      includeDiagnostics: true,
    });
    expect(element.querySelector('mb-disclosure details')).not.toBeNull();
    expect(element.querySelectorAll('footer button[mbButton]')).toHaveLength(3);
  });

  it('routes report Escape dismissal to the existing closed output', () => {
    const fixture = TestBed.createComponent(BugReportDialog);
    fixture.detectChanges();
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);
    fixture.nativeElement
      .querySelector('dialog')
      .dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(closed).toHaveBeenCalledOnce();
  });

  it('retains alert semantics and never confirms on dismissal', async () => {
    preview.mockResolvedValue({
      action: 'list-unfollow',
      targets: 3,
      alreadyCorrect: 0,
      approximate: false,
    });
    const fixture = TestBed.createComponent(BulkActionsDialog);
    fixture.componentRef.setInput('action', 'list-unfollow');
    fixture.componentRef.setInput('target', { listId: 'test', listTitle: 'My list' });
    fixture.detectChanges();
    await fixture.whenStable();
    const confirmed = vi.fn();
    const cancelled = vi.fn();
    fixture.componentInstance.confirmed.subscribe(confirmed);
    fixture.componentInstance.cancelled.subscribe(cancelled);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('dialog')?.getAttribute('role')).toBe('alertdialog');
    expect(element.querySelector('footer button[data-tone="danger"]')).not.toBeNull();
    element.querySelector('dialog')!.dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(cancelled).toHaveBeenCalledOnce();
    expect(confirmed).not.toHaveBeenCalled();
    (element.querySelector('footer button[data-tone="danger"]') as HTMLButtonElement).click();
    expect(confirmed).toHaveBeenCalledOnce();
  });

  it('retains the stop-counting action while the preview is pending', () => {
    preview.mockReturnValue(new Promise(() => undefined));
    const fixture = TestBed.createComponent(BulkActionsDialog);
    fixture.componentRef.setInput('action', 'list-unfollow');
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('footer button') as HTMLButtonElement;
    expect(button.textContent).toContain('Stop counting');
    button.click();
    expect(cancelPlanning).toHaveBeenCalledOnce();
    expect(fixture.nativeElement.querySelector('button[data-tone="danger"]')).toBeNull();
  });
});
