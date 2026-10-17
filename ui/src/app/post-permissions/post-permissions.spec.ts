import { TestBed } from '@angular/core/testing';
import { describe, it, expect } from 'vitest';
import { PostPermissions, PostPermissionsValue } from './post-permissions';

describe('PostPermissions', async () => {
  async function mount(initial: PostPermissionsValue, published = false) {
    const fixture = TestBed.createComponent(PostPermissions);
    fixture.componentRef.setInput('initial', initial);
    fixture.componentRef.setInput('published', published);
    fixture.detectChanges();
    await fixture.whenStable();
    let value: PostPermissionsValue | undefined;
    fixture.componentInstance.saved.subscribe((v) => (value = v));
    return { fixture, result: () => value };
  }
  it('keeps unlisted readable by everyone while separating discovery', async () => {
    const { fixture, result } = await mount({
      visibility: 'unlisted',
      quoteApprovalPolicy: 'followers',
      muteNotifications: true,
    });
    const selects = fixture.nativeElement.querySelectorAll('select');
    expect(selects[0].value).toBe('public');
    fixture.componentInstance.apply();
    expect(result()).toEqual({
      visibility: 'unlisted',
      quoteApprovalPolicy: 'followers',
      muteNotifications: true,
    });
  });
  it('does not allow changing a published audience', async () => {
    const { fixture, result } = await mount({ visibility: 'private' }, true);
    expect(fixture.nativeElement.querySelector('select').disabled).toBe(true);
    fixture.componentInstance.apply();
    expect(result()?.visibility).toBe('private');
    expect(result()?.quoteApprovalPolicy).toBe('nobody');
  });
  it('cancelling never applies draft permissions', async () => {
    const { fixture, result } = await mount({ visibility: 'public' });
    fixture.componentInstance.closed.emit();
    expect(result()).toBeUndefined();
  });
});
