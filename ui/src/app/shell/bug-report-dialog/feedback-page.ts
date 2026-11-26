import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { Router } from '@angular/router';
import { BugReportDialog } from './bug-report-dialog';

@Component({
  selector: 'app-feedback-page',
  imports: [BugReportDialog],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: '<app-bug-report-dialog (closed)="close()" />',
})
export class FeedbackPage {
  private readonly router = inject(Router);
  protected close(): void {
    void this.router.navigateByUrl('/');
  }
}
