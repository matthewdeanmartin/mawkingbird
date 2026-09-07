import { Component, inject, OnInit, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { FormsModule } from '@angular/forms';
import { AdminApi } from '../admin-api';
import { EmailDomainBlock } from '../../models';

// i18n adminEmailBlocks.placeholder: email domain to block (e.g. mailinator.com)
// i18n adminEmailBlocks.block: Block
// i18n adminEmailBlocks.loading: Loading…
// i18n adminEmailBlocks.empty: No email domain blocks.
// i18n adminEmailBlocks.remove: Remove

@Component({
  selector: 'app-admin-email-blocks',
  imports: [FormsModule, TranslocoPipe],
  templateUrl: './admin-email-blocks.html',
  styleUrl: './admin-lists.css',
})
export class AdminEmailBlocks implements OnInit {
  private api = inject(AdminApi);

  protected blocks = signal<EmailDomainBlock[]>([]);
  protected loading = signal(true);
  protected newDomain = signal('');
  protected submitting = signal(false);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.emailDomainBlocks().subscribe({
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
    this.submitting.set(true);
    this.api.createEmailDomainBlock(domain).subscribe({
      next: (block) => {
        this.blocks.update((b) => [block, ...b]);
        this.newDomain.set('');
        this.submitting.set(false);
      },
      error: () => this.submitting.set(false),
    });
  }

  remove(block: EmailDomainBlock): void {
    this.api.deleteEmailDomainBlock(block.id).subscribe(() => {
      this.blocks.update((b) => b.filter((x) => x.id !== block.id));
    });
  }
}
