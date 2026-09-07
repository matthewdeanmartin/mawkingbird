import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { Auth } from '../auth';
import { LeaveChoice, LeaveDialog } from './leave-dialog';

/**
 * The exit that can clean up after itself.
 *
 * The property under test throughout: what each option promises to *keep* is what
 * it actually keeps. A "delete my anonymous data" that took a saved account with it
 * would be worse than not offering the option.
 */
describe('LeaveDialog', () => {
  let fixture: ComponentFixture<LeaveDialog>;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    TestBed.inject(Auth).enterAnonymous('https://mastodon.social');
    fixture = TestBed.createComponent(LeaveDialog);
    fixture.detectChanges();
  });

  function click(label: string): void {
    fixture.detectChanges();
    const button = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'),
    ).find((b) => b.textContent?.includes(label));
    expect(button, `no button matching "${label}"`).toBeTruthy();
    button!.click();
    fixture.detectChanges();
  }

  function chosen(): LeaveChoice[] {
    const seen: LeaveChoice[] = [];
    fixture.componentInstance.chose.subscribe((c) => seen.push(c));
    return seen;
  }

  it('offers all three ways out', () => {
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Return to the login page');
    expect(text).toContain('Delete anonymous data');
    expect(text).toContain('Remove all browser data');
  });

  it('keeps everything when the user only wants to leave', () => {
    localStorage.setItem('mockingbird_anonymous_follows', '{"follows":[]}');
    const seen = chosen();

    click('Return to the login page');

    expect(seen).toEqual(['leave']);
    expect(localStorage.getItem('mockingbird_anonymous_follows')).not.toBeNull();
  });

  it('deletes anonymous data but not a saved account', () => {
    localStorage.setItem('mockingbird_anonymous_follows', '{"follows":[]}');
    localStorage.setItem('mastodon_mock_session_tokens', '{"s1":"tok"}');
    const seen = chosen();

    click('Delete anonymous data');

    expect(seen).toEqual(['anonymous-data']);
    expect(localStorage.getItem('mockingbird_anonymous_follows')).toBeNull();
    expect(localStorage.getItem('mastodon_mock_session_tokens')).not.toBeNull();
  });

  it('removes everything, credentials included, on the full wipe', () => {
    localStorage.setItem('mockingbird_anonymous_follows', '{"follows":[]}');
    localStorage.setItem('mastodon_mock_session_tokens', '{"s1":"tok"}');
    localStorage.setItem('mockingbird_client_prefs', '{"theme":"dark"}');
    const seen = chosen();

    click('Remove all browser data');

    expect(seen).toEqual(['all-data']);
    expect(localStorage.getItem('mockingbird_anonymous_follows')).toBeNull();
    expect(localStorage.getItem('mastodon_mock_session_tokens')).toBeNull();
    expect(localStorage.getItem('mockingbird_client_prefs')).toBeNull();
  });

  it('deletes nothing when cancelled', () => {
    localStorage.setItem('mockingbird_anonymous_follows', '{"follows":[]}');
    const closed: unknown[] = [];
    fixture.componentInstance.closed.subscribe(() => closed.push(true));

    click('Cancel');

    expect(closed).toHaveLength(1);
    expect(localStorage.getItem('mockingbird_anonymous_follows')).not.toBeNull();
  });

  it('offers a backup before either destructive option', () => {
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Download my data first');
    // Stated plainly, because a backup that silently omitted the login is a
    // nasty surprise on the other end.
    expect(text).toContain('never includes passwords or access tokens');
    expect(text).toContain('follows, lists, saved posts');
  });

  it('names the account when signed in rather than saying Anonymous', () => {
    fixture.componentRef.setInput('anonymous', false);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Log out');
  });
});
