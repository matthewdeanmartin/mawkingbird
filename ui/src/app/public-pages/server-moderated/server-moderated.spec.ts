import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Auth } from '../../platform/session/auth';
import { ServerModerated } from './server-moderated';

describe('ServerModerated', () => {
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

  function setUp(): ComponentFixture<ServerModerated> {
    const fixture = TestBed.createComponent(ServerModerated);
    fixture.detectChanges();
    return fixture;
  }

  it('lists moderated servers with severity and reason', () => {
    const fixture = setUp();
    http.expectOne('/api/v1/instance/domain_blocks').flush([
      { domain: 'spam.example', digest: 'd1', severity: 'suspend', comment: 'Spam' },
      { domain: 'loud.ex*mple', digest: 'd2', severity: 'silence', comment: null },
    ]);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const rows = [...el.querySelectorAll('.moderated-servers li')].map((li) =>
      [...li.children].map((part) => part.textContent?.trim()).join(' '),
    );
    expect(rows).toEqual(['spam.example Suspended Spam', 'loud.ex*mple Limited No reason given']);
  });

  it('says the list is private on 403 and unshared on 404', () => {
    let fixture = setUp();
    http
      .expectOne('/api/v1/instance/domain_blocks')
      .flush('', { status: 403, statusText: 'Forbidden' });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(
      'keeps its list of moderated servers private',
    );

    fixture.destroy();
    fixture = setUp();
    http
      .expectOne('/api/v1/instance/domain_blocks')
      .flush('', { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('does not share a list');
  });
});
