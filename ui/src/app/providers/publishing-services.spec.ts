import { describe, expect, it } from 'vitest';
import { PASTE_SERVICES, PUBLISHING_ENDPOINTS } from './publishing-services';
import { SHORTENER_CATALOG } from './shortener/shortener-catalog';
import { probeTargets } from '../pages/settings/connections/doctor/connection-doctor-catalog';

describe('Publishing service coverage', () => {
  it('covers every shortener and directly hosted paste in Network Doctor', () => {
    const targets = probeTargets((key) => key);
    for (const entry of SHORTENER_CATALOG) {
      expect(
        PUBLISHING_ENDPOINTS.some((endpoint) => endpoint.service === entry.id),
        entry.id,
      ).toBe(true);
    }
    for (const entry of PASTE_SERVICES) {
      for (const id of entry.endpointIds)
        expect(
          targets.some((target) => target.id === id),
          id,
        ).toBe(true);
    }
    expect(new Set(targets.map((target) => target.id)).size).toBe(targets.length);
  });

  it('never probes a publishing endpoint or a retired service', () => {
    for (const target of probeTargets((key) => key)) {
      expect(target.probeUrl).not.toMatch(/api-create|create\.php|api\/new|pastepile/i);
    }
  });
});
