import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Auth } from '../../platform/session/auth';
import { ServerPrivacy } from './server-privacy';

describe('ServerPrivacy', () => {
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

  it('shows the privacy policy with its date', () => {
    const fixture = TestBed.createComponent(ServerPrivacy);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Loading the privacy policy');
    http
      .expectOne('/api/v1/instance/privacy_policy')
      .flush({ updated_at: '2026-01-02T00:00:00Z', content: '<p>We keep little.</p>' });
    fixture.detectChanges();
    expect(el.querySelector('.server-policy')?.textContent).toContain('We keep little.');
    expect(el.textContent).toContain('Last updated');
  });

  it('says there is none for an empty policy or an error', () => {
    let fixture = TestBed.createComponent(ServerPrivacy);
    fixture.detectChanges();
    http.expectOne('/api/v1/instance/privacy_policy').flush({ updated_at: null, content: '  ' });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('has not published a privacy policy');

    fixture.destroy();
    fixture = TestBed.createComponent(ServerPrivacy);
    fixture.detectChanges();
    http
      .expectOne('/api/v1/instance/privacy_policy')
      .flush('', { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('has not published a privacy policy');
  });
});
