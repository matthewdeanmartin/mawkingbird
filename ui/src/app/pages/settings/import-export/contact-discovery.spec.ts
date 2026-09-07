import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { Account } from '../../../models';
import { ContactDiscovery, parseContacts, parseCsv, rankMatch } from './contact-discovery';

const HEADER = [
  'First Name',
  'Middle Name',
  'Last Name',
  'Organization Name',
  'Notes',
  'E-mail 1 - Value',
  'Website 1 - Value',
].join(',');

describe('contact discovery', () => {
  it('parses quoted commas and newlines without sending or retaining the raw CSV', () => {
    expect(parseCsv('Name,Notes\r\n"Doe, Jane","line one\nline two"\r\n')).toEqual([
      ['Name', 'Notes'],
      ['Doe, Jane', 'line one\nline two'],
    ]);
  });

  it('skips business and phone-only rows and creates two high-yield queries for a person', () => {
    const result = parseContacts(
      `${HEADER}\nJane,,Doe,,,jane.doe@example.com,https://janedoe.example\n,,,Repair Shop,,,\n`,
    );

    expect(result.total).toBe(2);
    expect(result.skipped).toBe(1);
    expect(result.contacts).toHaveLength(1);
    expect(result.contacts[0].queries).toEqual([
      { text: 'jane.doe', resolve: false, label: 'username jane.doe' },
      { text: 'Jane Doe', resolve: false, label: 'name Jane Doe' },
    ]);
  });

  it('treats an explicit profile URL as the strongest query', () => {
    const result = parseContacts(
      `${HEADER}\nJane,,Doe,,Find me at https://social.example/@janedoe,,\n`,
    );

    expect(result.contacts[0].handles).toEqual(['janedoe@social.example']);
    expect(result.contacts[0].queries).toEqual([
      {
        text: 'janedoe@social.example',
        resolve: true,
        label: 'exact handle @janedoe@social.example',
      },
    ]);
  });

  it('ranks by independent matching clues without claiming identity', () => {
    const contact = parseContacts(
      `${HEADER}\nJane,,Doe,Example Org,,jane.doe@example.com,https://janedoe.example\n`,
    ).contacts[0];
    const account = {
      id: '1',
      username: 'jane.doe',
      acct: 'jane.doe@example.com',
      display_name: 'Jane Doe',
      note: 'Engineer at Example Org',
      url: 'https://example.com/@jane.doe',
      fields: [{ name: 'Site', value: '<a href="https://janedoe.example">Website</a>' }],
    } as Account;

    const match = rankMatch(contact, account);
    expect(match.confidence).toBe('likely');
    expect(match.signals).toEqual([
      'Username matches email name',
      'Display name exactly matches',
      'Username matches contact name',
      'Account and email domains match',
      'Website appears on profile',
      'Organization appears in bio',
    ]);
  });
});

describe('ContactDiscovery API budget', () => {
  let discovery: ContactDiscovery;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    discovery = TestBed.inject(ContactDiscovery);
    discovery.delayMs = 0;
    http = TestBed.inject(HttpTestingController);
    discovery.load(`${HEADER}\nJane,,Doe,,,jane.doe@example.com,\n`);
  });

  it('stops at the call limit and resumes without repeating a query', async () => {
    const firstRun = discovery.start(1);
    const usernameRequest = http.expectOne('/api/v2/search?q=jane.doe&type=accounts&limit=10');
    usernameRequest.flush({ accounts: [], statuses: [], hashtags: [] });
    await firstRun;

    expect(discovery.callCount()).toBe(1);
    expect(discovery.rows()[0].completedQueries).toBe(1);
    expect(discovery.rows()[0].status).toBe('pending');

    const secondRun = discovery.start(2);
    const nameRequest = http.expectOne('/api/v2/search?q=Jane%20Doe&type=accounts&limit=10');
    nameRequest.flush({ accounts: [], statuses: [], hashtags: [] });
    await secondRun;

    expect(discovery.callCount()).toBe(2);
    expect(discovery.rows()[0].status).toBe('complete');
    http.verify();
  });
});
