-- ===========================================================================
-- APPROCK — EXIGIR CUENTA  (opcional)
--
-- Corre BLINDAR.sql primero. Esto es un paso MAS, y se puede deshacer con
-- PERMITIR_ANONIMO.sql.
--
-- QUE CAMBIA
--
-- Sin esto, cualquiera con la direccion de la app puede LEER las ventas e
-- INSERTAR ordenes falsas: la clave publishable viaja dentro del codigo que
-- descarga el navegador, y las politicas la dejan pasar. (Borrar y adulterar
-- ya estan cerrados por BLINDAR.sql, y siguen cerrados pase lo que pase.)
--
-- Con esto, la clave sola no abre NADA. Ni leer el menu. Hay que estar
-- autenticado con una cuenta del local.
--
-- LO QUE CUESTA: cada telefono y la PC de caja piden, UNA vez, el correo y
-- la contrasena de esa cuenta. Esa es la friccion que hay que decidir si
-- vale la pena.
--
-- ANTES DE CORRERLO, crea la cuenta:
--   Supabase -> Authentication -> Users -> Add user
--   correo:      caja@rockmunchies.local   (el que quieras; no recibe correo)
--   contrasena:  una larga, distinta de todo lo demas
--   marca «Auto Confirm User»
--
-- La app se da cuenta sola de que ahora hace falta y empieza a pedirla. No
-- hay que tocar codigo ni desplegar nada.
-- ===========================================================================

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    raise notice 'No existe el rol anon: nada que cerrar.';
    return;
  end if;

  -- Quitarle los permisos al rol es mas fiable que cubrirlo con politicas:
  -- una politica que se olvide deja un hueco; un permiso que no existe, no.
  revoke all on all tables    in schema public from anon;
  revoke all on all sequences in schema public from anon;
  revoke all on all functions in schema public from anon;

  -- Y que las tablas que se creen mañana tampoco nazcan abiertas.
  alter default privileges in schema public revoke all on tables    from anon;
  alter default privileges in schema public revoke all on sequences from anon;

  raise notice 'Listo: la clave publishable ya no abre nada por si sola.';
end $$;

-- Comprueba con VERIFICAR_BLINDAJE.sql: las filas de "(anónimo)" tienen que
-- pasar de PERMITIR a BLOQUEAR.
