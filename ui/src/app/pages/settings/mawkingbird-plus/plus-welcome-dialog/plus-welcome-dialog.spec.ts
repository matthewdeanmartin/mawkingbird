import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { PLUS_FEATURE_LABELS, PlusWelcomeDialog } from './plus-welcome-dialog';
import { PlusFeatures, PLUS_FEATURES_KEY } from '../../../../providers/account/plus-features';
import { CorsProxySettings } from '../../../../providers/cors-proxy/cors-proxy-settings';
import { SupporterStatus } from '../../../../providers/account/supporter-status';
import { FeatureFlags } from '../../../../feature-flags';
import { VAULT_TEST_ROLLOUT } from '../../../../providers/vault/vault-preference';

/**
 * The click-wrap dialog.
 *
 * Two things carry the weight: it must not offer a way out other than Save, and
 * Save must always close it. A non-dismissible dialog that a failure can weld
 * shut would lock someone out of the app over a preference.
 */
describe('PlusWelcomeDialog', () => {
  let fixture: ReturnType<typeof TestBed.createComponent<PlusWelcomeDialog>>;
  let features: PlusFeatures;

  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    features = TestBed.inject(PlusFeatures);
    features.refresh();
    TestBed.inject(FeatureFlags).setState('proxy-mawkingbird-plus', 'production');
    fixture = TestBed.createComponent(PlusWelcomeDialog);
    fixture.detectChanges();
  });

  function html(): string {
    return (fixture.nativeElement as HTMLElement).innerHTML;
  }

  it('offers no way out but Save', () => {
    const element = fixture.nativeElement as HTMLElement;
    const buttons = [...element.querySelectorAll('button')];

    // One button, and it is Save. No close X, no cancel, no skip.
    expect(buttons).toHaveLength(1);
    expect(buttons[0].textContent?.trim()).toBe('Save');
    // The backdrop is a plain div, not a button: clicking away is the
    // affordance being withheld.
    expect(element.querySelector('.pw-backdrop')?.tagName).toBe('DIV');
  });

  it('starts with everything on', () => {
    // Somebody who paid for Plus and finds none of it running got a worse
    // experience than a free user, for money.
    const boxes = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLInputElement>(
        '.pw-row:not(.pw-row-planned) input',
      ),
    ];

    expect(boxes.length).toBeGreaterThan(0);
    expect(boxes.every((box) => box.checked)).toBe(true);
  });

  it('shows the unavailable features disabled rather than hiding them', () => {
    // A greyed-out "API key sync" answers "are my keys synced?" with a visible
    // no, which a missing row does not.
    const planned = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLInputElement>(
        '.pw-row-planned input',
      ),
    ];

    expect(planned).toHaveLength(2);
    expect(planned.every((box) => box.disabled)).toBe(true);
    expect(html()).toContain('API key sync');
  });

  it('offers encrypted connection keys as an active choice on the test deployment', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: VAULT_TEST_ROLLOUT, useValue: true }],
    });
    const testFixture = TestBed.createComponent(PlusWelcomeDialog);
    testFixture.detectChanges();
    const rows = [...(testFixture.nativeElement as HTMLElement).querySelectorAll('.pw-row')];
    // Found by the label the dialog actually renders, not a copy of it typed
    // here. This test used to hard-code the wording and broke the first time the
    // row was reworded — which told us nothing about the behaviour it guards.
    const apiKeys = rows.find((row) => row.textContent?.includes(PLUS_FEATURE_LABELS.apiKeys));

    expect(apiKeys).toBeDefined();
    expect(apiKeys?.classList.contains('pw-row-planned')).toBe(false);
    expect(apiKeys?.querySelector('input')?.disabled).toBe(false);
  });

  it('records the answer and asks to come down', () => {
    let closed = 0;
    fixture.componentInstance.saved.subscribe(() => closed++);

    saveButton().click();

    expect(features.decided()).toBe(true);
    expect(closed).toBe(1);
  });

  it('writes nothing until Save is pressed', () => {
    toggleFirstOff();

    // A tab closed mid-thought leaves no half-answered record behind.
    expect(localStorage.getItem(PLUS_FEATURES_KEY)).toBeNull();
    expect(features.decided()).toBe(false);
  });

  it('saves a toggle the user turned off', () => {
    toggleFirstOff();

    saveButton().click();

    expect(features.isOn('corsProxy')).toBe(false);
    expect(features.decided()).toBe(true);
  });

  it('switches on the proxy a subscriber is entitled to', () => {
    const proxy = TestBed.inject(CorsProxySettings);
    TestBed.inject(SupporterStatus).isSupporter.set(true);
    expect(proxy.missingEntitledProxy()).toBe(true);

    saveButton().click();

    expect(proxy.currentId()).toBe('mawkingbird');
  });

  it('leaves the proxy alone when that toggle is off', () => {
    const proxy = TestBed.inject(CorsProxySettings);
    TestBed.inject(SupporterStatus).isSupporter.set(true);
    toggleFirstOff();

    saveButton().click();

    expect(proxy.currentId()).toBeNull();
  });

  it('leaves a working deliberate proxy choice alone', () => {
    const proxy = TestBed.inject(CorsProxySettings);
    TestBed.inject(FeatureFlags).setState('proxy-allorigins', 'production');
    proxy.select('allorigins');
    TestBed.inject(SupporterStatus).isSupporter.set(true);

    saveButton().click();

    // Funding the project and not wanting to route traffic through it are
    // compatible positions.
    expect(proxy.currentId()).toBe('allorigins');
  });

  function saveButton(): HTMLButtonElement {
    const button = (fixture.nativeElement as HTMLElement).querySelector('button');
    if (!button) {
      throw new Error('no Save button');
    }
    return button;
  }

  function toggleFirstOff(): void {
    const box = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
      '.pw-row:not(.pw-row-planned) input',
    );
    if (!box) {
      throw new Error('no toggle');
    }
    box.checked = false;
    box.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  }
});
