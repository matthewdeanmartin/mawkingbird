import { Component, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { Api } from '../../platform/api/api';
import { PrivacyPolicy } from '../../platform/api/models';

// i18n serverAnnouncements.privacy.title: Privacy policy
// i18n serverAnnouncements.privacy.updated: Last updated {{date}}
// i18n serverAnnouncements.privacy.loading: Loading the privacy policy…
// i18n serverAnnouncements.privacy.none: This server has not published a privacy policy here.

/**
 * `/server-privacy`: the home server's privacy policy.
 *
 * Its own page, like `/server-rules`, so the My Server page can list every
 * server document the same way: one link each, instead of some links and some
 * expanders.
 */
@Component({
  selector: 'app-server-privacy',
  imports: [DatePipe, TranslocoPipe],
  templateUrl: './server-privacy.html',
  styleUrl: './server-privacy.css',
})
export class ServerPrivacy implements OnInit {
  private api = inject(Api);

  protected privacy = signal<PrivacyPolicy | null>(null);
  protected state = signal<'loading' | 'loaded' | 'none'>('loading');

  ngOnInit(): void {
    this.api.privacyPolicy().subscribe({
      next: (policy) => {
        const has = !!policy?.content?.trim();
        this.privacy.set(has ? policy : null);
        this.state.set(has ? 'loaded' : 'none');
      },
      error: () => this.state.set('none'),
    });
  }
}
