import { Component, inject, OnInit, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslocoPipe } from '@jsverse/transloco';
import { Api } from '../../platform/api/api';
import { ModeratedServer } from '../../platform/api/models';

// i18n serverAnnouncements.moderated.title: Moderated servers
// i18n serverAnnouncements.moderated.intro: Servers this one limits or suspends, as its moderators chose to publish them.
// i18n serverAnnouncements.moderated.loading: Loading moderated servers…
// i18n serverAnnouncements.moderated.none: This server lists no moderated servers.
// i18n serverAnnouncements.moderated.private: This server keeps its list of moderated servers private.
// i18n serverAnnouncements.moderated.unavailable: This server does not share a list of moderated servers.
// i18n serverAnnouncements.moderated.silence: Limited
// i18n serverAnnouncements.moderated.suspend: Suspended
// i18n serverAnnouncements.moderated.noReason: No reason given

/**
 * `/server-moderated`: the servers the home server limits or suspends, as far
 * as its admins publish them. A sibling of `/server-rules` and
 * `/server-privacy`, linked from the My Server page.
 */
@Component({
  selector: 'app-server-moderated',
  imports: [TranslocoPipe],
  templateUrl: './server-moderated.html',
  styleUrl: './server-moderated.css',
})
export class ServerModerated implements OnInit {
  private api = inject(Api);

  protected moderated = signal<ModeratedServer[]>([]);
  protected state = signal<'loading' | 'loaded' | 'private' | 'unavailable'>('loading');

  /** A 401/403 is the admin's choice to keep the list private, not a failure. */
  ngOnInit(): void {
    this.api.moderatedServers().subscribe({
      next: (list) => {
        this.moderated.set(list ?? []);
        this.state.set('loaded');
      },
      error: (error: unknown) => {
        const status = error instanceof HttpErrorResponse ? error.status : 0;
        this.state.set(status === 401 || status === 403 ? 'private' : 'unavailable');
      },
    });
  }
}
