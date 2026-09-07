import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AdminApi } from './admin-api';
import { AdminAccount, AdminReport, DomainBlock } from '../models';

/**
 * Unit tests for {@link AdminApi} — verifies the HTTP method, URL, and request
 * body for each moderation endpoint. No live server; uses HttpTestingController.
 */
describe('AdminApi (HTTP isolated)', () => {
  let api: AdminApi;
  let httpMock: HttpTestingController;

  function adminAccountStub(overrides: Partial<AdminAccount> = {}): AdminAccount {
    return {
      id: '1',
      username: 'alice',
      domain: null,
      email: 'alice@example.com',
      created_at: '2024-01-01T00:00:00Z',
      role: { id: '1', name: 'Admin', permissions: 'all', highlighted: true },
      confirmed: true,
      approved: true,
      disabled: false,
      silenced: false,
      suspended: false,
      account: { id: '1', username: 'alice' } as never,
      ...overrides,
    };
  }

  function reportStub(overrides: Partial<AdminReport> = {}): AdminReport {
    return {
      id: '10',
      action_taken: false,
      category: 'spam',
      comment: '',
      created_at: '2024-01-01T00:00:00Z',
      account: null,
      target_account: null,
      assigned_account: null,
      statuses: [],
      ...overrides,
    };
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(AdminApi);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  // ---------------------------------------------------------------- accounts

  it('accounts: GETs /api/v2/admin/accounts with origin=local and status=active by default', () => {
    let result: AdminAccount[] | undefined;
    api.accounts().subscribe((a) => (result = a));

    const req = httpMock.expectOne((r) => r.url === '/api/v2/admin/accounts');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('origin')).toBe('local');
    expect(req.request.params.get('status')).toBe('active');

    req.flush([adminAccountStub({ id: '42' })]);
    expect(result![0].id).toBe('42');
  });

  it('accounts: forwards custom status param', () => {
    api.accounts('suspended').subscribe();
    const req = httpMock.expectOne((r) => r.url === '/api/v2/admin/accounts');
    expect(req.request.params.get('status')).toBe('suspended');
    req.flush([]);
  });

  it('moderate: POSTs the action type to /api/v1/admin/accounts/:id/action', () => {
    api.moderate('5', 'suspend').subscribe();
    const req = httpMock.expectOne('/api/v1/admin/accounts/5/action');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ type: 'suspend' });
    req.flush(adminAccountStub());
  });

  it('enable: POSTs empty body to /enable', () => {
    api.enable('5').subscribe();
    const req = httpMock.expectOne('/api/v1/admin/accounts/5/enable');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush(adminAccountStub());
  });

  it('unsilence: POSTs empty body to /unsilence', () => {
    api.unsilence('5').subscribe();
    const req = httpMock.expectOne('/api/v1/admin/accounts/5/unsilence');
    expect(req.request.method).toBe('POST');
    req.flush(adminAccountStub());
  });

  it('unsuspend: POSTs empty body to /unsuspend', () => {
    api.unsuspend('5').subscribe();
    const req = httpMock.expectOne('/api/v1/admin/accounts/5/unsuspend');
    expect(req.request.method).toBe('POST');
    req.flush(adminAccountStub());
  });

  it('approve: POSTs empty body to /approve', () => {
    api.approve('7').subscribe();
    const req = httpMock.expectOne('/api/v1/admin/accounts/7/approve');
    expect(req.request.method).toBe('POST');
    req.flush(adminAccountStub());
  });

  it('reject: POSTs empty body to /reject', () => {
    api.reject('7').subscribe();
    const req = httpMock.expectOne('/api/v1/admin/accounts/7/reject');
    expect(req.request.method).toBe('POST');
    req.flush(adminAccountStub());
  });

  it('deleteAccount: DELETEs /api/v1/admin/accounts/:id', () => {
    api.deleteAccount('99').subscribe();
    const req = httpMock.expectOne('/api/v1/admin/accounts/99');
    expect(req.request.method).toBe('DELETE');
    req.flush(adminAccountStub());
  });

  // ---------------------------------------------------------------- reports

  it('reports: GETs unresolved reports (no resolved param)', () => {
    api.reports(false).subscribe();
    const req = httpMock.expectOne((r) => r.url === '/api/v1/admin/reports');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.has('resolved')).toBe(false);
    req.flush([]);
  });

  it('reports: GETs resolved reports with resolved=true', () => {
    api.reports(true).subscribe();
    const req = httpMock.expectOne((r) => r.url === '/api/v1/admin/reports');
    expect(req.request.params.get('resolved')).toBe('true');
    req.flush([]);
  });

  it('assignReport: POSTs to /assign_to_self', () => {
    api.assignReport('3').subscribe();
    const req = httpMock.expectOne('/api/v1/admin/reports/3/assign_to_self');
    expect(req.request.method).toBe('POST');
    req.flush(reportStub());
  });

  it('resolveReport: POSTs to /resolve', () => {
    api.resolveReport('3').subscribe();
    const req = httpMock.expectOne('/api/v1/admin/reports/3/resolve');
    expect(req.request.method).toBe('POST');
    req.flush(reportStub());
  });

  it('reopenReport: POSTs to /reopen', () => {
    api.reopenReport('3').subscribe();
    const req = httpMock.expectOne('/api/v1/admin/reports/3/reopen');
    expect(req.request.method).toBe('POST');
    req.flush(reportStub());
  });

  // ---------------------------------------------------------------- domain blocks

  it('domainBlocks: GETs /api/v1/admin/domain_blocks', () => {
    api.domainBlocks().subscribe();
    const req = httpMock.expectOne('/api/v1/admin/domain_blocks');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('createDomainBlock: POSTs domain and severity', () => {
    let block: DomainBlock | undefined;
    api.createDomainBlock('evil.example', 'suspend').subscribe((b) => (block = b));
    const req = httpMock.expectOne('/api/v1/admin/domain_blocks');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ domain: 'evil.example', severity: 'suspend' });
    req.flush({
      id: '1',
      domain: 'evil.example',
      severity: 'suspend',
      reject_media: false,
      reject_reports: false,
      public_comment: null,
      created_at: '',
    });
    expect(block!.domain).toBe('evil.example');
  });

  it('deleteDomainBlock: DELETEs /api/v1/admin/domain_blocks/:id', () => {
    api.deleteDomainBlock('1').subscribe();
    const req = httpMock.expectOne('/api/v1/admin/domain_blocks/1');
    expect(req.request.method).toBe('DELETE');
    req.flush({});
  });

  // ---------------------------------------------------------------- announcements

  it('announcements: GETs /api/v1/admin/announcements', () => {
    api.announcements().subscribe();
    const req = httpMock.expectOne('/api/v1/admin/announcements');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('createAnnouncement: POSTs text and published flag', () => {
    api.createAnnouncement('Hello world', true).subscribe();
    const req = httpMock.expectOne('/api/v1/admin/announcements');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ text: 'Hello world', published: true });
    req.flush({ id: '1', content: 'Hello world' });
  });

  it('deleteAnnouncement: DELETEs /api/v1/admin/announcements/:id', () => {
    api.deleteAnnouncement('5').subscribe();
    const req = httpMock.expectOne('/api/v1/admin/announcements/5');
    expect(req.request.method).toBe('DELETE');
    req.flush({});
  });

  it('publishAnnouncement: POSTs to /publish', () => {
    api.publishAnnouncement('5').subscribe();
    const req = httpMock.expectOne('/api/v1/admin/announcements/5/publish');
    expect(req.request.method).toBe('POST');
    req.flush({ id: '5', content: '' });
  });

  it('unpublishAnnouncement: POSTs to /unpublish', () => {
    api.unpublishAnnouncement('5').subscribe();
    const req = httpMock.expectOne('/api/v1/admin/announcements/5/unpublish');
    expect(req.request.method).toBe('POST');
    req.flush({ id: '5', content: '' });
  });

  // ---------------------------------------------------------------- domain allows

  it('domainAllows: GETs /api/v1/admin/domain_allows', () => {
    api.domainAllows().subscribe();
    const req = httpMock.expectOne('/api/v1/admin/domain_allows');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('createDomainAllow: POSTs domain to /api/v1/admin/domain_allows', () => {
    api.createDomainAllow('good.example').subscribe();
    const req = httpMock.expectOne('/api/v1/admin/domain_allows');
    expect(req.request.body).toEqual({ domain: 'good.example' });
    req.flush({ id: '1', domain: 'good.example', created_at: '' });
  });

  it('deleteDomainAllow: DELETEs /api/v1/admin/domain_allows/:id', () => {
    api.deleteDomainAllow('2').subscribe();
    const req = httpMock.expectOne('/api/v1/admin/domain_allows/2');
    expect(req.request.method).toBe('DELETE');
    req.flush({});
  });

  // ---------------------------------------------------------------- email domain blocks

  it('emailDomainBlocks: GETs /api/v1/admin/email_domain_blocks', () => {
    api.emailDomainBlocks().subscribe();
    const req = httpMock.expectOne('/api/v1/admin/email_domain_blocks');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('createEmailDomainBlock: POSTs domain', () => {
    api.createEmailDomainBlock('spam.com').subscribe();
    const req = httpMock.expectOne('/api/v1/admin/email_domain_blocks');
    expect(req.request.body).toEqual({ domain: 'spam.com' });
    req.flush({ id: '1', domain: 'spam.com', created_at: '' });
  });

  it('deleteEmailDomainBlock: DELETEs /api/v1/admin/email_domain_blocks/:id', () => {
    api.deleteEmailDomainBlock('3').subscribe();
    const req = httpMock.expectOne('/api/v1/admin/email_domain_blocks/3');
    expect(req.request.method).toBe('DELETE');
    req.flush({});
  });

  // ---------------------------------------------------------------- canonical email blocks

  it('canonicalEmailBlocks: GETs /api/v1/admin/canonical_email_blocks', () => {
    api.canonicalEmailBlocks().subscribe();
    const req = httpMock.expectOne('/api/v1/admin/canonical_email_blocks');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('createCanonicalEmailBlock: POSTs email', () => {
    api.createCanonicalEmailBlock('bad@example.com').subscribe();
    const req = httpMock.expectOne('/api/v1/admin/canonical_email_blocks');
    expect(req.request.body).toEqual({ email: 'bad@example.com' });
    req.flush({ id: '1', canonical_email_hash: 'abc' });
  });

  it('testCanonicalEmailBlock: POSTs email to /test', () => {
    api.testCanonicalEmailBlock('test@example.com').subscribe();
    const req = httpMock.expectOne('/api/v1/admin/canonical_email_blocks/test');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ email: 'test@example.com' });
    req.flush([]);
  });

  it('deleteCanonicalEmailBlock: DELETEs /api/v1/admin/canonical_email_blocks/:id', () => {
    api.deleteCanonicalEmailBlock('4').subscribe();
    const req = httpMock.expectOne('/api/v1/admin/canonical_email_blocks/4');
    expect(req.request.method).toBe('DELETE');
    req.flush({});
  });

  // ---------------------------------------------------------------- IP blocks

  it('ipBlocks: GETs /api/v1/admin/ip_blocks', () => {
    api.ipBlocks().subscribe();
    const req = httpMock.expectOne('/api/v1/admin/ip_blocks');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('createIpBlock: POSTs ip, severity and comment', () => {
    api.createIpBlock('1.2.3.4', 'sign_up_block', 'bad actor').subscribe();
    const req = httpMock.expectOne('/api/v1/admin/ip_blocks');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      ip: '1.2.3.4',
      severity: 'sign_up_block',
      comment: 'bad actor',
    });
    req.flush({
      id: '1',
      ip: '1.2.3.4',
      severity: 'sign_up_block',
      comment: 'bad actor',
      created_at: '',
      expires_at: null,
    });
  });

  it('deleteIpBlock: DELETEs /api/v1/admin/ip_blocks/:id', () => {
    api.deleteIpBlock('9').subscribe();
    const req = httpMock.expectOne('/api/v1/admin/ip_blocks/9');
    expect(req.request.method).toBe('DELETE');
    req.flush({});
  });

  // ---------------------------------------------------------------- metrics

  it('measures: POSTs keys, start_at and end_at to /api/v1/admin/measures', () => {
    api.measures(['active_users', 'new_users'], '2024-01-01', '2024-01-31').subscribe();
    const req = httpMock.expectOne('/api/v1/admin/measures');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      keys: ['active_users', 'new_users'],
      start_at: '2024-01-01',
      end_at: '2024-01-31',
    });
    req.flush([]);
  });

  // ---------------------------------------------------------------- trending tags/statuses

  it('trendingTags: GETs /api/v1/admin/trends/tags', () => {
    api.trendingTags().subscribe();
    const req = httpMock.expectOne('/api/v1/admin/trends/tags');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('trendingStatuses: GETs /api/v1/admin/trends/statuses', () => {
    api.trendingStatuses().subscribe();
    const req = httpMock.expectOne('/api/v1/admin/trends/statuses');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('approveTrendingTag: POSTs to /approve', () => {
    api.approveTrendingTag('22').subscribe();
    const req = httpMock.expectOne('/api/v1/admin/trends/tags/22/approve');
    expect(req.request.method).toBe('POST');
    req.flush({});
  });

  it('rejectTrendingTag: POSTs to /reject', () => {
    api.rejectTrendingTag('22').subscribe();
    const req = httpMock.expectOne('/api/v1/admin/trends/tags/22/reject');
    expect(req.request.method).toBe('POST');
    req.flush({});
  });

  it('approveTrendingStatus: POSTs to /approve', () => {
    api.approveTrendingStatus('33').subscribe();
    const req = httpMock.expectOne('/api/v1/admin/trends/statuses/33/approve');
    expect(req.request.method).toBe('POST');
    req.flush({});
  });

  it('rejectTrendingStatus: POSTs to /reject', () => {
    api.rejectTrendingStatus('33').subscribe();
    const req = httpMock.expectOne('/api/v1/admin/trends/statuses/33/reject');
    expect(req.request.method).toBe('POST');
    req.flush({});
  });
});
