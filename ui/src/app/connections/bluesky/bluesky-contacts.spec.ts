import { describe, expect, it } from 'vitest';
import { contactNumbers, phonesFromText, phonesFromVcard, toE164 } from './bluesky-contacts';

describe('toE164', () => {
  it('keeps an international number’s own country', () => {
    expect(toE164('+44 7700 900123', 'US')).toBe('+447700900123');
    expect(toE164('0049 151 23456789', 'US')).toBe('+4915123456789');
  });

  it('gives a local number the reader’s country, dropping the trunk 0', () => {
    expect(toE164('(555) 010-4477', 'US')).toBe('+15550104477');
    expect(toE164('1-555-010-4477', 'US')).toBe('+15550104477');
    expect(toE164('07700 900123', 'GB')).toBe('+447700900123');
    expect(toE164('090-1234-5678', 'JP')).toBe('+819012345678');
  });

  it('keeps Italy’s leading 0, which is part of the number', () => {
    expect(toE164('06 1234 5678', 'IT')).toBe('+390612345678');
  });

  it('refuses what cannot be a phone number', () => {
    expect(toE164('12', 'US')).toBeNull();
    expect(toE164('hello', 'US')).toBeNull();
    expect(toE164('5550104477', 'ZZ')).toBeNull();
  });
});

describe('reading contacts', () => {
  it('reads TEL lines from a vCard, folded or not', () => {
    const vcard = [
      'BEGIN:VCARD',
      'FN:Ana',
      'TEL;TYPE=CELL:+1 555 010',
      ' 4477',
      'item1.TEL:tel:+44 7700 900123',
      'END:VCARD',
    ].join('\r\n');
    expect(phonesFromVcard(vcard)).toEqual(['+1 555 0104477', '+44 7700 900123']);
  });

  it('finds numbers in a CSV export or pasted text', () => {
    expect(phonesFromText('Ana,+1 (555) 010-4477,ana@x.test\nBo,07700 900123,')).toEqual([
      '+1 (555) 010-4477',
      '07700 900123',
    ]);
  });

  it('keeps numbers pasted one per line apart', () => {
    expect(phonesFromText('07700 900123\n07700 900456')).toEqual(['07700 900123', '07700 900456']);
  });

  it('normalizes, drops the reader’s own number and repeats', () => {
    expect(
      contactNumbers(
        ['+1 555 010 4477', '(555) 010-4477', '+15550109999', 'x'],
        'US',
        '+15550109999',
      ),
    ).toEqual(['+15550104477']);
  });
});
