import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Auth } from '../../platform/session/auth';
import { ServerAnnouncements } from './server-announcements';

/** Open a folded section by its summary text (the <details> toggle event). */
function openSection(
  fixture: ComponentFixture<ServerAnnouncements>,
  label: string,
): HTMLDetailsElement {
  const details = [...(fixture.nativeElement as HTMLElement).querySelectorAll('details')].find(
    (d) => d.querySelector('summary')?.textContent?.includes(label),
  )!;
  details.open = true;
  details.dispatchEvent(new Event('toggle'));
  fixture.detectChanges();
  return details;
}

describe('ServerAnnouncements privacy policy and moderated servers', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    TestBed.inject(Auth).token.set('server-page-token');
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function setUp(): ComponentFixture<ServerAnnouncements> {
    const fixture = TestBed.createComponent(ServerAnnouncements);
    fixture.detectChanges();
    // The page's own loads: announcements and the instance header.
    http
      .match((r) => r.url.includes('/instance') && !r.url.includes('/instance/'))
      .forEach((r) =>
        r.flush({
          title: 'Home',
          domain: 'home.example',
          description: '',
          version: '4.5.0',
          thumbnail: { url: null },
          usage: { users: { active_month: 1 } },
        }),
      );
    http.match(() => true).forEach((r) => r.flush([]));
    fixture.detectChanges();
    return fixture;
  }

  it('fetches nothing for the folded sections until one is opened', () => {
    setUp();
    http.expectNone('/api/v1/instance/privacy_policy');
    http.expectNone('/api/v1/instance/domain_blocks');
  });

  it('shows the privacy policy once, with its date, when opened', () => {
    const fixture = setUp();
    const section = openSection(fixture, 'Privacy policy');
    http
      .expectOne('/api/v1/instance/privacy_policy')
      .flush({ updated_at: '2026-01-02T00:00:00Z', content: '<p>We keep little.</p>' });
    fixture.detectChanges();
    expect(section.querySelector('.server-policy')?.textContent).toContain('We keep little.');
    expect(section.textContent).toContain('Last updated');

    section.open = false;
    section.dispatchEvent(new Event('toggle'));
    openSection(fixture, 'Privacy policy');
    http.expectNone('/api/v1/instance/privacy_policy');
  });

  it('lists moderated servers with severity and reason', () => {
    const fixture = setUp();
    const section = openSection(fixture, 'Moderated servers');
    http.expectOne('/api/v1/instance/domain_blocks').flush([
      { domain: 'spam.example', digest: 'd1', severity: 'suspend', comment: 'Spam' },
      { domain: 'loud.ex*mple', digest: 'd2', severity: 'silence', comment: null },
    ]);
    fixture.detectChanges();
    const rows = [...section.querySelectorAll('.moderated-servers li')].map((li) =>
      [...li.children].map((part) => part.textContent?.trim()).join(' '),
    );
    expect(rows).toEqual(['spam.example Suspended Spam', 'loud.ex*mple Limited No reason given']);
  });

  it('says the list is private on 403 and unshared on 404', () => {
    let fixture = setUp();
    let section = openSection(fixture, 'Moderated servers');
    http
      .expectOne('/api/v1/instance/domain_blocks')
      .flush('', { status: 403, statusText: 'Forbidden' });
    fixture.detectChanges();
    expect(section.textContent).toContain('keeps its list of moderated servers private');

    fixture.destroy();
    fixture = setUp();
    section = openSection(fixture, 'Moderated servers');
    http
      .expectOne('/api/v1/instance/domain_blocks')
      .flush('', { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();
    expect(section.textContent).toContain('does not share a list');
  });
});
