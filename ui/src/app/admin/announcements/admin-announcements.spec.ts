import { TestBed } from '@angular/core/testing';
import { of, Subject } from 'rxjs';
import { vi } from 'vitest';
import { AdminAnnouncements } from './admin-announcements';
import { AdminApi } from '../admin-api';
import { AppDialogs } from '../../app-dialogs';
import { Announcement } from '../../models';

describe('AdminAnnouncements shared publish checkbox', () => {
  it('submits the chosen publish value and keeps the draft available after failure', async () => {
    let pending = new Subject<Announcement>();
    const create = vi.fn(() => {
      pending = new Subject<Announcement>();
      return pending;
    });
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AdminApi,
          useValue: { announcements: () => of([]), createAnnouncement: create },
        },
        { provide: AppDialogs, useValue: { confirm: async () => false } },
      ],
    });
    const fixture = TestBed.createComponent(AdminAnnouncements);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const checkbox = root.querySelector<HTMLInputElement>('mb-checkbox input')!;
    expect(checkbox.checked).toBe(true);
    (root.querySelector('mb-checkbox label') as HTMLElement).click();
    const text = root.querySelector('textarea')!;
    text.value = 'Keep this draft';
    text.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    const submit = root.querySelector<HTMLButtonElement>('.new-actions button')!;
    submit.click();
    await fixture.whenStable();
    expect(create).toHaveBeenCalledWith('Keep this draft', false);
    expect(submit.disabled).toBe(true);
    pending.error(new Error('offline'));
    await fixture.whenStable();
    expect(text.value).toBe('Keep this draft');
    expect(checkbox.checked).toBe(false);
    expect(submit.disabled).toBe(false);
    submit.click();
    await fixture.whenStable();
    expect(create).toHaveBeenCalledTimes(2);
    pending.next({
      id: 'draft',
      content: 'Keep this draft',
      published: false,
      reactions: [],
      starts_at: null,
      ends_at: null,
      all_day: false,
      published_at: null,
      updated_at: null,
      read: false,
    });
    await fixture.whenStable();
    expect(text.value).toBe('');
    expect(root.textContent).toContain('Draft');
  });
});
