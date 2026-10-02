import { Component, ViewEncapsulation } from '@angular/core';

@Component({
  selector: 'label[mbSwitch]',
  template: '<ng-content />',
  encapsulation: ViewEncapsulation.None,
  styleUrl: './switch.css',
})
export class MbSwitch {}
