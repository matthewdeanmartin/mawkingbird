import { TestBed } from '@angular/core/testing';
import { MbSaveFeedback } from './save-feedback';

describe('MbSaveFeedback', () => {
  it('announces ordinary progress politely and errors as alerts, without stale duplicate messages', async () => {
    const fixture = TestBed.createComponent(MbSaveFeedback);
    fixture.componentRef.setInput('state', 'saving');
    fixture.componentRef.setInput('message', 'Saving');
    await fixture.whenStable();
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector('[role="status"]')!.textContent).toBe('Saving');
    expect(root.querySelector('[role="alert"]')!.textContent).toBe('');
    fixture.componentRef.setInput('state', 'error');
    fixture.componentRef.setInput('message', 'Restored previous value');
    fixture.componentRef.setInput('errorId', 'field-error');
    await fixture.whenStable();
    expect(root.querySelector('[role="status"]')!.textContent).toBe('');
    expect(root.querySelector('#field-error')!.textContent).toBe('Restored previous value');
    fixture.componentRef.setInput('state', 'idle');
    await fixture.whenStable();
    expect(root.textContent?.trim()).toBe('');
  });
});
