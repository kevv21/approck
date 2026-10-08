-- =============================================================================
-- 17 — DOS CUENTAS POR PIN: MAESTRA Y REVISION
-- =============================================================================
-- Pedido del dueno: una cuenta MAESTRA (cobra, imprime, edita, anula) y otra
-- de REVISION (ve los pedidos y hace inventario), cada una con su PIN.
--
-- Antes habia un solo PIN, guardado como SHA-256 en `settings.pin_hash`, y la
-- app lo comparaba EN EL NAVEGADOR. Eso tenia dos problemas:
--   1. `settings` la puede leer cualquiera con la clave publica, y un PIN de
--      4 digitos son 10 000 opciones: su SHA-256 se revierte en un instante.
--   2. Con dos PIN, comparar en el navegador obliga a mandarle los dos hashes
--      a todos los telefonos. Quien tenga el de revision tendria el de maestra.
--
-- Ahora los PIN viven en `acceso`, que NADIE puede leer (ni anon ni
-- authenticated), con bcrypt. La app no compara nada: le pregunta a la base
-- `entrar_con_pin('1234')` y la base responde 'maestra', 'revision' o null.
--
-- ALCANCE, dicho claro: esto separa lo que cada quien VE y TOCA en la app.
-- No es una barrera contra alguien que llame a la API a mano con la clave
-- publica: eso lo cierran BLINDAR.sql y EXIGIR_CUENTA.sql, no un PIN.
--
-- Migracion: la primera vez que alguien entra con el PIN viejo, se copia como
-- PIN de la maestra. `settings.pin_hash` NO se toca, para que una version
-- vieja de la app que siga abierta en algun telefono no quede sin PIN (si se
-- borrara, esa version dejaria entrar a cualquiera). Cuando todos los
-- aparatos tengan la version nueva, se puede borrar a mano:
--     update settings set pin_hash = null where id = 'default';
--
-- Si se olvida el PIN de la maestra:
--     delete from acceso where rol = 'maestra';
-- y se vuelve a entrar con el PIN viejo (o sin PIN, si ya no habia).
--
-- Idempotente: se puede correr las veces que haga falta.
-- =============================================================================

-- bcrypt. En Supabase pgcrypto ya viene instalado en el esquema `extensions`;
-- en un Postgres limpio se instala ahi mismo.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists acceso (
  rol        text primary key check (rol in ('maestra', 'revision')),
  pin_hash   text not null,
  updated_at timestamptz not null default now()
);

-- Nadie la lee ni la escribe directo: solo las funciones de abajo, que corren
-- con los permisos de su dueno. RLS encendido y sin politicas = nada pasa.
alter table acceso enable row level security;
do $$
begin
  revoke all on table acceso from public;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on table acceso from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on table acceso from authenticated;
  end if;
end $$;

alter type accion_auditoria add value if not exists 'cambio_pin';

