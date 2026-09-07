import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  AdminAccount,
  AdminMeasure,
  AdminReport,
  Announcement,
  CanonicalEmailBlock,
  DomainAllow,
  DomainBlock,
  EmailDomainBlock,
  IpBlock,
  Status,
  TrendingTag,
} from '../models';

/** Wrapper over the /api/v1/admin/* moderation surface. */
@Injectable({ providedIn: 'root' })
export class AdminApi {
  private http = inject(HttpClient);

  // --- accounts ---
  accounts(status = 'active'): Observable<AdminAccount[]> {
    const params = new HttpParams().set('origin', 'local').set('status', status);
    return this.http.get<AdminAccount[]>('/api/v2/admin/accounts', { params });
  }

  /** Apply a moderation action: disable | silence | suspend | sensitive. */
  moderate(id: string, type: string): Observable<AdminAccount> {
    return this.http.post<AdminAccount>(`/api/v1/admin/accounts/${id}/action`, { type });
  }

  enable(id: string): Observable<AdminAccount> {
    return this.http.post<AdminAccount>(`/api/v1/admin/accounts/${id}/enable`, {});
  }

  unsilence(id: string): Observable<AdminAccount> {
    return this.http.post<AdminAccount>(`/api/v1/admin/accounts/${id}/unsilence`, {});
  }

  unsuspend(id: string): Observable<AdminAccount> {
    return this.http.post<AdminAccount>(`/api/v1/admin/accounts/${id}/unsuspend`, {});
  }

  approve(id: string): Observable<AdminAccount> {
    return this.http.post<AdminAccount>(`/api/v1/admin/accounts/${id}/approve`, {});
  }

  reject(id: string): Observable<AdminAccount> {
    return this.http.post<AdminAccount>(`/api/v1/admin/accounts/${id}/reject`, {});
  }

  unsensitive(id: string): Observable<AdminAccount> {
    return this.http.post<AdminAccount>(`/api/v1/admin/accounts/${id}/unsensitive`, {});
  }

  deleteAccount(id: string): Observable<AdminAccount> {
    return this.http.delete<AdminAccount>(`/api/v1/admin/accounts/${id}`);
  }

  // --- reports ---
  reports(resolved: boolean): Observable<AdminReport[]> {
    let params = new HttpParams();
    if (resolved) {
      params = params.set('resolved', 'true');
    }
    return this.http.get<AdminReport[]>('/api/v1/admin/reports', { params });
  }

  assignReport(id: string): Observable<AdminReport> {
    return this.http.post<AdminReport>(`/api/v1/admin/reports/${id}/assign_to_self`, {});
  }

  resolveReport(id: string): Observable<AdminReport> {
    return this.http.post<AdminReport>(`/api/v1/admin/reports/${id}/resolve`, {});
  }

  reopenReport(id: string): Observable<AdminReport> {
    return this.http.post<AdminReport>(`/api/v1/admin/reports/${id}/reopen`, {});
  }

  // --- domain blocks ---
  domainBlocks(): Observable<DomainBlock[]> {
    return this.http.get<DomainBlock[]>('/api/v1/admin/domain_blocks');
  }

  createDomainBlock(domain: string, severity: string): Observable<DomainBlock> {
    return this.http.post<DomainBlock>('/api/v1/admin/domain_blocks', { domain, severity });
  }

  deleteDomainBlock(id: string): Observable<unknown> {
    return this.http.delete(`/api/v1/admin/domain_blocks/${id}`);
  }

  // --- announcements ---
  announcements(): Observable<Announcement[]> {
    return this.http.get<Announcement[]>('/api/v1/admin/announcements');
  }

  createAnnouncement(text: string, published: boolean): Observable<Announcement> {
    return this.http.post<Announcement>('/api/v1/admin/announcements', { text, published });
  }

  deleteAnnouncement(id: string): Observable<unknown> {
    return this.http.delete(`/api/v1/admin/announcements/${id}`);
  }

  publishAnnouncement(id: string): Observable<Announcement> {
    return this.http.post<Announcement>(`/api/v1/admin/announcements/${id}/publish`, {});
  }

