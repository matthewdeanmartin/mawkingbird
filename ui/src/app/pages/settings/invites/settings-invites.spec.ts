import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WritableSignal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Invite } from '../../../models';
import { SettingsInvites } from './settings-invites';

/** Exposes SettingsInvites' protected signals for white-box testing. */
interface SettingsInvitesInternals {
  invites: WritableSignal<Invite[]>;
  maxUses: WritableSignal<number | null>;
  expiresIn: WritableSignal<number | null>;
  generate(): void;
  revoke(invite: Invite): void;
}

function internals(fixture: ComponentFixture<SettingsInvites>): SettingsInvitesInternals {
  return fixture.componentInstance as unknown as SettingsInvitesInternals;
}

function makeInvite(id: string, overrides: Partial<Invite> = {}): Invite {
  return {
    id,
    code: `code-${id}`,
    url: `https://example.com/invite/code-${id}`,
    max_uses: null,
    uses: 0,
    expires_at: null,
    created_at: '2026-01-01T00:00:00Z',
    revoked: false,
    ...overrides,
  };
}

describe('SettingsInvites', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  function setUp(): ComponentFixture<SettingsInvites> {
    const fixture = TestBed.createComponent(SettingsInvites);
    fixture.detectChanges();
    return fixture;
  }

  it('loads invites on init', () => {
    const fixture = setUp();
    const i1 = makeInvite('1');
    httpMock.expectOne('/api/v1/_mock/invites').flush([i1]);

    expect(internals(fixture).invites()).toEqual([i1]);
  });

  it('generate() POSTs the draft and reloads the list', () => {
    const fixture = setUp();
    httpMock.expectOne('/api/v1/_mock/invites').flush([]);

    internals(fixture).maxUses.set(5);
    internals(fixture).expiresIn.set(86400);
    internals(fixture).generate();

    const req = httpMock.expectOne((r) => r.method === 'POST' && r.url === '/api/v1/_mock/invites');
    expect(req.request.body).toEqual({ max_uses: 5, expires_in: 86400 });
    const created = makeInvite('2', { max_uses: 5 });
    req.flush(created);

    httpMock
      .expectOne((r) => r.method === 'GET' && r.url === '/api/v1/_mock/invites')
      .flush([created]);
    expect(internals(fixture).invites()).toEqual([created]);
  });

  it('revoke() DELETEs the invite and updates the row in place', () => {
    const fixture = setUp();
    const i1 = makeInvite('1');
    const i2 = makeInvite('2');
    httpMock.expectOne('/api/v1/_mock/invites').flush([i1, i2]);

    internals(fixture).revoke(i1);

    const req = httpMock.expectOne('/api/v1/_mock/invites/1');
    expect(req.request.method).toBe('DELETE');
    req.flush({ ...i1, revoked: true });

    expect(internals(fixture).invites()).toEqual([{ ...i1, revoked: true }, i2]);
  });
});