-- -----------------------------------------------------------------------------
-- Comprueba un PIN contra la maestra, incluido el PIN viejo de `settings`.
-- Interna: no se expone.
-- -----------------------------------------------------------------------------
create or replace function acceso_es_maestra(p_pin text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  h text;
  viejo text;
begin
  select pin_hash into h from acceso where rol = 'maestra';
  if h is not null then
    return crypt(coalesce(p_pin, ''), h) = h;
  end if;

  -- Sin maestra todavia: vale el PIN viejo. Sin PIN viejo, la app esta
  -- abierta, igual que antes (para no dejar a la caja fuera por un ajuste que
  -- nadie lleno).
  select pin_hash into viejo from settings where id = 'default';
  if viejo is null then
    return true;
  end if;
  return viejo = encode(digest(coalesce(p_pin, ''), 'sha256'), 'hex');
end $$;

-- -----------------------------------------------------------------------------
-- ENTRAR. Devuelve 'maestra', 'revision' o null.
-- -----------------------------------------------------------------------------
create or replace function entrar_con_pin(p_pin text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  h text;
begin
  if acceso_es_maestra(p_pin) then
    -- Primera entrada con el PIN viejo: queda como PIN de la maestra, ya con
    -- bcrypt y fuera de la tabla que todos leen. Sin PIN configurado no se
    -- guarda nada: la maestra lo pone desde Estado.
    if not exists (select 1 from acceso where rol = 'maestra')
       and exists (select 1 from settings where id = 'default' and pin_hash is not null) then
      insert into acceso (rol, pin_hash)
      values ('maestra', crypt(p_pin, gen_salt('bf', 8)))
      on conflict (rol) do nothing;
    end if;
    return 'maestra';
  end if;

  select pin_hash into h from acceso where rol = 'revision';
  if h is not null and crypt(coalesce(p_pin, ''), h) = h then
    return 'revision';
  end if;

  -- Medio segundo por intento fallido: probar los 10 000 PIN de 4 digitos de
  -- uno en uno lleva mas de una hora. No es una cerradura (en paralelo va mas
  -- rapido); es para que adivinar no sea gratis.
  perform pg_sleep(0.5);
  return null;
end $$;

-- -----------------------------------------------------------------------------
-- Que cuentas tienen PIN. Sin secretos: sirve para que Estado diga si la
-- cuenta de revision esta activa y si la maestra sigue con el PIN de fabrica.
-- -----------------------------------------------------------------------------
create or replace function accesos_estado()
returns jsonb
language sql
security definer
set search_path = public, extensions
as $$
  select jsonb_build_object(
    'maestra',  exists (select 1 from acceso where rol = 'maestra'),
    'revision', exists (select 1 from acceso where rol = 'revision'),
    'pin_viejo', exists (select 1 from settings where id = 'default' and pin_hash is not null),
    -- 1234 es el PIN con el que viene el instalador. Decirlo es la unica
    -- forma de que alguien lo cambie.
    'de_fabrica', coalesce(
      (select crypt('1234', pin_hash) = pin_hash from acceso where rol = 'maestra'),
      (select pin_hash = encode(digest('1234', 'sha256'), 'hex') from settings where id = 'default'),
      false)
  );
$$;

-- -----------------------------------------------------------------------------
-- CAMBIAR UN PIN. Siempre pide el PIN de la maestra, lo cambie quien lo
-- cambie: la cuenta de revision no puede darse permisos ni cambiar el de la
-- maestra. Un PIN vacio en 'revision' apaga esa cuenta.
-- -----------------------------------------------------------------------------
create or replace function cambiar_pin(
  p_pin_maestra text, p_rol text, p_nuevo text, p_usuario text default null
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  h text;
  nuevo text := nullif(trim(coalesce(p_nuevo, '')), '');
begin
  if not acceso_es_maestra(p_pin_maestra) then
    perform pg_sleep(0.5);
    raise exception 'El PIN de la cuenta maestra no es correcto.' using errcode = '28P01';
  end if;
  if p_rol not in ('maestra', 'revision') then
    raise exception 'Cuenta desconocida: %.', p_rol;
  end if;

  if nuevo is null then
    if p_rol = 'maestra' then
      raise exception 'La cuenta maestra necesita un PIN.';
    end if;
    delete from acceso where rol = 'revision';
  else
    if nuevo !~ '^[0-9]{4,8}$' then
      raise exception 'El PIN tiene que ser de 4 a 8 numeros.';
    end if;

    if p_rol = 'revision' then
      -- Sin maestra guardada todavia, el PIN de revision no tendria con que
      -- compararse: primero la maestra.
      if not exists (select 1 from acceso where rol = 'maestra') then
        if exists (select 1 from settings where id = 'default' and pin_hash is not null) then
          insert into acceso (rol, pin_hash)
          values ('maestra', crypt(p_pin_maestra, gen_salt('bf', 8)))
          on conflict (rol) do nothing;
        else
          raise exception 'Primero ponle un PIN a la cuenta maestra.';
        end if;
      end if;
      select pin_hash into h from acceso where rol = 'maestra';
    else
      select pin_hash into h from acceso where rol = 'revision';
    end if;

    -- Dos cuentas con el mismo PIN: la de revision entraria como maestra.
    if h is not null and crypt(nuevo, h) = h then
      raise exception 'Los PIN de las dos cuentas tienen que ser distintos.';
    end if;

    insert into acceso (rol, pin_hash, updated_at)
    values (p_rol, crypt(nuevo, gen_salt('bf', 8)), now())
    on conflict (rol) do update set pin_hash = excluded.pin_hash, updated_at = now();
  end if;

  insert into audit_log (accion, usuario, detalle)
  values ('cambio_pin', coalesce(nullif(trim(p_usuario), ''), '(sin nombre)'),
          jsonb_build_object('cuenta', p_rol, 'quitada', nuevo is null));
end $$;

-- Permisos: igual que editar_orden y crear_orden. `acceso_es_maestra` no se
-- expone: devolveria si un PIN es el de la maestra sin la espera de medio
-- segundo.
revoke all on function acceso_es_maestra(text) from public;
revoke all on function entrar_con_pin(text) from public;
revoke all on function accesos_estado() from public;
revoke all on function cambiar_pin(text, text, text, text) from public;
do $$
begin
  -- Supabase le da EXECUTE de cada funcion nueva a anon y authenticated
  -- DIRECTO, no por `public`: el revoke de arriba no lo quita. Sin esto,
  -- una funcion interna quedaba llamable con la clave publica, y correr el
  -- instalador con EXIGIR_CUENTA aplicado le abria las nuevas a anon.
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function acceso_es_maestra(text) from anon;
    revoke all on function entrar_con_pin(text) from anon;
    revoke all on function accesos_estado() from anon;
    revoke all on function cambiar_pin(text, text, text, text) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function acceso_es_maestra(text) from authenticated;
    revoke all on function entrar_con_pin(text) from authenticated;
    revoke all on function accesos_estado() from authenticated;
    revoke all on function cambiar_pin(text, text, text, text) from authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function entrar_con_pin(text) to authenticated;
    grant execute on function accesos_estado() to authenticated;
    grant execute on function cambiar_pin(text, text, text, text) to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon')
     and has_table_privilege('anon', 'public.orden', 'SELECT') then
    grant execute on function entrar_con_pin(text) to anon;
    grant execute on function accesos_estado() to anon;
    grant execute on function cambiar_pin(text, text, text, text) to anon;
  end if;
end $$;

notify pgrst, 'reload schema';
