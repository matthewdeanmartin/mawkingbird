import { Component, ViewEncapsulation } from '@angular/core';

@Component({
  selector: 'div[mbServerPickerSurface]',
  template: '<ng-content />',
  encapsulation: ViewEncapsulation.None,
  styleUrl: './server-picker.css',
})
export class MbServerPickerSurface {}
