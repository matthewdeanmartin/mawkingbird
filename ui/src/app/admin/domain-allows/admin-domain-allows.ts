import { Component, inject, OnInit, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { FormsModule } from '@angular/forms';
import { AdminApi } from '../admin-api';
import { DomainAllow } from '../../models';

// i18n adminDomainAllows.placeholder: domain to allow (e.g. friendly.example)
// i18n adminDomainAllows.allow: Allow
// i18n adminDomainAllows.loading: Loading…
// i18n adminDomainAllows.empty: No allowed domains.
// i18n adminDomainAllows.remove: Remove

@Component({
  selector: 'app-admin-domain-allows',
  imports: [FormsModule, TranslocoPipe],
  templateUrl: './admin-domain-allows.html',
  styleUrl: './admin-lists.css',
})
export class AdminDomainAllows implements OnInit {
  private api = inject(AdminApi);

  protected allows = signal<DomainAllow[]>([]);
  protected loading = signal(true);
  protected newDomain = signal('');
  protected submitting = signal(false);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.domainAllows().subscribe({
      next: (a) => {
        this.allows.set(a);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  add(): void {
    const domain = this.newDomain().trim();
    if (!domain || this.submitting()) {
      return;
    }
    this.submitting.set(true);
    this.api.createDomainAllow(domain).subscribe({
      next: (allow) => {
        this.allows.update((a) => [allow, ...a.filter((x) => x.id !== allow.id)]);
        this.newDomain.set('');
        this.submitting.set(false);
      },
      error: () => this.submitting.set(false),
    });
  }

  remove(allow: DomainAllow): void {
    this.api.deleteDomainAllow(allow.id).subscribe(() => {
      this.allows.update((a) => a.filter((x) => x.id !== allow.id));
    });
  }
}
