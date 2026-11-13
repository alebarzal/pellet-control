import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { isThermoType, signHeaders } from './switchbot';

describe('firma SwitchBot', () => {
  it('coincide con el ejemplo oficial de Node (HMAC-SHA256 base64 de token + t + nonce)', async () => {
    const token = 'tok-ejemplo';
    const secret = 'secret-ejemplo';
    const t = 1700000000000;
    const nonce = 'requestID';
    const expected = createHmac('sha256', secret).update(token + t + nonce).digest('base64');
    const h = await signHeaders(token, secret, t, nonce);
    expect(h.sign).toBe(expected);
    expect(h.Authorization).toBe(token);
    expect(h.t).toBe(String(t));
    expect(h.nonce).toBe(nonce);
    const up = await signHeaders(token, secret, t, nonce, true);
    expect(up.sign).toBe(expected.toUpperCase());
  });
  it('reconoce los tipos con temperatura', () => {
    expect(isThermoType('Meter')).toBe(true);
    expect(isThermoType('MeterPlus')).toBe(true);
    expect(isThermoType('WoIOSensor')).toBe(true);
    expect(isThermoType('Hub 2')).toBe(true);
    expect(isThermoType('Bot')).toBe(false);
    expect(isThermoType('Curtain')).toBe(false);
  });
});

import { plugWatts } from './switchbot';

describe('potencia del enchufe', () => {
  it('Plug Mini (EU): usa power en vatios', () => {
    expect(plugWatts({ switchStatus: 1, power: 5.6, voltage: 232, electricCurrent: 24, usedElectricity: 0 })).toBe(5.6);
  });
  it('Plug Mini (US/JP): tensión × corriente en mA, sin usar weight (consumo del día)', () => {
    expect(plugWatts({ power: 'on', voltage: 230, electricCurrent: 500, weight: 4800 })).toBeCloseTo(115);
    expect(plugWatts({ voltage: 232, electricCurrent: 15 })).toBeCloseTo(3.48);
  });
  it('sin datos de consumo devuelve null', () => {
    expect(plugWatts({ power: 'on' })).toBeNull();
  });
});
