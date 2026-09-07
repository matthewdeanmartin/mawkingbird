import { Component, inject, OnInit, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { FormsModule } from '@angular/forms';
import { AdminApi } from '../admin-api';
import { CanonicalEmailBlock } from '../../models';

// i18n adminCanonical.placeholder: email to block (canonicalized + hashed)
// i18n adminCanonical.block: Block
// i18n adminCanonical.testPlaceholder: test an email against existing blocks
// i18n adminCanonical.testMatch: Test match
// i18n adminCanonical.matches.one: Matches {{count}} block: canonicalizes to a blocked hash.
// i18n adminCanonical.matches.other: Matches {{count}} blocks: canonicalizes to a blocked hash.
// i18n adminCanonical.noMatch: No match — this email is not blocked.
// i18n adminCanonical.loading: Loading…
// i18n adminCanonical.empty: No canonical email blocks.
// i18n adminCanonical.remove: Remove

@Component({
  selector: 'app-admin-canonical-blocks',
  imports: [FormsModule, TranslocoPipe],
  templateUrl: './admin-canonical-blocks.html',
  styleUrl: './admin-lists.css',
})
export class AdminCanonicalBlocks implements OnInit {
  private api = inject(AdminApi);

  protected blocks = signal<CanonicalEmailBlock[]>([]);
  protected loading = signal(true);
  protected newEmail = signal('');
  protected submitting = signal(false);

  // Canonicalization test.
  protected testEmail = signal('');
  protected testResult = signal<CanonicalEmailBlock[] | null>(null);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.canonicalEmailBlocks().subscribe({
      next: (b) => {
        this.blocks.set(b);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  add(): void {
    const email = this.newEmail().trim();
    if (!email || this.submitting()) {
      return;
    }
    this.submitting.set(true);
    this.api.createCanonicalEmailBlock(email).subscribe({
      next: (block) => {
        this.blocks.update((b) => [block, ...b]);
        this.newEmail.set('');
        this.submitting.set(false);
      },
      error: () => this.submitting.set(false),
    });
  }

  test(): void {
    const email = this.testEmail().trim();
    if (!email) {
      return;
    }
    this.api.testCanonicalEmailBlock(email).subscribe((matches) => this.testResult.set(matches));
  }

  remove(block: CanonicalEmailBlock): void {
    this.api.deleteCanonicalEmailBlock(block.id).subscribe(() => {
      this.blocks.update((b) => b.filter((x) => x.id !== block.id));
    });
  }
}
