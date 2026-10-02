import { Component, ViewEncapsulation } from '@angular/core';

@Component({
  selector: 'div[mbDiscoveryCandidate]',
  template: '<ng-content />',
  encapsulation: ViewEncapsulation.None,
  styleUrl: './discovery-candidate.css',
})
export class MbDiscoveryCandidate {}
