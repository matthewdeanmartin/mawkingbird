import { Component, input, ViewEncapsulation } from '@angular/core';

@Component({
  selector: 'div[mbReaderPreferences]',
  template: '<ng-content />',
  encapsulation: ViewEncapsulation.None,
  styleUrl: './reader-preferences.css',
})
export class MbReaderPreferences {}

@Component({
  selector: 'aside[mbReaderLibrary]',
  template: '<ng-content />',
  encapsulation: ViewEncapsulation.None,
  styleUrl: './reader-library.css',
})
export class MbReaderLibrary {}

@Component({
  selector: 'div[mbReaderSearch]',
  template: '<ng-content />',
  encapsulation: ViewEncapsulation.None,
  styleUrl: './reader-search.css',
})
export class MbReaderSearch {}

@Component({
  selector: 'aside[mbReaderSurface], div[mbReaderSurface]',
  template: '<ng-content />',
  styleUrl: './reader-surface.css',
  host: { '[attr.data-surface]': 'surface()' },
})
export class MbReaderSurface {
  readonly surface = input<'notes' | 'selection'>('notes');
}
