import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PageDiagnostics } from './page-diagnostics';

describe('PageDiagnostics', () => {
  beforeEach(() => TestBed.configureTestingModule({}));

  it('writes structured page events to the production-visible console', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    TestBed.inject(PageDiagnostics).info('Algo', 'user:refresh', { cachedPosts: 12 });

    expect(info).toHaveBeenCalledWith('[Mockingbird Algo] user:refresh', { cachedPosts: 12 });
  });
});
