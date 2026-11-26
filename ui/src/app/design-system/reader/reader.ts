import { Component, input, ViewEncapsulation, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'div[mbReaderPreferences]',
  template: '<ng-content />',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './reader-preferences.css',
})
export class MbReaderPreferences {}

@Component({
  selector: 'aside[mbReaderLibrary]',
  template: '<ng-content />',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './reader-library.css',
})
export class MbReaderLibrary {}

@Component({
  selector: 'div[mbReaderSearch]',
  template: '<ng-content />',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './reader-search.css',
})
export class MbReaderSearch {}

@Component({
  selector: 'aside[mbReaderSurface], div[mbReaderSurface]',
  template: '<ng-content />',
  styleUrl: './reader-surface.css',
  changeDetection: ChangeDetectionStrategy.Eager,
  host: { '[attr.data-surface]': 'surface()' },
})
export class MbReaderSurface {
  readonly surface = input<'notes' | 'selection'>('notes');
}
