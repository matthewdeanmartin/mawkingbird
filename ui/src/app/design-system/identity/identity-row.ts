import { Component, ViewEncapsulation } from '@angular/core';

@Component({
  selector: 'div[mbIdentityRow]',
  template: '<ng-content />',
  encapsulation: ViewEncapsulation.None,
  styleUrl: './identity-row.css',
})
export class MbIdentityRow {}
