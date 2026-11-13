import { describe, expect, it } from 'vitest';
import { decide, parseRelease } from './update';

const A = 'a'.repeat(40);
const B = 'b'.repeat(40);
const release = (sha: string) => ({
  name: 'Botón de actualizar',
  body: `Botón de actualizar\n\ncommit: ${sha}\n`,
  assets: [
    { name: 'PelletControl.apk', browser_download_url: 'https://github.com/alebarzal/pellet-control/releases/download/latest/PelletControl.apk', updated_at: '2026-11-13T18:00:00Z', size: 9_227_993 },
  ],
});

describe('actualización desde GitHub', () => {
  it('lee el commit y el APK de la release', () => {
    const b = parseRelease(release(A))!;
    expect(b.sha).toBe(A);
    expect(b.title).toBe('Botón de actualizar');
    expect(b.sizeMb).toBe(8.8);
  });

  it('no acepta releases sin commit, sin APK o con la descarga en otro sitio', () => {
    expect(parseRelease(null)).toBeNull();
    expect(parseRelease({ ...release(A), body: 'sin commit' })).toBeNull();
    expect(parseRelease({ ...release(A), assets: [] })).toBeNull();
    const other = release(A);
    other.assets[0].browser_download_url = 'https://example.com/PelletControl.apk';
    expect(parseRelease(other)).toBeNull();
  });

  it('decide qué hacer', () => {
    const a = parseRelease(release(A))!;
    const b = parseRelease(release(B))!;
    expect(decide(A, a, A).state).toBe('current');
    expect(decide(A, b, B).state).toBe('available');
    // Sin saber con qué commit se compiló lo instalado, se ofrece lo publicado.
    expect(decide('', a, A).state).toBe('available');
    // Push nuevo que GitHub aún está compilando.
    expect(decide(A, a, B)).toEqual({ state: 'building', build: a });
    expect(decide(A, null, B).state).toBe('building');
    // APK del último push instalado a mano: no se ofrece volver al anterior.
    expect(decide(B, a, B)).toEqual({ state: 'building', build: null });
    // Sin poder leer el último push, manda la release.
    expect(decide(A, a, null).state).toBe('current');
  });
});
