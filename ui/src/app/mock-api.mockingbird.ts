import { Injectable } from '@angular/core';
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
 * Mocking Bird stub for {@link MockApi}. The mock-server control plane does not exist on
 * real instances, and the UI surface that would call these is compiled out (login tabs,
 * fault route). Methods are retained for type compatibility but never invoked; they throw
 * if reached. Crucially, this file contains no `_mock/*` URLs, so they don't ship.
 */
@Injectable({ providedIn: 'root' })
export class MockApi {
  private unavailable(): never {
    throw new Error('Mock-server endpoints are unavailable in the Mocking Bird client.');
  }

  createDevUser(_admin: boolean): Observable<DevUser> {
    return this.unavailable();
  }

  listDevUsers(): Observable<DevUser[]> {
    return this.unavailable();
  }

  seedSampleData(_preset: string): Observable<{ report: GenerationReport }> {
    return this.unavailable();
  }

  mockLogin(_username: string): Observable<{ access_token: string }> {
    return this.unavailable();
  }

  listFaults(): Observable<FaultRule[]> {
    return this.unavailable();
  }

  addFault(_rule: FaultRuleDraft): Observable<FaultRule> {
    return this.unavailable();
  }

  deleteFault(_id: string): Observable<unknown> {
    return this.unavailable();
  }

  clearFaults(): Observable<unknown> {
    return this.unavailable();
  }

  mockSettings(): Observable<MockSettings> {
    return this.unavailable();
  }

  updateMockSettings(_changes: Partial<MockSettings>): Observable<MockSettings> {
    return this.unavailable();
  }

  invites(): Observable<Invite[]> {
    return this.unavailable();
  }

  createInvite(_draft: {
    max_uses?: number | null;
    expires_in?: number | null;
  }): Observable<Invite> {
    return this.unavailable();
  }

  revokeInvite(_id: string): Observable<Invite> {
    return this.unavailable();
  }

  authorizedApps(): Observable<AuthorizedApp[]> {
    return this.unavailable();
  }

  exportCsv(_kind: 'following' | 'mutes' | 'blocks'): Observable<string> {
    return this.unavailable();
  }

  importCsv(_kind: 'following' | 'mutes' | 'blocks', _csv: string): Observable<ImportReport> {
    return this.unavailable();
  }
}
