import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Auth } from '../auth';
import { FollowState } from '../follow-state';
import { Account } from '../models';
import { FollowButton } from './follow-button';

describe('FollowButton shared presentation', () => {
  const status = signal('not-following');
  const busy = signal(false);
  let auth: { isAnonymous: boolean; account: () => { id: string } };
  let follows: {
    status: ReturnType<typeof vi.fn>;
    busyWith: ReturnType<typeof vi.fn>;
    toggle: ReturnType<typeof vi.fn>;
    resolveForeign: ReturnType<typeof vi.fn>;
    resolve: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    status.set('not-following');
    busy.set(false);
    auth = { isAnonymous: false, account: () => ({ id: 'self' }) };
    follows = {
      status: vi.fn(() => status()),
      busyWith: vi.fn(() => busy()),
      toggle: vi.fn().mockResolvedValue(true),
      resolveForeign: vi.fn().mockResolvedValue({ id: 'resolved' }),
      resolve: vi.fn().mockResolvedValue(undefined),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: Auth, useValue: auth },
        { provide: FollowState, useValue: follows },
      ],
    });
  });

  function render(id = 'other') {
    const fixture = TestBed.createComponent(FollowButton);
    fixture.componentRef.setInput('accountId', id);
    fixture.componentRef.setInput('handle', '@reader');
    fixture.detectChanges();
    return fixture;
  }

  it('keeps Follow, Following and Requested distinct on the shared native button', async () => {
    const fixture = render();
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    expect(button.hasAttribute('mbButton')).toBe(true);
    expect(button.getAttribute('data-variant')).toBe('outline');
    expect(button.getAttribute('aria-label')).toBe('Follow @reader');
    for (const [state, label] of [
      ['following', 'Following'],
      ['requested', 'Requested'],
    ]) {
      status.set(state);
      await fixture.whenStable();
      expect(button.textContent?.trim()).toBe(label);
      expect(button.getAttribute('data-variant')).toBe('solid');
      expect(button.getAttribute('aria-label')).toBe(`${label} @reader`);
    }
    busy.set(true);
    await fixture.whenStable();
    expect(button.disabled).toBe(true);
    expect(button.textContent?.trim()).toBe('…');
  });

  it('continues hiding anonymous, self and unresolved local relationships', () => {
    auth.isAnonymous = true;
    expect(render().nativeElement.querySelector('button')).toBeNull();
    auth.isAnonymous = false;
    expect(render('self').nativeElement.querySelector('button')).toBeNull();
    status.set('unknown');
    expect(render().nativeElement.querySelector('button')).toBeNull();
  });

  it('does not navigate the row, reports failed writes and emits only successful changes', async () => {
    follows.toggle.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const fixture = render();
    const changed = vi.fn();
    fixture.componentInstance.changed.subscribe(changed);
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    button.dispatchEvent(event);
    await fixture.whenStable();
    expect(event.defaultPrevented).toBe(true);
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
      "Couldn't update this follow",
    );
    expect(changed).not.toHaveBeenCalled();
    button.click();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
    expect(changed).toHaveBeenCalledOnce();
  });

  it('resolves foreign accounts only on intent and never undoes an existing relationship', async () => {
    const fixture = render('foreign-id');
    fixture.componentRef.setInput('foreign', { id: 'foreign-id' } as Account);
    await fixture.whenStable();
    expect(follows.resolveForeign).not.toHaveBeenCalled();
    follows.resolve.mockImplementation(async () => status.set('following'));
    fixture.nativeElement.querySelector('button').click();
    await fixture.whenStable();
    expect(follows.resolveForeign).toHaveBeenCalledOnce();
    expect(follows.resolve).toHaveBeenCalledWith(['resolved']);
    expect(follows.toggle).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('button').textContent.trim()).toBe('Following');
  });
});
