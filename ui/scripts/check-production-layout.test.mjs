import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkProductionLayout } from './check-production-layout.mjs';

const valid = {
  html: '<!doctype html><html><head><base href="/"></head><body></body></html>',
  fallback: "var SITE_BASE = '/';",
  metadata: {
    client_id: 'https://mawkingbird.com/oauth-client-metadata.json',
    redirect_uris: ['https://mawkingbird.com/oauth/bluesky/callback'],
  },
  cname: 'mawkingbird.com\n',
};

test('accepts both prerendered HTML and client-build base serialization', () => {
  for (const tag of [
    '<base href="/">',
    '<base href="/"/>',
    "<base href='/'>",
    '<base href="/" />',
  ]) {
    checkProductionLayout({ ...valid, html: `<html><head>${tag}</head><body></body></html>` });
  }
});

test('rejects project-path, preview, missing and duplicated base tags', () => {
  for (const tags of [
    '<base href="/mawkingbird/">',
    '<base href="/canary/">',
    '<base href="/test/">',
    '',
    '<base href="/"><base href="/">',
  ]) {
    assert.throws(
      () => checkProductionLayout({ ...valid, html: `<html><head>${tags}</head></html>` }),
      /base/i,
    );
  }
});

test('rejects a wrong fallback, OAuth identity, redirect or custom domain', () => {
  for (const changes of [
    { fallback: "var SITE_BASE = '/canary/';" },
    {
      metadata: {
        ...valid.metadata,
        client_id: 'https://mawkingbird.com/canary/oauth-client-metadata.json',
      },
    },
    {
      metadata: {
        ...valid.metadata,
        redirect_uris: ['https://mawkingbird.com/test/oauth/bluesky/callback'],
      },
    },
    { cname: 'example.com' },
  ]) {
    assert.throws(() => checkProductionLayout({ ...valid, ...changes }));
  }
});
