import { Component, inject, OnInit, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { FormsModule } from '@angular/forms';
import { AdminApi } from '../admin-api';
import { IpBlock } from '../../models';

// i18n adminIpBlocks.ipPlaceholder: IP or CIDR (e.g. 203.0.113.0/24)
// i18n adminIpBlocks.commentPlaceholder: comment (optional)
// i18n adminIpBlocks.block: Block
// i18n adminIpBlocks.loading: Loading…
// i18n adminIpBlocks.empty: No IP blocks.
// i18n adminIpBlocks.remove: Remove

const SEVERITIES = ['no_access', 'sign_up_requires_approval', 'sign_up_block'] as const;

@Component({
  selector: 'app-admin-ip-blocks',
  imports: [FormsModule, TranslocoPipe],
  templateUrl: './admin-ip-blocks.html',
  styleUrl: './admin-lists.css',
})
export class AdminIpBlocks implements OnInit {
  private api = inject(AdminApi);

  protected readonly severities = SEVERITIES;
  protected blocks = signal<IpBlock[]>([]);
  protected loading = signal(true);
  protected newIp = signal('');
  protected severity = signal<string>('no_access');
  protected comment = signal('');
  protected submitting = signal(false);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.ipBlocks().subscribe({
      next: (b) => {
        this.blocks.set(b);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  add(): void {
    const ip = this.newIp().trim();
    if (!ip || this.submitting()) {
      return;
    }
    this.submitting.set(true);
    this.api.createIpBlock(ip, this.severity(), this.comment().trim()).subscribe({
      next: (block) => {
        this.blocks.update((b) => [block, ...b]);
        this.newIp.set('');
        this.comment.set('');
        this.submitting.set(false);
      },
      error: () => this.submitting.set(false),
    });
  }

  remove(block: IpBlock): void {
    this.api.deleteIpBlock(block.id).subscribe(() => {
      this.blocks.update((b) => b.filter((x) => x.id !== block.id));
    });
  }
}
