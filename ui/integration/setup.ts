import { TestBed } from '@angular/core/testing';
import { beforeEach } from 'vitest';
import { translocoTesting } from '../src/app/i18n/i18n.testing';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  // Only translation assets are supplied locally; HTTP goes to the real server.
  TestBed.configureTestingModule({ imports: [translocoTesting()] });
});
