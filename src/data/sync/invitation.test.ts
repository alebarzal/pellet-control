import { describe, expect, it } from 'vitest';
import { decodeInvitation, encodeInvitation } from './supabase';

describe('invitaciones', () => {
  it('ida y vuelta, también con acentos y dentro de un mensaje', () => {
    const inv = { url: 'https://abcd.supabase.co', key: 'sb_publishable_xyz', code: 'ABCDEFGH23', name: 'Casa de Ñoño' };
    const text = encodeInvitation(inv);
    expect(text.startsWith('PC1:')).toBe(true);
    expect(decodeInvitation(`Únete a «Casa» en Pellet Control:\n\n${text}\n`)).toEqual(inv);
  });
  it('rechaza textos que no son invitaciones', () => {
    expect(decodeInvitation('hola')).toBeNull();
    expect(decodeInvitation('PC1:@@@')).toBeNull();
    expect(decodeInvitation('PC1:' + btoa('{"x":1}'))).toBeNull();
  });
});

import { isShortCode, parseShortCode, prettyCode } from './project';

describe('códigos de 6 dígitos', () => {
  it('acepta el código con espacios, guiones o texto alrededor', () => {
    expect(parseShortCode('482 615')).toBe('482615');
    expect(parseShortCode('482-615')).toBe('482615');
    expect(parseShortCode('Código: 482615')).toBe('482615');
    expect(parseShortCode(' 482615 ')).toBe('482615');
  });
  it('rechaza si no son exactamente 6 dígitos', () => {
    expect(parseShortCode('71192')).toBeNull();
    expect(parseShortCode('4826153')).toBeNull();
    expect(parseShortCode('')).toBeNull();
  });
  it('formato y detección', () => {
    expect(prettyCode('482615')).toBe('482 615');
    expect(isShortCode('482615')).toBe(true);
    expect(isShortCode('ABCDEFGH23')).toBe(false);
  });
});
