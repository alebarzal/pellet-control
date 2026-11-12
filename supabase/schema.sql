-- ════════════════════════════════════════════════════════════════════
-- Pellet Control · base de datos compartida del hogar (Supabase)
-- Pega este script completo en Supabase → SQL Editor → New query → Run.
-- Se puede ejecutar más de una vez sin romper nada.
-- ════════════════════════════════════════════════════════════════════

-- Hogares: un grupo de móviles que comparten los mismos datos.
create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Mi casa',
  invite_code text not null unique,
  created_at timestamptz not null default now()
);

-- Miembros: qué usuarios (móviles) pertenecen a cada hogar.
create table if not exists public.members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  device_name text not null default '',
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

-- Datos: cada registro de la app es una fila JSON (compras, movimientos, productos, ajustes, lecturas…).
create table if not exists public.items (
  household_id uuid not null references public.households(id) on delete cascade,
  collection text not null check (collection in ('record', 'product', 'settings', 'reading')),
  id text not null,
  data jsonb,
  deleted boolean not null default false,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid default auth.uid(),
  primary key (household_id, collection, id)
);
create index if not exists items_sync_idx on public.items (household_id, updated_at);

-- La hora la pone siempre el servidor: es el «cursor» de sincronización de cada móvil.
create or replace function public.items_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := clock_timestamp();
  new.updated_by := auth.uid();
  return new;
end $$;
drop trigger if exists items_touch on public.items;
create trigger items_touch before insert or update on public.items
  for each row execute function public.items_touch();

-- ¿El usuario actual pertenece al hogar? (security definer evita recursión en las reglas)
create or replace function public.is_member(h uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members m where m.household_id = h and m.user_id = auth.uid());
$$;

-- ── Reglas de seguridad (RLS): cada móvil solo ve los datos de sus hogares ──
alter table public.households enable row level security;
alter table public.members enable row level security;
alter table public.items enable row level security;

drop policy if exists households_read on public.households;
create policy households_read on public.households for select to authenticated using (public.is_member(id));

drop policy if exists households_update on public.households;
create policy households_update on public.households for update to authenticated using (public.is_member(id)) with check (public.is_member(id));

drop policy if exists members_read on public.members;
create policy members_read on public.members for select to authenticated using (public.is_member(household_id));

drop policy if exists members_leave on public.members;
create policy members_leave on public.members for delete to authenticated using (user_id = auth.uid());

drop policy if exists items_all on public.items;
create policy items_all on public.items for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));

-- ── Invitaciones: código de 6 dígitos, de un solo uso y que caduca a las 24 h ──
alter table public.households add column if not exists invite_expires_at timestamptz not null default (now() + interval '24 hours');

-- Intentos de unirse (para limitar a quien pruebe códigos al azar). Solo lo tocan las funciones.
create table if not exists public.join_attempts (
  user_id uuid not null,
  at timestamptz not null default now()
);
create index if not exists join_attempts_idx on public.join_attempts (user_id, at);
alter table public.join_attempts enable row level security;

create or replace function public.new_invite_code() returns text
language plpgsql volatile set search_path = public as $$
declare
  code text;
begin
  loop
    code := lpad((floor(random() * 1000000))::int::text, 6, '0');
    exit when not exists (select 1 from public.households where invite_code = code);
  end loop;
  return code;
end $$;

create or replace function public.create_household(p_name text, p_device text default '')
returns public.households
language plpgsql security definer set search_path = public as $$
declare
  h public.households;
begin
  if auth.uid() is null then raise exception 'Sin sesión'; end if;
  insert into public.households (name, invite_code, invite_expires_at)
    values (coalesce(nullif(trim(p_name), ''), 'Mi casa'), public.new_invite_code(), now() + interval '24 hours')
    returning * into h;
  insert into public.members (household_id, user_id, device_name) values (h.id, auth.uid(), coalesce(p_device, ''));
  return h;
end $$;

-- Devuelve el hogar, o NULL si el código no vale (sin lanzar error, para que el intento quede contado).
create or replace function public.join_household(p_code text, p_device text default '')
returns public.households
language plpgsql security definer set search_path = public as $$
declare
  h public.households;
  code text := regexp_replace(upper(coalesce(p_code, '')), '[^A-Z0-9]', '', 'g');
begin
  if auth.uid() is null then raise exception 'Sin sesión'; end if;
  if (select count(*) from public.join_attempts where user_id = auth.uid() and at > now() - interval '1 hour') >= 5 then
    raise exception 'Demasiados intentos. Espera una hora y vuelve a probar.';
  end if;
  insert into public.join_attempts (user_id) values (auth.uid());
  select * into h from public.households where invite_code = code and invite_expires_at > now();
  if h.id is null then return null; end if;
  insert into public.members (household_id, user_id, device_name) values (h.id, auth.uid(), coalesce(p_device, ''))
    on conflict (household_id, user_id) do update set device_name = excluded.device_name;
  -- Un solo uso: tras unirse alguien, el código cambia.
  update public.households set invite_code = public.new_invite_code(), invite_expires_at = now() + interval '24 hours' where id = h.id;
  return h;
end $$;

-- Código nuevo (el anterior deja de valer) y 24 h más de validez.
create or replace function public.rotate_invite(p_household uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  code text;
begin
  if not public.is_member(p_household) then raise exception 'No perteneces a este hogar'; end if;
  code := public.new_invite_code();
  update public.households set invite_code = code, invite_expires_at = now() + interval '24 hours' where id = p_household;
  return code;
end $$;

revoke all on function public.new_invite_code() from public, anon, authenticated;

revoke all on function public.create_household(text, text) from public, anon;
revoke all on function public.join_household(text, text) from public, anon;
revoke all on function public.rotate_invite(uuid) from public, anon;
grant execute on function public.create_household(text, text) to authenticated;
grant execute on function public.join_household(text, text) to authenticated;
grant execute on function public.rotate_invite(uuid) to authenticated;
grant select, update on public.households to authenticated;
grant select, delete on public.members to authenticated;
grant select, insert, update, delete on public.items to authenticated;

-- Cambios en tiempo real: avisa a los demás móviles al instante.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'items') then
    alter publication supabase_realtime add table public.items;
  end if;
end $$;
