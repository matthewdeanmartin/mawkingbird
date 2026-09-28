import { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { AdminIpBlocks } from './ip-blocks/admin-ip-blocks';
import { AdminDomains } from './domains/admin-domains';
import { AdminDomainAllows } from './domain-allows/admin-domain-allows';
import { AdminEmailBlocks } from './email-blocks/admin-email-blocks';
import { AdminCanonicalBlocks } from './canonical-blocks/admin-canonical-blocks';

const cases: {
  component: Type<unknown>;
  path: string;
  values: string[];
  payload: object;
  response: object;
}[] = [
  {
    component: AdminIpBlocks,
    path: 'ip_blocks',
    values: [' 203.0.113.0/24 ', ' no spam '],
    payload: { ip: '203.0.113.0/24', severity: 'no_access', comment: 'no spam' },
    response: { id: 'one', ip: '203.0.113.0/24', severity: 'no_access', comment: 'no spam' },
  },
  {
    component: AdminDomains,
    path: 'domain_blocks',
    values: [' spam.example '],
    payload: { domain: 'spam.example', severity: 'silence' },
    response: { id: 'one', domain: 'spam.example', severity: 'silence' },
  },
  {
    component: AdminDomainAllows,
    path: 'domain_allows',
    values: [' friend.example '],
    payload: { domain: 'friend.example' },
    response: { id: 'one', domain: 'friend.example' },
  },
  {
    component: AdminEmailBlocks,
    path: 'email_domain_blocks',
    values: [' spam.example '],
    payload: { domain: 'spam.example' },
    response: { id: 'one', domain: 'spam.example' },
  },
  {
    component: AdminCanonicalBlocks,
    path: 'canonical_email_blocks',
    values: [' reader@example.test '],
    payload: { email: 'reader@example.test' },
    response: { id: 'one', canonical_email_hash: 'preview-hash' },
  },
];
describe('Admin form adoption', () => {
  for (const entry of cases)
    it(`${entry.path}: native fields preserve payloads, block duplicates and retain input on failure`, async () => {
      TestBed.configureTestingModule({
        providers: [provideHttpClient(), provideHttpClientTesting()],
      });
      const http = TestBed.inject(HttpTestingController);
      const fixture = TestBed.createComponent(entry.component);
      fixture.detectChanges();
      const endpoint = '/api/v1/admin/' + entry.path;
      http.expectOne(endpoint).flush([]);
      await fixture.whenStable();
      const root = fixture.nativeElement as HTMLElement;
      const form = root.querySelector('.add-block')!;
      const button = form.querySelector<HTMLButtonElement>('button[mbButton]')!;
      expect(button.disabled).toBe(true);
      const inputs = [...form.querySelectorAll<HTMLInputElement>('input')];
      for (let i = 0; i < inputs.length; i++) {
        inputs[i].value = entry.values[i];
        inputs[i].dispatchEvent(new Event('input'));
      }
      await fixture.whenStable();
      for (const control of form.querySelectorAll<HTMLInputElement>('input,select')) {
        expect(form.querySelector(`label[for="${control.id}"]`)).not.toBeNull();
      }
      button.click();
      await fixture.whenStable();
      expect(button.disabled).toBe(true);
      const first = http.expectOne(endpoint);
      expect(first.request.body).toEqual(entry.payload);
      (fixture.componentInstance as { add(): void }).add();
      http.expectNone(endpoint);
      first.flush('invalid', { status: 422, statusText: 'Unprocessable' });
      await fixture.whenStable();
      expect(inputs[0].value).toBe(entry.values[0]);
      expect(inputs[0].getAttribute('aria-invalid')).toBe('true');
      expect(root.textContent).toContain('Your entries are still here');
      expect(button.disabled).toBe(false);
      button.click();
      http.expectOne(endpoint).flush(entry.response);
      await fixture.whenStable();
      expect(inputs[0].value).toBe('');
      expect(inputs[0].hasAttribute('aria-invalid')).toBe(false);
      http.verify();
    });
  it('canonical lookup catches failures, retains the email and prevents duplicate requests', async () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(AdminCanonicalBlocks);
    fixture.detectChanges();
    http.expectOne('/api/v1/admin/canonical_email_blocks').flush([]);
    await fixture.whenStable();
    const input = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLInputElement>(
      'input',
    )[1];
    input.value = 'reader@example.test';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    fixture.componentInstance.test();
    fixture.componentInstance.test();
    const req = http.expectOne('/api/v1/admin/canonical_email_blocks/test');
    expect(req.request.body).toEqual({ email: 'reader@example.test' });
    req.flush('offline', { status: 503, statusText: 'Unavailable' });
    await fixture.whenStable();
    expect(input.value).toBe('reader@example.test');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    fixture.componentInstance.test();
    http.expectOne('/api/v1/admin/canonical_email_blocks/test').flush([]);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No match');
    http.verify();
  });
});
