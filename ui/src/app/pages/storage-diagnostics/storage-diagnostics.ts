import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import {
  DatabaseInfo,
  IndexedDbReport,
  inspectIndexedDb,
  totalRecords,
} from '../../observability/indexed-db-inspector';
import {
  StorageEntry,
  StorageReport,
  formatBytes,
  inspectLocalStorage,
} from '../../observability/local-storage-inspector';
import { RemoteStorageUsage } from '../../observability/remote-storage-usage';

/**
 * Storage Diagnostics — what this app is keeping on this device, and how much
 * room is left.
 *
 * ## Why it left the Observability page
 *
 * The two pages answer questions that arrive on different days. Observability
 * is about *behaviour over time* — is the API slow, is something erroring, and
 * both of its charts are read by comparing today with last week. Storage is a
 * point-in-time inventory: what is here right now, and what can I delete. They
 * shared a page only because both are diagnostics, which is a statement about
 * their genre rather than about when anyone needs them.
 *
 * Splitting them also makes the destructive controls easier to reason about.
 * Every delete in the app's own storage lives here, so "the page where things
 * can be removed" is one place rather than a section two screens down a page
 * that is otherwise read-only.
 *
 *  - **Local storage** — per-key sizes, with delete. This is where the app
 *    actually keeps its data.
 *  - **IndexedDB & quota** — databases on this origin, and the browser's own
 *    accounting for the whole site, which is what it checks before evicting.
 *
 * Everything here is a live scan of this browser. Nothing is sent anywhere.
 */
// i18n storageDiagnostics.title: Storage Diagnostics
// i18n storageDiagnostics.intro: What this app is keeping on this device, and how much room the browser will give it. Every figure here is a live scan of this browser — nothing on this page is sent anywhere.
// i18n storageDiagnostics.backToObservability: ← Observability
// i18n storageDiagnostics.localHeading: Local storage
// i18n storageDiagnostics.refresh: Refresh
// i18n storageDiagnostics.tileKeys: keys
// i18n storageDiagnostics.tileTotalSize: total size
// i18n storageDiagnostics.tileLargestKey: largest key
// i18n storageDiagnostics.localNote: This is where the app actually keeps its data — settings, feeds, lists and the metrics behind the Observability page. Deleting a key here is immediate and permanent; the app will rebuild what it can and forget the rest.
// i18n storageDiagnostics.colKey: Key
// i18n storageDiagnostics.colSize: Size
// i18n storageDiagnostics.colChars: Chars
// i18n storageDiagnostics.deleteKeyAriaLabel: Delete {{key}}
// i18n storageDiagnostics.delete: Delete
// i18n storageDiagnostics.localEmpty: Local storage is empty.
// i18n storageDiagnostics.remoteHeading: Remote storage
// i18n storageDiagnostics.remotePlan: {{tier}} plan
// i18n storageDiagnostics.remoteUsed: used on the profile service
// i18n storageDiagnostics.remoteAllowance: allowance
// i18n storageDiagnostics.remoteBarAriaLabel: Remote storage: {{label}}
// i18n storageDiagnostics.remoteNote: {{label}} — as counted by the profile service itself, read {{when}}. The figure updates whenever settings sync talks to the service, so it can lag a recent change until the next sync.
// i18n storageDiagnostics.remoteEmpty: Nothing synced from this browser yet. Turn on settings sync to store settings on the profile service and see the figure here.
// i18n storageDiagnostics.idbHeading: IndexedDB &amp; quota
// i18n storageDiagnostics.idbNote: This app keeps its data in local storage, not IndexedDB — so an entry here is something else on this origin. The quota figure covers <em>all</em> browser storage for this site, which is what the browser actually checks before evicting anything.
// i18n storageDiagnostics.idbPersistent: Storage is persistent: this origin is exempt from automatic eviction.
// i18n storageDiagnostics.colDatabase: Database
// i18n storageDiagnostics.colVersion: Version
// i18n storageDiagnostics.colObjectStores: Object stores
// i18n storageDiagnostics.colRecords: Records
// i18n storageDiagnostics.idbEmpty: No IndexedDB databases on this origin.
// i18n storageDiagnostics.scanning: Scanning…
// i18n storageDiagnostics.keyNoteApiMetrics: API metrics
// i18n storageDiagnostics.keyNoteRouteLog: route log
// i18n storageDiagnostics.keyNoteMockingbird: Mawkingbird
// i18n storageDiagnostics.keyNoteSession: session
// i18n storageDiagnostics.deleteConfirm: Delete localStorage key "{{key}}"? This can’t be undone.
// i18n storageDiagnostics.remoteWhenNever: never
// i18n storageDiagnostics.quotaUnavailable: Storage usage unavailable in this browser.
// i18n storageDiagnostics.quotaUsed: {{used}} used
// i18n storageDiagnostics.quotaUsedOfTotal: {{used}} of {{total}}{{pct}}
// i18n storageDiagnostics.noObjectStores: no object stores
@Component({
  selector: 'app-storage-diagnostics',
  imports: [RouterLink, TranslocoPipe],
  templateUrl: './storage-diagnostics.html',
  styleUrls: ['../observability/diagnostics-shared.css', './storage-diagnostics.css'],
})
export class StorageDiagnostics {
  protected readonly formatBytes = formatBytes;
  protected readonly totalRecords = totalRecords;

