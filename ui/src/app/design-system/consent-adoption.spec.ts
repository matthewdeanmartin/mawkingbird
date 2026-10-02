import { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProxyConsentDialog } from '../providers/shortener/proxy-consent-dialog/proxy-consent-dialog';
import { TwitterConsentDialog } from '../providers/twitter/twitter-consent-dialog/twitter-consent-dialog';
import { SHORTENER_CATALOG } from '../providers/shortener/shortener-catalog';
import { CORS_PROXY_CATALOG } from '../providers/cors-proxy/cors-proxy-catalog';
import { TWITTER_SOURCE_CATALOG } from '../providers/twitter/twitter-source';

describe('Consent dialog adoption', () => {
  const descriptors = ['showModal', 'close'].map(
    (name) => [name, Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name)] as const,
  );
  beforeEach(() => {
    for (const [name] of descriptors)
      Object.defineProperty(HTMLDialogElement.prototype, name, {
        configurable: true,
        value(this: HTMLDialogElement) {
          this.open = name === 'showModal';
        },
      });
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    for (const [name, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
      else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
    }
  });
  for (const scenario of [
    { twitter: false, own: false, credential: true },
    { twitter: false, own: true, credential: true },
    { twitter: false, own: false, credential: false },
    { twitter: true, own: false, credential: true },
    { twitter: true, own: true, credential: true },
  ]) {
    it('preserves disclosure and explicit consent for ' + JSON.stringify(scenario), async () => {
      const component: Type<ProxyConsentDialog | TwitterConsentDialog> = scenario.twitter
        ? TwitterConsentDialog
        : ProxyConsentDialog;
      const fixture = TestBed.createComponent(component);
      fixture.componentRef.setInput(
        'proxy',
        CORS_PROXY_CATALOG.find((entry) => entry.id === (scenario.own ? 'custom' : 'allorigins')),
      );
      if (scenario.twitter) fixture.componentRef.setInput('source', TWITTER_SOURCE_CATALOG[0]);
      else {
        fixture.componentRef.setInput(
          'shortener',
          SHORTENER_CATALOG.find((entry) => entry.id === 'dub'),
        );
        fixture.componentRef.setInput('carriesCredential', scenario.credential);
      }
      const accepted = vi.fn(),
        cancelled = vi.fn();
      fixture.componentInstance.accepted.subscribe(accepted);
      fixture.componentInstance.cancelled.subscribe(cancelled);
      fixture.detectChanges();
      await fixture.whenStable();
      const element = fixture.nativeElement as HTMLElement;
      const dialog = element.querySelector('dialog')!;
      expect(dialog.getAttribute('role')).toBe('alertdialog');
      expect(dialog.getAttribute('aria-describedby')).toBeTruthy();
      expect(element.querySelectorAll('mb-notice')).toHaveLength(
        scenario.credential && !scenario.own ? 1 : 0,
      );
      const confirm = element.querySelector('footer button:last-child') as HTMLButtonElement;
      expect(confirm.getAttribute('data-tone')).toBe(
        scenario.credential && !scenario.own ? 'danger' : 'accent',
      );
      if (scenario.twitter && !scenario.own) {
        expect(dialog.textContent).toContain('Spend your credits');
        expect(dialog.textContent).toContain('reading history');
      }
      if (!scenario.credential) expect(dialog.textContent).toContain('destination URL');
      dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
      expect(cancelled).toHaveBeenCalledOnce();
      expect(accepted).not.toHaveBeenCalled();
      confirm.click();
      expect(accepted).toHaveBeenCalledOnce();
      for (const link of element.querySelectorAll('a')) {
        expect(link.hasAttribute('mbContentLink')).toBe(true);
        expect(link.getAttribute('rel')).toContain('noopener');
      }
    });
  }
});
