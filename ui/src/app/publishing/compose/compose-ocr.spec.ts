import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Signal, WritableSignal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PLATFORM_OCR } from '../../platform/http/platform-http';
import type { NativeOcrTransport } from '../../platform/http/connector-types';
import { Compose } from './compose';

interface OcrInternals {
  media: WritableSignal<
    { media: { id: string; type: string }; description: string; file?: File }[]
  >;
  ocrAvailable: Signal<boolean>;
  ocrDescribed: Signal<ReadonlySet<string>>;
  mediaNotice: Signal<string>;
  canReadText(item: unknown): boolean;
  readTextFromImage(index: number): Promise<void>;
}

const picture = () => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'p.png');

describe('Compose: read text from image (parity item 4)', () => {
  let httpMock: HttpTestingController;
  let ocr: { available: ReturnType<typeof vi.fn>; read: ReturnType<typeof vi.fn> };

  function setUp(available = true): ComponentFixture<Compose> {
    ocr = {
      available: vi.fn().mockResolvedValue(available),
      read: vi.fn().mockResolvedValue({ text: '  OPEN 9–5  ', language: 'en-US' }),
    };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withXhr()),
        provideHttpClientTesting(),
        { provide: PLATFORM_OCR, useValue: ocr as unknown as NativeOcrTransport },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(Compose);
    fixture.detectChanges();
    return fixture;
  }

  const internals = (f: ComponentFixture<Compose>) =>
    f.componentInstance as unknown as OcrInternals;

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
  });

  beforeEach(() => localStorage.clear());

  it('fills an empty alt field and marks it "read by your computer"', async () => {
    const f = setUp();
    await Promise.resolve();
    expect(internals(f).ocrAvailable()).toBe(true);
    internals(f).media.set([
      { media: { id: 'm1', type: 'image' }, description: '', file: picture() },
    ]);
    expect(internals(f).canReadText(internals(f).media()[0])).toBe(true);
    await internals(f).readTextFromImage(0);
    expect(ocr.read).toHaveBeenCalledWith(expect.any(String));
    expect(internals(f).media()[0].description).toBe('OPEN 9–5');
    expect(internals(f).ocrDescribed().has('m1')).toBe(true);
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).textContent).toContain('Read by your computer');
  });

  it('never overwrites text the writer typed, even while the read was running', async () => {
    const f = setUp();
    await Promise.resolve();
    internals(f).media.set([
      { media: { id: 'm1', type: 'image' }, description: '', file: picture() },
    ]);
    let finish!: (value: { text: string; language: string }) => void;
    ocr.read.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const running = internals(f).readTextFromImage(0);
    internals(f).media.update((list) => [{ ...list[0], description: 'my own words' }]);
    finish({ text: 'MACHINE TEXT', language: 'en' });
    await running;
    expect(internals(f).media()[0].description).toBe('my own words');
    expect(internals(f).ocrDescribed().has('m1')).toBe(false);
  });

  it('is not offered when the field has text, for video, or without a recognizer', async () => {
    const f = setUp(false);
    await Promise.resolve();
    expect(internals(f).ocrAvailable()).toBe(false);
    const item = { media: { id: 'm1', type: 'image' }, description: '', file: picture() };
    expect(internals(f).canReadText(item)).toBe(false);
    TestBed.resetTestingModule();
    const g = setUp(true);
    await Promise.resolve();
    expect(internals(g).canReadText({ ...item, description: 'typed' })).toBe(false);
    expect(internals(g).canReadText({ ...item, media: { id: 'v', type: 'video' } })).toBe(false);
    expect(internals(g).canReadText({ ...item, file: undefined })).toBe(false);
  });

  it('says so when the picture has no text', async () => {
    const f = setUp();
    await Promise.resolve();
    ocr.read.mockResolvedValue({ text: '   ', language: null });
    internals(f).media.set([
      { media: { id: 'm1', type: 'image' }, description: '', file: picture() },
    ]);
    await internals(f).readTextFromImage(0);
    expect(internals(f).media()[0].description).toBe('');
    expect(internals(f).mediaNotice()).toContain('No text found');
  });
});
