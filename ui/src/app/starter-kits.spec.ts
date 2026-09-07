import { describe, expect, it } from 'vitest';
import { SHIPPED_STARTER_KITS } from './starter-kits';

describe('SHIPPED_STARTER_KITS', () => {
  it('ships every curated collection with all members hover-ready', () => {
    expect(SHIPPED_STARTER_KITS).toHaveLength(11);
    expect(new Set(SHIPPED_STARTER_KITS.map((kit) => kit.id)).size).toBe(11);

    for (const kit of SHIPPED_STARTER_KITS) {
      expect(kit.itemCount).toBeGreaterThanOrEqual(5);
      expect(kit.accounts).toHaveLength(kit.itemCount);
      expect(kit.url).toMatch(/^https:\/\/.+\/collections\/\d+$/);
      for (const account of kit.accounts) {
        expect(account.acct).toContain('@');
        expect(account.url).toMatch(/^https:\/\//);
        expect(account.avatar_static).toMatch(/^https:\/\//);
      }
    }
  });
});
