import { MbField, MbControl } from '../../design-system/field/field';
import { MbButton } from '../../design-system/button/button';
import { Component, inject, OnInit, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { FormsModule } from '@angular/forms';
import { AdminApi } from '../admin-api';
import { DomainBlock } from '../../models';

// i18n adminDomains.placeholder: domain to block (e.g. spam.example)
// i18n adminDomains.silence: silence
// i18n adminDomains.suspend: suspend
// i18n adminDomains.noop: noop
// i18n adminDomains.block: Block
// i18n adminDomains.loading: Loading…
// i18n adminDomains.empty: No domain blocks.
// i18n adminDomains.remove: Remove

@Component({
  selector: 'app-admin-domains',
  imports: [MbField, MbControl, MbButton, FormsModule, TranslocoPipe],
  templateUrl: './admin-domains.html',
  styleUrls: ['./admin-domains.css', '../admin-form.css'],
})
export class AdminDomains implements OnInit {
  private api = inject(AdminApi);

  protected blocks = signal<DomainBlock[]>([]);
  protected loading = signal(true);

  protected newDomain = signal('');
  protected severity = signal('silence');
  protected submitting = signal(false);
  protected saveFailed = signal(false);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.domainBlocks().subscribe({
      next: (b) => {
        this.blocks.set(b);
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
    this.saveFailed.set(false);
    this.submitting.set(true);
    this.api.createDomainBlock(domain, this.severity()).subscribe({
      next: (block) => {
        this.blocks.update((b) => [block, ...b.filter((x) => x.id !== block.id)]);
        this.newDomain.set('');
        this.submitting.set(false);
      },
      error: () => {
        this.submitting.set(false);
        this.saveFailed.set(true);
      },
    });
  }

  remove(block: DomainBlock): void {
    this.api.deleteDomainBlock(block.id).subscribe(() => {
      this.blocks.update((b) => b.filter((x) => x.id !== block.id));
    });
  }
}

// i18n adminForms.severity: Moderation action
// i18n adminForms.saveFailed: Could not save. Your entries are still here; try again.
// i18n adminForms.testFailed: Could not check this email. Try again.
