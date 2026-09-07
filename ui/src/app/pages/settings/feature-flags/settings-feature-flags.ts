import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import {
  FeatureFlagDefinition,
  FeatureFlagState,
  FeatureFlags,
  flagsInGroup,
} from '../../../feature-flags';

/** Translation keys for each rollout state, shared by the select and the hint. */
const STATE_KEYS: Record<FeatureFlagState, string> = {
  production: 'settings.flags.state.production',
  canary: 'settings.flags.state.canary',
  test: 'settings.flags.state.test',
  off: 'settings.flags.state.off',
};

/** Browser-local rollout controls for features that are still being staged. */
/** English source strings; see scripts/extract-i18n.mjs. */
// i18n settings.flags.title: Feature flags
// i18n settings.flags.intro: Choose which release channel can use features that are being rolled out.
// i18n settings.flags.features: Features
// i18n settings.flags.connectors: Connectors
// i18n settings.flags.connectors.link: Connections
// i18n settings.flags.connectors.hint.before: One switch per service, because that is how they break — when a third-party API goes down or starts refusing browsers, turning that one off stops people setting it up and hitting the failure. A turned-off connector still appears under
// i18n settings.flags.connectors.hint.after: , greyed out. Anything you have already connected keeps its credential; it just stops being offered.
// i18n settings.flags.proxies: CORS proxies
// i18n settings.flags.proxies.link: Connections → CORS proxy
// i18n settings.flags.proxies.hint.before: Which public CORS proxies are offered under
// i18n settings.flags.proxies.hint.after: . All four are off by default: each one failed often enough in testing — stripped API keys, aggressive rate limits, domain registration required, or simply very slow — that recommending them made setup look broken. What remains is the Mawkingbird proxy and any proxy you run yourself. Turning one on here adds it back to the picker, with its measured limitations written on the card. Turning one off also stops it being used if it was already selected.
// i18n settings.flags.state.production: Production
// i18n settings.flags.state.canary: Canary and test
// i18n settings.flags.state.test: Test only
// i18n settings.flags.state.off: Off everywhere
// i18n settings.flags.rollout: {{flag}} rollout
// i18n settings.flags.enabled: enabled
// i18n settings.flags.disabled: disabled
// i18n settings.flags.defaultHint: Default for this release: {{default}}. It is currently {{enabled}} on this {{channel}} build.
// i18n settings.flags.overrides: Overrides are local to this browser and this published version. When the published hash changes, all flags return to the new version's defaults.
@Component({
  selector: 'app-settings-feature-flags',
  imports: [FormsModule, RouterLink, TranslocoPipe],
  templateUrl: './settings-feature-flags.html',
})
export class SettingsFeatureFlags {
  protected readonly flags = inject(FeatureFlags);

  protected readonly featureFlags = flagsInGroup('features');
  protected readonly connectorFlags = flagsInGroup('connectors');
  protected readonly proxyFlags = flagsInGroup('proxies');

  protected state(flag: FeatureFlagDefinition): FeatureFlagState {
    return this.flags.state(flag.id);
  }

  protected setState(flag: FeatureFlagDefinition, state: FeatureFlagState): void {
    this.flags.setState(flag.id, state);
  }

  private transloco = inject(TranslocoService);

  /** "Default for this release: X. It is currently on/off on this build." */
  protected readonly defaultHintKey = 'settings.flags.defaultHint';

  /**
   * Parameters for {@link defaultHintKey}, as **translated fragments** rather
   * than a built sentence.
   *
   * This used to interpolate three English words into a template literal. That
   * works in English and nowhere else: the state name and "enabled"/"disabled"
   * both inflect in most languages, and the word order of the whole sentence
   * differs. Handing the locale one key plus three already-translated values
   * lets it place them however its grammar requires.
   */
  protected defaultHintParams(flag: FeatureFlagDefinition): Record<string, string> {
    return {
      default: this.transloco.translate<string>(STATE_KEYS[flag.defaultState]),
      enabled: this.transloco.translate<string>(
        this.flags.enabled(flag.id) ? 'settings.flags.enabled' : 'settings.flags.disabled',
      ),
      channel: this.flags.channel,
    };
  }
}
