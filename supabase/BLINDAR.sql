-- ===========================================================================
-- APPROCK — BLINDAR LA BASE
--
-- Pega esto en Supabase: SQL Editor -> New query -> Run. Se puede repetir.
--
-- ANTES DE CORRERLO hace falta la cuenta del local:
--   Supabase -> Authentication -> Users -> Add user
--   correo:      caja@rockmunchies.local   (el que quieras; no recibe correo)
--   contraseña:  una larga, distinta de todo lo demas
--   marca «Auto Confirm User»
-- Esa contraseña se escribe UNA vez en cada telefono y en la PC de caja.
-- No va en el codigo ni en ninguna variable de entorno.
--
-- SIN ESA CUENTA, DESPUES DE CORRER ESTO LA APP NO ENTRA. Es a proposito.
--
-- POR QUE
--
-- La clave publishable viaja dentro del codigo que descarga el navegador.
-- Cualquiera que abra la pagina la tiene. Con las politicas del instalador
-- —`for all using (true)`— esa persona podia borrar las ventas del mes,
-- poner en cero el total de una orden cobrada, leer todo el historico e
-- insertar ordenes falsas. El PIN no lo impide: el PIN vive en el navegador.
--
-- QUE HACE
--
-- 1. El rol `anon` (o sea, la clave sola) se queda SIN NADA. Ni leer.
--    Hay que estar autenticado con la cuenta del local para que la base
--    conteste.
-- 2. Ya autenticado, los permisos se acotan a lo que la app de verdad hace,
--    sacado de leer cada llamada del codigo:
--      - Nadie borra nada, en ninguna tabla. Anular es cambiar un estado.
--      - Una orden cobrada solo admite que se la anule. Su total, sus lineas
--        y su metodo de pago quedan congelados.
--      - Las lineas de una orden son inmutables.
--      - Un turno CERRADO no se reabre ni se retoca. Lo pide el spec.
--      - El fondo inicial no cambia despues de abrir la caja.
--      - El menu es de solo lectura desde la app.
--      - La bitacora solo admite que se le agregue.
--
-- QUE NO HACE: no distingue entre meseros. Eso sigue siendo el PIN mas el
-- nombre, que es lo que va a la bitacora y sale en el recibo. Esta cuenta no
-- responde "quien fue", responde "este aparato es del local".
--
-- Para comprobarlo, pega despues VERIFICAR_BLINDAJE.sql.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 0. La clave sola no abre nada.
--
-- Esta es la parte que cierra la lectura y la insercion anonimas. Quitarle
-- los permisos al rol es mas fiable que cubrirlo con politicas: una politica
-- que se olvide deja un hueco, un permiso que no existe no lo deja.
-- ---------------------------------------------------------------------------
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on all tables    in schema public from anon;
    revoke all on all sequences in schema public from anon;
    revoke all on all functions in schema public from anon;
    -- Y que las tablas que se creen mañana tampoco nazcan abiertas.
    alter default privileges in schema public revoke all on tables    from anon;
    alter default privileges in schema public revoke all on sequences from anon;
  end if;
end $$;


do $$
declare
  r text;
begin
  -- Supabase trae estos dos roles. En un Postgres pelado puede no haber
  -- ninguno: entonces esto no hace nada y el script sigue.
  -- Solo `authenticated`: a `anon` ya se le quito todo arriba.
  foreach r in array array['authenticated'] loop
    if not exists (select 1 from pg_roles where rolname = r) then continue; end if;

    -- ------------------------------------------------------------------
    -- Nadie borra. Nunca. En ninguna tabla.
    -- ------------------------------------------------------------------
    execute format('revoke delete on all tables in schema public from %I', r);

    -- ------------------------------------------------------------------
    -- producto: solo lectura desde la app.
    -- ------------------------------------------------------------------
    execute format('revoke insert, update on producto from %I', r);

    -- ------------------------------------------------------------------
    -- orden: se crea y se anula. Nada mas.
    -- Sin esto, un update podia dejar el total en 0 despues de cobrar.
    -- ------------------------------------------------------------------
    execute format('revoke update on orden from %I', r);
    execute format(
      'grant update (estado, anulada_por, anulada_motivo, anulada_at) on orden to %I', r);

    -- ------------------------------------------------------------------
    -- orden_item: inmutable. Una linea vendida no se reescribe.
    -- ------------------------------------------------------------------
    execute format('revoke update on orden_item from %I', r);

    -- ------------------------------------------------------------------
    -- turno: el fondo inicial y quien abrio quedan fijos. Solo se puede
    -- escribir el cierre.
    -- ------------------------------------------------------------------
    execute format('revoke update on turno from %I', r);
    execute format(
      'grant update (cerrado_at, cerrado_por, efectivo_contado, ' ||
      'efectivo_contado_usd, diferencia, denominaciones, ventas_pedidosya, ' ||
      'notas) on turno to %I', r);

    -- ------------------------------------------------------------------
    -- settings: se pueden cambiar los ajustes y el PIN, no crear ni borrar
    -- la fila. Es una sola y es la que lee toda la app.
    -- ------------------------------------------------------------------
    execute format('revoke insert on settings from %I', r);

    -- ------------------------------------------------------------------
    -- insumo: la app solo completa la unidad de medida que falta.
    -- ------------------------------------------------------------------
    execute format('revoke insert on insumo from %I', r);
    execute format('revoke update on insumo from %I', r);
    execute format('grant update (unidad) on insumo to %I', r);

    -- ------------------------------------------------------------------
    -- pago: la tabla existe por el spec, pero la app guarda el pago dentro
    -- de `orden` (metodo_pago, recibido, cambio). Mientras no se use, que
    -- nadie pueda meter filas sueltas ahi.
    -- ------------------------------------------------------------------
    execute format('revoke insert, update on pago from %I', r);

    -- ------------------------------------------------------------------
    -- audit_log: la politica ya lo dejaba sin UPDATE, pero sin politica un
    -- update no falla: toca 0 filas y devuelve exito. Un bloqueo silencioso
    -- se parece demasiado a que funciono. Revocando el permiso, falla a
    -- gritos y queda en los registros de Postgres.
    -- ------------------------------------------------------------------
    execute format('revoke update on audit_log from %I', r);
  end loop;
