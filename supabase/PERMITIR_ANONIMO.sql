-- ===========================================================================
-- APPROCK — DESHACER "EXIGIR CUENTA"
--
-- Devuelve a la clave publishable los permisos acotados que le da
-- BLINDAR.sql, para que la app deje de pedir correo y contrasena.
--
-- Lo que BLINDAR.sql cierra —borrar, cambiar totales, reabrir turnos— sigue
-- cerrado: esto NO reabre nada de eso. Solo vuelve a permitir leer y crear
-- ordenes sin cuenta.
--
-- Despues de correr esto, corre BLINDAR.sql otra vez: es el que decide QUE
-- puede hacer `anon` exactamente. Este archivo solo le devuelve el paso.
-- ===========================================================================

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    raise notice 'No existe el rol anon.';
    return;
  end if;

  alter default privileges in schema public grant all on tables    to anon;
  alter default privileges in schema public grant all on sequences to anon;

  grant usage on schema public to anon;
  grant all on all tables    in schema public to anon;
  grant all on all sequences in schema public to anon;

  raise notice 'Hecho. Ahora corre BLINDAR.sql para volver a acotar los permisos.';
end $$;
