import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { ExtensionBridge } from '../../platform/extension/extension-bridge';
import { YoutubeExtensionAccess } from './youtube-extension-access';

describe('YoutubeExtensionAccess', () => {
  async function setUp(bridge: Partial<Record<keyof ExtensionBridge, unknown>>) {
    TestBed.configureTestingModule({ providers: [{ provide: ExtensionBridge, useValue: bridge }] });
    const fixture = TestBed.createComponent(YoutubeExtensionAccess);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }
  const text = (el: HTMLElement) => el.textContent ?? '';

  it('renders nothing without the extension', async () => {
    const fixture = await setUp({ present: () => false, hasAccess: vi.fn() });
    expect(text(fixture.nativeElement)).toBe('');
  });

  it('renders nothing once YouTube is allowed', async () => {
    const fixture = await setUp({ present: () => true, hasAccess: vi.fn(async () => true) });
    expect(text(fixture.nativeElement)).toBe('');
  });

  it('asks for YouTube, hides and tells the host once allowed', async () => {
    const requestAccess = vi.fn(async () => true);
    const fixture = await setUp({
      present: () => true,
      hasAccess: vi.fn(async () => false),
      requestAccess,
    });
    const allowed = vi.fn();
    fixture.componentInstance.allowed.subscribe(allowed);
    expect(text(fixture.nativeElement)).toContain('no Plus needed');
    (fixture.nativeElement as HTMLElement).querySelector('button')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(requestAccess).toHaveBeenCalledWith('https://www.youtube.com');
    expect(allowed).toHaveBeenCalledTimes(1);
    expect(text(fixture.nativeElement)).toBe('');
  });

  it('says so when the reader declines', async () => {
    const fixture = await setUp({
      present: () => true,
      hasAccess: vi.fn(async () => false),
      requestAccess: vi.fn(async () => false),
    });
    (fixture.nativeElement as HTMLElement).querySelector('button')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(text(fixture.nativeElement)).toContain('Not allowed');
  });
});
