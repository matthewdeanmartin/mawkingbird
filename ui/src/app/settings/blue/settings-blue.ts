import { Component } from '@angular/core';
import { BlueControls } from './blue-controls';

/**
 * Mockingbird Blue: every premium-style client feature in one place — theming,
 * undo send, reader typography, feed reader. The same controls also appear in
 * their regular grouped settings (Appearance), so both routes work.
 */
@Component({
  selector: 'app-settings-blue',
  imports: [BlueControls],
  template: `
    <div class="spage-head">
      <h1>Mockingbird Blue</h1>
      <p>
        Every Blue feature in one place: theming, undo send, reader typography, feed reader. You'll
        also find these in their regular settings categories. No subscription required — you earned
        the check by being you.
      </p>
    </div>
    <div class="spage-body">
      <app-blue-controls />
    </div>
  `,
})
export class SettingsBlue {}
