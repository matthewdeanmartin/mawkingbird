import { Component } from '@angular/core';

/**
 * A wide page with a tool rail: the rail sits under the brand and the content
 * runs under the header's tabs to the far edge. Below 1000px, the shell's own
 * breakpoint, the rail stacks above and stops sticking.
 */
@Component({
  selector: 'mb-rail-page',
  template: '<ng-content select="[mbRailPanel]" /><ng-content />',
  styleUrl: './rail-page.css',
})
export class MbRailPage {}

/** The rail's panel. Owns its surface, padding and stickiness; the content is the caller's. */
@Component({
  selector: 'aside[mbRailPanel]',
  template: '<ng-content />',
  styleUrl: './rail-panel.css',
})
export class MbRailPanel {}

/** A panel of the content column, so nothing sits bare on the page background. */
@Component({
  selector: 'section[mbPagePanel]',
  template: '<ng-content />',
  styleUrl: './page-panel.css',
})
export class MbPagePanel {}
