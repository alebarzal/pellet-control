import { describe, expect, it } from 'vitest';
import { sampleData as createSeedData } from '../test/fixtures';
import { widgetPayload } from './widget';

describe('widget', () => {
  it('con los datos iniciales muestra sacos guardados y la tolva, sin autonomía inventada', () => {
    const p = widgetPayload(createSeedData(), 1_000);
    expect(p.bags).toBe('6');
    expect(p.bagsSub).toBe('sacos guardados');
    expect(p.hopperPct).toBeGreaterThan(0);
    expect(p.hopperSub.startsWith('tolva')).toBe(true);
    expect(p.runOutAt).toBe(0);
  });
});