end $$;


-- ---------------------------------------------------------------------------
-- Politicas. La capa de permisos de arriba dice QUE columnas; estas dicen
-- QUE FILAS. Las dos hacen falta: los GRANT no saben de estados.
-- ---------------------------------------------------------------------------

-- orden ---------------------------------------------------------------------
drop policy if exists p_orden on orden;
drop policy if exists orden_sel on orden;
drop policy if exists orden_ins on orden;
drop policy if exists orden_upd on orden;
create policy orden_sel on orden for select to authenticated using (true);
create policy orden_ins on orden for insert to authenticated with check (true);
-- Una orden anulada ya no se toca: sin esto se podia "desanular" y volver a
-- anularla con otro motivo, borrando quien la anulo de verdad.
create policy orden_upd on orden for update to authenticated
  using (anulada_at is null) with check (true);

-- orden_item ----------------------------------------------------------------
drop policy if exists p_orden_item on orden_item;
drop policy if exists orden_item_sel on orden_item;
drop policy if exists orden_item_ins on orden_item;
create policy orden_item_sel on orden_item for select to authenticated using (true);
create policy orden_item_ins on orden_item for insert to authenticated with check (true);

-- turno ---------------------------------------------------------------------
drop policy if exists p_turno on turno;
drop policy if exists turno_sel on turno;
drop policy if exists turno_ins on turno;
drop policy if exists turno_upd on turno;
create policy turno_sel on turno for select to authenticated using (true);
create policy turno_ins on turno for insert to authenticated with check (true);
-- "Sesion bloqueada" del spec: cerrada es cerrada.
create policy turno_upd on turno for update to authenticated
  using (cerrado_at is null) with check (true);

-- producto ------------------------------------------------------------------
drop policy if exists p_producto on producto;
drop policy if exists producto_sel on producto;
create policy producto_sel on producto for select to authenticated using (true);

-- settings ------------------------------------------------------------------
drop policy if exists p_settings on settings;
drop policy if exists settings_sel on settings;
drop policy if exists settings_upd on settings;
create policy settings_sel on settings for select to authenticated using (true);
create policy settings_upd on settings for update to authenticated using (true) with check (true);

-- print_job -----------------------------------------------------------------
drop policy if exists p_print_job on print_job;
drop policy if exists print_job_sel on print_job;
drop policy if exists print_job_ins on print_job;
drop policy if exists print_job_upd on print_job;
create policy print_job_sel on print_job for select to authenticated using (true);
create policy print_job_ins on print_job for insert to authenticated with check (true);
create policy print_job_upd on print_job for update to authenticated using (true) with check (true);

-- puente_latido -------------------------------------------------------------
drop policy if exists p_puente_latido on puente_latido;
drop policy if exists puente_sel on puente_latido;
drop policy if exists puente_ins on puente_latido;
drop policy if exists puente_upd on puente_latido;
create policy puente_sel on puente_latido for select to authenticated using (true);
create policy puente_ins on puente_latido for insert to authenticated with check (true);
create policy puente_upd on puente_latido for update to authenticated using (true) with check (true);

-- inventario ----------------------------------------------------------------
drop policy if exists p_insumo on insumo;
drop policy if exists insumo_sel on insumo;
drop policy if exists insumo_upd on insumo;
create policy insumo_sel on insumo for select to authenticated using (true);
create policy insumo_upd on insumo for update to authenticated using (true) with check (true);

drop policy if exists p_conteo on conteo;
drop policy if exists conteo_sel on conteo;
drop policy if exists conteo_ins on conteo;
drop policy if exists conteo_upd on conteo;
create policy conteo_sel on conteo for select to authenticated using (true);
create policy conteo_ins on conteo for insert to authenticated with check (true);
-- Un conteo cerrado tampoco se retoca.
create policy conteo_upd on conteo for update to authenticated
  using (estado = 'abierto') with check (true);

drop policy if exists p_conteo_item on conteo_item;
drop policy if exists conteo_item_sel on conteo_item;
drop policy if exists conteo_item_ins on conteo_item;
drop policy if exists conteo_item_upd on conteo_item;
create policy conteo_item_sel on conteo_item for select to authenticated using (true);
create policy conteo_item_ins on conteo_item for insert to authenticated with check (true);
create policy conteo_item_upd on conteo_item for update to authenticated using (true) with check (true);

-- pago ----------------------------------------------------------------------
drop policy if exists p_pago on pago;
drop policy if exists pago_sel on pago;
create policy pago_sel on pago for select to authenticated using (true);

-- audit_log: ya estaba bien. Solo insertar y leer; ni modificar ni borrar.
-- Una bitacora que el cajero puede editar no sirve de nada.
