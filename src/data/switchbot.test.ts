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
  it('usa power o weight si vienen en vatios', () => {
    expect(plugWatts({ power: 112.5 })).toBe(112.5);
    expect(plugWatts({ power: 'on', weight: 48 })).toBe(48);
  });
  it('si no, tensión × corriente (A o mA)', () => {
    expect(plugWatts({ power: 'on', voltage: 230, electricCurrent: 0.5 })).toBeCloseTo(115);
    expect(plugWatts({ voltage: 230, electricCurrent: 500 })).toBeCloseTo(115);
  });
  it('sin datos de consumo devuelve null', () => {
    expect(plugWatts({ power: 'on' })).toBeNull();
  });
});
