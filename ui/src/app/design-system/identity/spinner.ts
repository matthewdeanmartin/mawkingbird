import { Component, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'span[mbSpinner]',
  template: '<ng-content />',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './spinner.css',
})
export class MbSpinner {}
