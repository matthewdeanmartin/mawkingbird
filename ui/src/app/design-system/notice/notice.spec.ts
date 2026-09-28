import { TestBed } from '@angular/core/testing';
import { MbNotice } from './notice';

describe('MbNotice', () => {
  it('keeps static notices quiet and makes announcements an explicit caller decision', async () => {
    const fixture = TestBed.createComponent(MbNotice);
    fixture.componentRef.setInput('title', 'Connection unavailable');
    fixture.componentRef.setInput('tone', 'error');
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('[role]')).toBeNull();
    fixture.componentRef.setInput('announcement', 'alert');
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
      'Connection unavailable',
    );
    fixture.componentRef.setInput('announcement', 'off');
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('[role]')).toBeNull();
  });
});
