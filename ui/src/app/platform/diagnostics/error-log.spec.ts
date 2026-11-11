import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { ErrorLog } from './error-log';

describe('ErrorLog', () => {
  let log: ErrorLog;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [ErrorLog] });
    log = TestBed.inject(ErrorLog);
  });

  it('starts empty', () => {
    expect(log.entries()).toEqual([]);
  });

  it('records an Error with name, message, and a trimmed stack', () => {
    log.record('angular', new Error('nope'));
    const [entry] = log.entries();
    expect(entry.source).toBe('angular');
    expect(entry.text).toContain('Error: nope');
    expect(typeof entry.at).toBe('number');
  });

  it('records strings and objects too', () => {
    log.record('window-error', 'plain string');
    log.record('unhandled-rejection', { code: 42 });
    const texts = log.entries().map((e) => e.text);
    expect(texts[0]).toBe('plain string');
    expect(texts[1]).toContain('42');
  });

  it('keeps only the most recent 25 entries', () => {
    for (let i = 0; i < 40; i++) {
      log.record('angular', new Error(`e${i}`));
    }
    const entries = log.entries();
    expect(entries).toHaveLength(25);
    expect(entries[0].text).toContain('e15');
    expect(entries[24].text).toContain('e39');
  });

  it('caps very long text', () => {
    log.record('angular', 'y'.repeat(5000));
    expect(log.entries()[0].text.length).toBeLessThanOrEqual(2000);
  });

  it('clear() empties the buffer', () => {
    log.record('angular', new Error('x'));
    log.clear();
    expect(log.entries()).toEqual([]);
  });
});