  private readonly transloco = inject(TranslocoService);

  constructor() {
    void this.refreshIndexedDb();
  }

  // ---------------------------------------------------- localStorage inspector

  protected readonly storage = signal<StorageReport>(inspectLocalStorage());

  refreshStorage(): void {
    this.storage.set(inspectLocalStorage());
  }

  /** Human label for a known key, so the list isn't just opaque slugs. */
  keyNote(key: string): string {
    if (key.startsWith('mockingbird_api_metrics:')) {
      return this.transloco.translate<string>('storageDiagnostics.keyNoteApiMetrics');
    }
    if (key === 'mockingbird_route_log') {
      return this.transloco.translate<string>('storageDiagnostics.keyNoteRouteLog');
    }
    if (key.startsWith('mockingbird_')) {
      return this.transloco.translate<string>('storageDiagnostics.keyNoteMockingbird');
    }
    if (key.startsWith('mastodon_mock_')) {
      return this.transloco.translate<string>('storageDiagnostics.keyNoteSession');
    }
    return '';
  }

  deleteKey(entry: StorageEntry): void {
    const message = this.transloco.translate<string>('storageDiagnostics.deleteConfirm', {
      key: entry.key,
    });
    if (!confirm(message)) {
      return;
    }
    localStorage.removeItem(entry.key);
    this.refreshStorage();
  }

  /** The largest keys, which are the ones worth looking at first. */
  protected readonly biggest = computed(() => {
    const entries = this.storage().entries;
    return entries.length ? entries.reduce((a, b) => (b.bytes > a.bytes ? b : a)) : null;
  });

  // ---------------------------------------------------------- remote storage

  private remoteStorage = inject(RemoteStorageUsage);

  protected readonly remote = this.remoteStorage.usage;

  /** Fraction of the remote allowance used, 0–1, or null when unknown. */
  protected remoteRatio(): number | null {
    return this.remoteStorage.ratio();
  }

  /** `"12.4 MB of 100 MB (12.4%)"`. */
  protected remoteLabel(): string {
    const u = this.remote();
    if (!u) {
      return '';
    }
    const ratio = this.remoteRatio();
    const pct = ratio === null ? '' : ` (${(ratio * 100).toFixed(1)}%)`;
    return `${formatBytes(u.used)} of ${formatBytes(u.limit)}${pct}`;
  }

  /** When the figure was read, so a stale number is visibly stale. */
  protected remoteWhen(): string {
    const u = this.remote();
    return u?.at
      ? new Date(u.at).toLocaleString()
      : this.transloco.translate<string>('storageDiagnostics.remoteWhenNever');
  }

  // --------------------------------------------------------------- IndexedDB

  protected readonly idb = signal<IndexedDbReport | null>(null);
  protected readonly idbLoading = signal(false);

  async refreshIndexedDb(): Promise<void> {
    this.idbLoading.set(true);
    try {
      this.idb.set(await inspectIndexedDb());
    } finally {
      this.idbLoading.set(false);
    }
  }

  /** `"12.4 MB of 2.1 GB (0.6%)"`, or a shorter form when the browser is coy. */
  protected quotaLabel(): string {
    const q = this.idb()?.quota;
    if (!q || q.usage === null) {
      return this.transloco.translate<string>('storageDiagnostics.quotaUnavailable');
    }
    const used = formatBytes(q.usage);
    if (q.quota === null) {
      return this.transloco.translate<string>('storageDiagnostics.quotaUsed', { used });
    }
    const pct = q.ratio === null ? '' : ` (${(q.ratio * 100).toFixed(1)}%)`;
    return this.transloco.translate<string>('storageDiagnostics.quotaUsedOfTotal', {
      used,
      total: formatBytes(q.quota),
      pct,
    });
  }

  protected storeSummary(db: DatabaseInfo): string {
    if (db.error) {
      return db.error;
    }
    if (!db.stores.length) {
      return this.transloco.translate<string>('storageDiagnostics.noObjectStores');
    }
    return db.stores.map((s) => `${s.name} (${s.count ?? '?'})`).join(', ');
  }
}
