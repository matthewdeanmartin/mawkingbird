import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StorageDiagnostics } from './storage-diagnostics';
import { RemoteStorageUsage } from '../../observability/remote-storage-usage';

describe('StorageDiagnostics', () => {
  let fixture: ComponentFixture<StorageDiagnostics>;

  function text(): string {
    return fixture.nativeElement.textContent ?? '';
  }

  beforeEach(async () => {
    localStorage.clear();
    localStorage.setItem('mockingbird_rss_feeds', JSON.stringify(['a', 'b']));
    localStorage.setItem('mastodon_mock_token', 'alan_token');
    TestBed.configureTestingModule({
      imports: [StorageDiagnostics],
      providers: [provideRouter([])],
    });
    fixture = TestBed.createComponent(StorageDiagnostics);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('lists every localStorage key with its size', () => {
    expect(text()).toContain('mockingbird_rss_feeds');
    expect(text()).toContain('mastodon_mock_token');
  });

  it('labels known keys, so the list is not just opaque slugs', () => {
    const component = fixture.componentInstance;
    expect(component.keyNote('mockingbird_api_metrics:https%3A%2F%2Fx.test')).toBe('API metrics');
    expect(component.keyNote('mockingbird_route_log')).toBe('route log');
    expect(component.keyNote('mastodon_mock_token')).toBe('session');
    expect(component.keyNote('something_else')).toBe('');
  });

  it('deletes a key only after the confirmation is accepted', () => {
    const component = fixture.componentInstance;
    const entry = { key: 'mockingbird_rss_feeds', bytes: 10, valueChars: 10 };

    vi.spyOn(window, 'confirm').mockReturnValue(false);
    component.deleteKey(entry);
    expect(localStorage.getItem('mockingbird_rss_feeds')).not.toBeNull();

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    component.deleteKey(entry);
    expect(localStorage.getItem('mockingbird_rss_feeds')).toBeNull();
  });

  it('re-scans on refresh, so a key deleted elsewhere disappears', () => {
    const component = fixture.componentInstance;
    const before = component['storage']().entries.length;
    localStorage.removeItem('mastodon_mock_token');
    component.refreshStorage();
    expect(component['storage']().entries.length).toBe(before - 1);
  });

  describe('remote storage', () => {
    it('invites the reader to sync when nothing has ever been recorded', () => {
      expect(text()).toContain('Nothing synced from this browser yet');
    });

    it('shows the figure, the allowance and the tier once one is known', async () => {
      TestBed.inject(RemoteStorageUsage).record(
        { used: 25 * 1024 * 1024, limit: 100 * 1024 * 1024 },
        'paid',
      );
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(text()).toContain('25.00 MB');
      expect(text()).toContain('100.00 MB');
      expect(text()).toContain('(25.0%)');
      expect(text()).toContain('paid plan');
      // The reading's age is shown, so a stale number is visibly stale rather
      // than passing for a live one.
      expect(text()).not.toContain('read never');
    });

    it('draws the quota bar even for an empty account', async () => {
      TestBed.inject(RemoteStorageUsage).record({ used: 0, limit: 100 }, 'free');
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.quota-bar')).not.toBeNull();
    });
  });

  it('links back to Observability', () => {
    const link: HTMLAnchorElement | null = fixture.nativeElement.querySelector(
      'a[href="/observability"]',
    );
    expect(link).not.toBeNull();
  });
});