  unpublishAnnouncement(id: string): Observable<Announcement> {
    return this.http.post<Announcement>(`/api/v1/admin/announcements/${id}/unpublish`, {});
  }

  // --- trends ---
  trendingTags(): Observable<TrendingTag[]> {
    return this.http.get<TrendingTag[]>('/api/v1/admin/trends/tags');
  }

  trendingStatuses(): Observable<Status[]> {
    return this.http.get<Status[]>('/api/v1/admin/trends/statuses');
  }

  approveTrendingTag(id: string): Observable<unknown> {
    return this.http.post(`/api/v1/admin/trends/tags/${id}/approve`, {});
  }

  rejectTrendingTag(id: string): Observable<unknown> {
    return this.http.post(`/api/v1/admin/trends/tags/${id}/reject`, {});
  }

  approveTrendingStatus(id: string): Observable<unknown> {
    return this.http.post(`/api/v1/admin/trends/statuses/${id}/approve`, {});
  }

  rejectTrendingStatus(id: string): Observable<unknown> {
    return this.http.post(`/api/v1/admin/trends/statuses/${id}/reject`, {});
  }

  // --- domain allows ---
  domainAllows(): Observable<DomainAllow[]> {
    return this.http.get<DomainAllow[]>('/api/v1/admin/domain_allows');
  }

  createDomainAllow(domain: string): Observable<DomainAllow> {
    return this.http.post<DomainAllow>('/api/v1/admin/domain_allows', { domain });
  }

  deleteDomainAllow(id: string): Observable<unknown> {
    return this.http.delete(`/api/v1/admin/domain_allows/${id}`);
  }

  // --- email domain blocks ---
  emailDomainBlocks(): Observable<EmailDomainBlock[]> {
    return this.http.get<EmailDomainBlock[]>('/api/v1/admin/email_domain_blocks');
  }

  createEmailDomainBlock(domain: string): Observable<EmailDomainBlock> {
    return this.http.post<EmailDomainBlock>('/api/v1/admin/email_domain_blocks', { domain });
  }

  deleteEmailDomainBlock(id: string): Observable<unknown> {
    return this.http.delete(`/api/v1/admin/email_domain_blocks/${id}`);
  }

  // --- canonical email blocks ---
  canonicalEmailBlocks(): Observable<CanonicalEmailBlock[]> {
    return this.http.get<CanonicalEmailBlock[]>('/api/v1/admin/canonical_email_blocks');
  }

  createCanonicalEmailBlock(email: string): Observable<CanonicalEmailBlock> {
    return this.http.post<CanonicalEmailBlock>('/api/v1/admin/canonical_email_blocks', { email });
  }

  /** Canonicalize+hash an email and return any matching canonical blocks. */
  testCanonicalEmailBlock(email: string): Observable<CanonicalEmailBlock[]> {
    return this.http.post<CanonicalEmailBlock[]>('/api/v1/admin/canonical_email_blocks/test', {
      email,
    });
  }

  deleteCanonicalEmailBlock(id: string): Observable<unknown> {
    return this.http.delete(`/api/v1/admin/canonical_email_blocks/${id}`);
  }

  // --- IP blocks ---
  ipBlocks(): Observable<IpBlock[]> {
    return this.http.get<IpBlock[]>('/api/v1/admin/ip_blocks');
  }

  createIpBlock(ip: string, severity: string, comment: string): Observable<IpBlock> {
    return this.http.post<IpBlock>('/api/v1/admin/ip_blocks', { ip, severity, comment });
  }

  deleteIpBlock(id: string): Observable<unknown> {
    return this.http.delete(`/api/v1/admin/ip_blocks/${id}`);
  }

  // --- metrics ---
  measures(keys: string[], startAt: string, endAt: string): Observable<AdminMeasure[]> {
    return this.http.post<AdminMeasure[]>('/api/v1/admin/measures', {
      keys,
      start_at: startAt,
      end_at: endAt,
    });
  }
}
