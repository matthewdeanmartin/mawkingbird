import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DropboxSession } from '../../../../providers/dropbox/dropbox-session';
import { PageDiagnostics } from '../../../../page-diagnostics';
import { ConnectionDropbox } from './connection-dropbox';

describe('ConnectionDropbox shared feedback', () => {
  const connect = vi.fn();
  beforeEach(() => {
    connect.mockReset();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: DropboxSession,
          useValue: { configured: true, connected: () => false, connect },
        },
        { provide: PageDiagnostics, useValue: { error: vi.fn() } },
      ],
    });
  });

  it('preserves callback notice and replace-url cleanup without restarting OAuth', () => {
    TestBed.overrideProvider(ActivatedRoute, {
      useValue: { snapshot: { queryParamMap: convertToParamMap({ dropbox: 'connected' }) } },
    });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(ConnectionDropbox);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('mb-notice [role="status"]').textContent).toContain(
      'Dropbox connected.',
    );
    expect(navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({ queryParams: {}, replaceUrl: true }),
    );
    expect(connect).not.toHaveBeenCalled();
  });

  it('announces authorization-start failures without hiding the retry action', async () => {
    connect.mockRejectedValue(new Error('Preview failure'));
    const fixture = TestBed.createComponent(ConnectionDropbox);
    fixture.detectChanges();
    fixture.nativeElement.querySelector('button[mbButton]').click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('mb-notice [role="alert"]').textContent).toBe(
      'Preview failure',
    );
    expect(fixture.nativeElement.querySelector('button[mbButton]').disabled).toBe(false);
    expect(connect).toHaveBeenCalledOnce();
  });
});
