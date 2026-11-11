import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DiagnosticLog, safeDiagnosticDetails } from './diagnostic-log';

const STORAGE_KEY = 'mockingbird_diagnostic_log';

describe('DiagnosticLog', () => {
  beforeEach(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    TestBed.configureTestingModule({});
  });

  it('mirrors the existing console format and retains a structured entry', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const log = TestBed.inject(DiagnosticLog);

    log.write('info', 'Mockingbird Lists', 'user:create-list', { titleLength: 4 });

    expect(info).toHaveBeenCalledWith('[Mockingbird Lists] user:create-list', {
      titleLength: 4,
    });
    expect(log.entries()[0]).toMatchObject({
      level: 'info',
      area: 'Mockingbird Lists',
      event: 'user:create-list',
      details: '{"titleLength":4}',
    });
  });

  it('redacts secret-shaped fields and URL credentials and queries', () => {
    const details = safeDiagnosticDetails({
      accessToken: 'secret',
      tokenPresent: true,
      nested: { password: 'secret' },
      url: 'https://alice:pw@example.com/api/items?token=secret#private',
    });

    expect(details).not.toContain('secret');
    expect(details).not.toContain('alice');
    expect(details).not.toContain('pw');
    expect(details).toContain('[redacted]');
    expect(details).toContain('"tokenPresent":true');
    expect(details).toContain('https://example.com/api/items');
  });

  it('persists warnings immediately and clear removes the session copy', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const log = TestBed.inject(DiagnosticLog);

    log.write('warn', 'Mockingbird RSS', 'proxy-refused', { status: 403 });
    expect(sessionStorage.getItem(STORAGE_KEY)).toContain('proxy-refused');

    log.clear();
    expect(log.entries()).toEqual([]);
    expect(sessionStorage.getItem(STORAGE_KEY)).toContain('"entries":[]');
  });

  it('keeps only the latest 1,000 entries', () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const log = TestBed.inject(DiagnosticLog);

    for (let i = 0; i < 1_010; i++) {
      log.write('info', 'Mockingbird Test', `event:${i}`);
    }

    expect(log.entries()).toHaveLength(1_000);
    expect(log.entries()[0].event).toBe('event:10');
    expect(log.entries()[999].event).toBe('event:1009');
    vi.useRealTimers();
  });
});
