import { TestBed } from '@angular/core/testing';
import { MbContentState } from './content-state';

describe('MbContentState', () => {
  it('keeps static errors quiet and lets callers announce a later recovery', async () => {
    const fixture = TestBed.createComponent(MbContentState);
    fixture.componentRef.setInput('title', 'Could not load posts');
    fixture.componentRef.setInput('kind', 'error');
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('[role]')).toBeNull();
    fixture.componentRef.setInput('title', 'Connection restored');
    fixture.componentRef.setInput('kind', 'empty');
    fixture.componentRef.setInput('announcement', 'status');
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('[role="status"]').textContent).toContain(
      'Connection restored',
    );
    expect(fixture.nativeElement.textContent).not.toContain('Could not load posts');
  });
});
