/**
 * Prueba el script de Supabase en un Postgres real (PGlite) simulando la parte de Supabase Auth:
 * roles `anon`/`authenticated` y `auth.uid()` a partir del usuario de la sesión.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';

const A = '00000000-0000-0000-0000-00000000000a';
const B = '00000000-0000-0000-0000-00000000000b';
const C = '00000000-0000-0000-0000-00000000000c';
const D = '00000000-0000-0000-0000-00000000000d';

let db: PGlite;

async function as(user: string | null) {
  await db.query('reset role');
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user ?? '']);
  await db.query(user ? 'set role authenticated' : 'set role anon');
}

const join = async (code: string, device = '') =>
  (await db.query<{ id: string | null }>(`select (public.join_household($1, $2)).id`, [code, device])).rows[0].id;

const currentCode = async (household: string) => {
  await db.query('reset role');
  return (await db.query<{ invite_code: string }>(`select invite_code from public.households where id = $1`, [household])).rows[0].invite_code;
};

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create role anon nologin;
    create role authenticated nologin;
    grant usage on schema public, auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    insert into auth.users values ('${A}'), ('${B}'), ('${C}'), ('${D}');
  `);
  const sql = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
  await db.exec(sql);
  // El script es idempotente: se puede volver a ejecutar.
  await db.exec(sql);
}, 60_000);

describe('esquema de Supabase', () => {
  let household: string;
  let code: string;

  it('A crea un hogar con un código de 6 dígitos y escribe datos', async () => {
    await as(A);
    const h = await db.query<{ id: string; invite_code: string }>(`select * from public.create_household('Casa', 'Móvil A')`);
    household = h.rows[0].id;
    code = h.rows[0].invite_code;
    expect(code).toMatch(/^\d{6}$/);
    await db.query(`insert into public.items (household_id, collection, id, data) values ($1, 'record', 'r1', '{"kind":"purchase"}')`, [household]);
    const r = await db.query<{ updated_by: string }>(`select updated_by from public.items`);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].updated_by).toBe(A);
  });

  it('un extraño no ve ni puede escribir datos del hogar', async () => {
    await as(C);
    expect((await db.query(`select * from public.items`)).rows).toHaveLength(0);
    expect((await db.query(`select * from public.households`)).rows).toHaveLength(0);
    await expect(db.query(`insert into public.items (household_id, collection, id, data) values ($1, 'record', 'x', '{}')`, [household])).rejects.toThrow();
    await expect(db.query(`select * from public.rotate_invite($1)`, [household])).rejects.toThrow(/No perteneces/);
    await expect(db.query(`select public.new_invite_code()`)).rejects.toThrow();
  });

  it('sin sesión no se puede unirse ni leer', async () => {
    await as(null);
    await expect(db.query(`select * from public.join_household($1)`, [code])).rejects.toThrow();
    await expect(db.query(`select * from public.items`)).rejects.toThrow();
  });

  it('B se une con el código (con espacios) y el código cambia: es de un solo uso', async () => {
    await as(B);
    expect(await join('000000')).toBeNull();
    expect(await join(`${code.slice(0, 3)} ${code.slice(3)}`, 'Móvil B')).toBe(household);
    expect((await db.query(`select * from public.items`)).rows).toHaveLength(1);
    await db.query(`insert into public.items (household_id, collection, id, data) values ($1, 'record', 'r2', '{"kind":"refill"}')`, [household]);
    expect((await db.query(`select * from public.members`)).rows).toHaveLength(2);
    const next = await currentCode(household);
    expect(next).toMatch(/^\d{6}$/);
    expect(next).not.toBe(code);
    await as(C);
    expect(await join(code)).toBeNull();
  });

  it('A ve lo que escribe B y el cursor de sincronización avanza', async () => {
    await as(A);
    const r = await db.query<{ id: string; updated_at: Date }>(`select id, updated_at from public.items order by updated_at`);
    expect(r.rows.map((x) => x.id)).toEqual(['r1', 'r2']);
    const before = r.rows[0].updated_at.getTime();
    await db.query(`update public.items set data = '{"kind":"purchase","bags":9}' where id = 'r1'`);
    const after = (await db.query<{ updated_at: Date }>(`select updated_at from public.items where id = 'r1'`)).rows[0].updated_at.getTime();
    expect(after).toBeGreaterThan(before);
  });

  it('un código caducado no sirve', async () => {
    const valid = await currentCode(household);
    await db.query(`update public.households set invite_expires_at = now() - interval '1 minute' where id = $1`, [household]);
    await as(D);
    expect(await join(valid)).toBeNull();
    await as(A);
    const fresh = (await db.query<{ rotate_invite: string }>(`select public.rotate_invite($1)`, [household])).rows[0].rotate_invite;
    expect(fresh).toMatch(/^\d{6}$/);
  });

  it('limita los intentos: a partir del sexto en una hora, se bloquea', async () => {
    await as(C);
    // C ya gastó 1 intento antes; 4 más llegan al límite de 5
    for (let i = 0; i < 4; i++) expect(await join('111111')).toBeNull();
    const good = await currentCode(household);
    await as(C);
    await expect(join(good)).rejects.toThrow(/Demasiados intentos/);
  });

  it('los miembros no pueden insertarse a mano ni leer los intentos', async () => {
    await as(D);
    await expect(db.query(`insert into public.members (household_id, user_id) values ($1, $2)`, [household, D])).rejects.toThrow();
    await expect(db.query(`select * from public.join_attempts`)).rejects.toThrow();
  });
});
