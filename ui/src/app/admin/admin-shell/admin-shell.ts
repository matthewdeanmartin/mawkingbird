import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';

// i18n adminShell.accounts: Accounts
// i18n adminShell.reports: Reports
// i18n adminShell.domainBlocks: Domain blocks
// i18n adminShell.domainAllows: Domain allows
// i18n adminShell.emailBlocks: Email blocks
// i18n adminShell.canonicalEmails: Canonical emails
// i18n adminShell.ipBlocks: IP blocks
// i18n adminShell.announcements: Announcements
// i18n adminShell.trends: Trends
// i18n adminShell.metrics: Metrics

@Component({
  selector: 'app-admin-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TranslocoPipe],
  templateUrl: './admin-shell.html',
})
export class AdminShell {}
