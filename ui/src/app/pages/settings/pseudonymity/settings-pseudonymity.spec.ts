import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { PrivateLikes } from '../../../private-likes';
import { Status } from '../../../models';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { Auth } from '../../../auth';
import { ClientLists } from '../../../lists/client-lists';
import { Pseudonymity } from '../../../pseudonymity';
import { PrivateFollows } from '../../../private-follows';
import { Account } from '../../../models';
import { SettingsPseudonymity } from './settings-pseudonymity';

describe('SettingsPseudonymity', () => {
  it('lists and removes private likes without enabling PA', () => {
    const likes = TestBed.inject(PrivateLikes).current()!;
    likes.toggle({
      id: '1',
      url: 'https://social.example/1',
      content: '<p>Pizza</p>',
      account: { acct: 'pizza' },
    } as Status);
    const fixture = TestBed.createComponent(SettingsPseudonymity);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Private likes: 1 of 200');
    expect(el.querySelector('a[href="https://social.example/1"]')?.textContent).toContain('Pizza');
    (
      el.querySelector('button[aria-label="Remove private like for pizza"]') as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    expect(el.textContent).toContain('No private likes yet.');
    expect(likes.likes()).toHaveLength(0);
  });
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    TestBed.inject(Auth).setToken('settings-account');
  });

  it('shows existing private collections and browser-only action descriptions', () => {
    TestBed.inject(ClientLists).create('Pizza');
    const fixture = TestBed.createComponent(SettingsPseudonymity);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('1 lists in this browser');
    expect(el.textContent).toContain('Private follows');
    expect(el.textContent).toContain('Private likes');
    expect(el.textContent).toContain('No private likes yet.');
    expect(el.textContent).toContain('No network like or notification is sent.');
    expect(el.querySelector('a')?.getAttribute('href')).toBe('/feeds?section=client-lists');
    expect(el.querySelector('input[name="pseudonymity-reminder"]')).toBeNull();
  });

  it('enables the reminder with PA and lets the user disable it independently', async () => {
    const fixture = TestBed.createComponent(SettingsPseudonymity);
    fixture.detectChanges();
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    (el.querySelector('input[name="pseudonymity"]') as HTMLInputElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    const reminder = el.querySelector('input[name="pseudonymity-reminder"]') as HTMLInputElement;
    expect(reminder.checked).toBe(true);
    reminder.click();
    fixture.detectChanges();
    expect(TestBed.inject(Pseudonymity).enabled()).toBe(true);
    expect(TestBed.inject(Pseudonymity).reminder()).toBe(false);
  });

  it('manages private follows and updates the limit count without enabling PA', () => {
    const store = TestBed.inject(PrivateFollows).current()!;
    store.follow(
      {
        id: '12',
        username: 'pizza',
        acct: 'pizza@social.example',
        url: 'https://social.example/@pizza',
      } as Account,
      'https://social.example',
    );
    const fixture = TestBed.createComponent(SettingsPseudonymity);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Private follows: 1 of 50');
    const remove = el.querySelector(
      'button[aria-label="Remove private follow for pizza@social.example"]',
    ) as HTMLButtonElement;
    remove.click();
    fixture.detectChanges();
    expect(el.textContent).toContain('Private follows: 0 of 50');
    expect(store.count()).toBe(0);
    expect(TestBed.inject(Pseudonymity).enabled()).toBe(false);
  });
});
