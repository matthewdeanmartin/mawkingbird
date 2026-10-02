import { Component, ViewEncapsulation } from '@angular/core';

@Component({
  selector: 'section[mbProfileStack]',
  template: '<ng-content />',
  encapsulation: ViewEncapsulation.None,
  styleUrl: './profile-stack.css',
})
export class MbProfileStack {}
