import { Component, ViewEncapsulation, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'div[mbDiscoveryCandidate]',
  template: '<ng-content />',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './discovery-candidate.css',
})
export class MbDiscoveryCandidate {}
