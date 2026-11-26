import { Component, ChangeDetectionStrategy } from '@angular/core';
/** Layout only: callers retain native links, time semantics and account behavior. */
@Component({
  selector: 'mb-metadata',
  template: '<ng-content />',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './metadata.css',
})
export class MbMetadata {}

/** Native link semantics, with readable content-surface contrast. */
@Component({
  selector: 'a[mbContentLink]',
  template: '<ng-content />',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './content-link.css',
})
export class MbContentLink {}
