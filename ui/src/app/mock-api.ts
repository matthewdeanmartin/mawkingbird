import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  AuthorizedApp,
  DevUser,
  FaultRule,
  FaultRuleDraft,
  GenerationReport,
  ImportReport,
  Invite,
  MockSettings,
} from './models';

/**
 * Mock-server-only control plane (`/api/v1/_mock/*`): dev login, sample-data seeding,
 * and fault injection. These endpoints exist only on mastodon_mock, never on a real
 * Mastodon instance.
 *
 * In the standalone "Mocking Bird" build this file is replaced by `mock-api.mockingbird.ts`
 * (a stub that throws) via angular.json `fileReplacements`, so the `_mock/*` URLs are not
 * present in the shipped bundle. Callers gate their use on `environment.mockTooling`.
 */
@Injectable({ providedIn: 'root' })
export class MockApi {
  private http = inject(HttpClient);

  createDevUser(admin: boolean): Observable<DevUser> {
    return this.http.post<DevUser>('/api/v1/_mock/dev_user', { admin });
  }

  listDevUsers(): Observable<DevUser[]> {
    return this.http.get<DevUser[]>('/api/v1/_mock/dev_users');
  }

  /** Bulk-generate a throwaway sample cohort using a named preset. */
  seedSampleData(preset: string): Observable<{ report: GenerationReport }> {
    return this.http.post<{ report: GenerationReport }>('/api/v1/_mock/sample_data', { preset });
  }

  /** Mint a fresh user token for an existing local account (no password). */
  mockLogin(username: string): Observable<{ access_token: string }> {
    return this.http.post<{ access_token: string }>('/api/v1/_mock/login', { username });
  }

  // --- fault injection ---
  listFaults(): Observable<FaultRule[]> {
    return this.http.get<FaultRule[]>('/api/v1/_mock/faults');
  }

  addFault(rule: FaultRuleDraft): Observable<FaultRule> {
    return this.http.post<FaultRule>('/api/v1/_mock/faults', rule);
  }

  deleteFault(id: string): Observable<unknown> {
    return this.http.delete(`/api/v1/_mock/faults/${id}`);
  }

  clearFaults(): Observable<unknown> {
    return this.http.delete('/api/v1/_mock/faults');
  }

  // --- mock-only settings, invites, apps, and CSV import/export ---
  //
  // These moved here from `Api`. They are mock-server endpoints like everything
  // else in this class, but living on `Api` meant their URLs were compiled into
  // the standalone client, where no server answers them. Real Mastodon has no
  // public equivalent for any of them: settings and invites are web-UI only, and
  // follows/mutes/blocks CSV is an account-export download, not this endpoint.
  mockSettings(): Observable<MockSettings> {
    return this.http.get<MockSettings>('/api/v1/_mock/settings');
  }

  updateMockSettings(changes: Partial<MockSettings>): Observable<MockSettings> {
    return this.http.put<MockSettings>('/api/v1/_mock/settings', changes);
  }

  invites(): Observable<Invite[]> {
    return this.http.get<Invite[]>('/api/v1/_mock/invites');
  }

  createInvite(draft: {
    max_uses?: number | null;
    expires_in?: number | null;
  }): Observable<Invite> {
    return this.http.post<Invite>('/api/v1/_mock/invites', draft);
  }

  revokeInvite(id: string): Observable<Invite> {
    return this.http.delete<Invite>(`/api/v1/_mock/invites/${id}`);
  }

  authorizedApps(): Observable<AuthorizedApp[]> {
    return this.http.get<AuthorizedApp[]>('/api/v1/_mock/apps');
  }

  exportCsv(kind: 'following' | 'mutes' | 'blocks'): Observable<string> {
    return this.http.get(`/api/v1/_mock/export/${kind}`, { responseType: 'text' });
  }

  importCsv(kind: 'following' | 'mutes' | 'blocks', csv: string): Observable<ImportReport> {
    return this.http.post<ImportReport>('/api/v1/_mock/import', { type: kind, csv });
  }
}
