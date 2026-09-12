import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { PrivateLikeButton } from './private-like-button';
import { PrivateLikes } from './private-likes';
import { Status } from './models';

describe('PrivateLikeButton', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('mastodon_mock_token', 'alice');
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
  });
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    vi.restoreAllMocks();
  });

  function render() {
    const fixture = TestBed.createComponent(PrivateLikeButton);
    fixture.componentRef.setInput('status', {
      id: '1',
      url: 'https://social.example/@pizza/1',
      content: '<p>Pizza</p>',
      account: { acct: 'pizza' },
    } as Status);
    fixture.detectChanges();
    return fixture;
  }

  it('toggles a local private like without making a request or requiring PA mode', () => {
    const fixture = render();
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(button.textContent).toContain('Private like');
    button.click();
    fixture.detectChanges();
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.textContent).toContain('Remove private like');
    expect(TestBed.inject(PrivateLikes).current()!.likes()).toHaveLength(1);
    button.click();
    fixture.detectChanges();
    expect(button.getAttribute('aria-pressed')).toBe('false');
    TestBed.inject(HttpTestingController).expectNone(() => true);
  });

  it('reports a storage failure without presenting the like as saved', () => {
    const fixture = render();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Full');
    });
    (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
      'Could not save',
    );
    expect(fixture.nativeElement.querySelector('button').getAttribute('aria-pressed')).toBe(
      'false',
    );
  });

  it('leaves the no-login anonymous experience unchanged', () => {
    localStorage.setItem('mastodon_mock_account_mode', 'anonymous');
    expect(render().nativeElement.querySelector('button')).toBeNull();
  });
});
