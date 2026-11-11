import { describe, expect, it } from 'vitest';
import {
  anonymousAccountRouteRef,
  anonymousStatusRouteRef,
  parseAnonymousAccountRouteRef,
  parseAnonymousStatusRouteRef,
} from './anonymous-route-ref';

describe('anonymous public route references', () => {
  it('round-trips a public account without putting the server URL in the route path', () => {
    const encoded = anonymousAccountRouteRef({
      server: 'https://social.example/path',
      id: '42',
      originalUrl: 'https://social.example/@alice',
    });

    expect(encoded).not.toContain('/');
    expect(parseAnonymousAccountRouteRef(encoded)).toEqual({
      server: 'https://social.example',
      id: '42',
      originalUrl: 'https://social.example/@alice',
    });
    expect(parseAnonymousStatusRouteRef(encoded)).toBeNull();
  });

  it('round-trips status references and rejects malformed or unsafe values', () => {
    const encoded = anonymousStatusRouteRef({ server: 'https://other.example', id: '900' });
    expect(parseAnonymousStatusRouteRef(encoded)).toEqual({
      server: 'https://other.example',
      id: '900',
    });
    expect(parseAnonymousStatusRouteRef('anonymous-status.not-base64')).toBeNull();
    expect(() => anonymousStatusRouteRef({ server: 'javascript:alert(1)', id: '1' })).toThrow();
  });
});
