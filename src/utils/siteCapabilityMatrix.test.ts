import { describe, expect, it } from 'vitest';
import { MODEL_ORDER } from './modelConfig';
import { getSiteCapability, SITE_CAPABILITY_MATRIX } from './siteCapabilityMatrix';

describe('siteCapabilityMatrix', () => {
  it('covers every supported model with non-empty routing and selector metadata', () => {
    expect(Object.keys(SITE_CAPABILITY_MATRIX)).toEqual(MODEL_ORDER);

    for (const model of MODEL_ORDER) {
      const capability = getSiteCapability(model);
      expect(capability.model).toBe(model);
      expect(capability.routing.openUrl).toMatch(/^https:\/\//);
      expect(capability.routing.hostnames.length).toBeGreaterThan(0);
      expect(capability.promptSurfaceSelectors.length).toBeGreaterThan(0);
      expect(capability.responseSelectors.length).toBeGreaterThan(0);
      expect(capability.stopSelectors.length).toBeGreaterThan(0);
      expect(capability.privateApiBoundary.writeAllowed).toBe(false);
    }
  });
});
