-- ===========================================================================
-- APPROCK — BLINDAR LA BASE
--
-- Pega esto en Supabase: SQL Editor -> New query -> Run. Se puede repetir.
--
-- QUE HACE
--
-- Acota lo que se puede hacer con la clave publishable —la que viaja dentro
-- del codigo que descarga el navegador— a lo que la app de verdad necesita,
-- sacado de leer cada llamada del codigo:
--
--   - Nadie borra nada, en ninguna tabla. Anular es cambiar un estado.
--   - Una orden cobrada solo admite que se la anule. Su total, sus lineas y
--     su metodo de pago quedan congelados (permiso por COLUMNA, no por
--     tabla, que es lo unico que lo consigue).
--   - Una orden ya anulada no se puede "desanular" para volver a anularla
--     con otro motivo, que borraria a quien la anulo de verdad.
--   - Las lineas de una orden son inmutables una vez escritas.
--   - Un turno CERRADO no se reabre ni se retoca. Lo pide el spec
--     ("sesion bloqueada") y no se cumplia.
--   - El fondo inicial no cambia despues de abrir la caja.
--   - El menu es de solo lectura desde la app. Los precios se cambian aqui,
--     en el editor SQL, que es donde hay que dar la cara.
--   - La bitacora solo admite que se le agregue.
--
-- QUE NO HACE, Y ES UNA DECISION, NO UN OLVIDO
--
-- Cualquiera con la direccion de la app puede LEER las ventas e INSERTAR
-- ordenes falsas. Cerrar eso obliga a escribir un correo y una contrasena en
-- cada telefono, y el dueno prefirio no tener esa friccion.
--
-- Si algun dia cambia de idea: `supabase/EXIGIR_CUENTA.sql`. La app se da
-- cuenta sola y empieza a pedir la cuenta; no hay que tocar codigo. Y
-- `PERMITIR_ANONIMO.sql` lo deshace.
--
-- Lo que se cierra aqui es la DESTRUCCION y la ADULTERACION, que es lo que no
-- tiene vuelta atras. Una orden falsa se anula; un mes de ventas borrado, no.
--
-- Para comprobarlo, pega despues VERIFICAR_BLINDAJE.sql.
-- ===========================================================================

do $$
declare
  r text;
begin
  -- Supabase trae estos dos roles. En un Postgres pelado puede no haber
  -- ninguno: entonces esto no hace nada y el script sigue.
  foreach r in array array['anon', 'authenticated'] loop
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
create policy orden_sel on orden for select using (true);
create policy orden_ins on orden for insert with check (true);
-- Una orden anulada ya no se toca: sin esto se podia "desanular" y volver a
-- anularla con otro motivo, borrando quien la anulo de verdad.
create policy orden_upd on orden for update
  using (anulada_at is null) with check (true);

-- orden_item ----------------------------------------------------------------
drop policy if exists p_orden_item on orden_item;
drop policy if exists orden_item_sel on orden_item;
drop policy if exists orden_item_ins on orden_item;
create policy orden_item_sel on orden_item for select using (true);
create policy orden_item_ins on orden_item for insert with check (true);

-- turno ---------------------------------------------------------------------
drop policy if exists p_turno on turno;
drop policy if exists turno_sel on turno;
drop policy if exists turno_ins on turno;
drop policy if exists turno_upd on turno;
create policy turno_sel on turno for select using (true);
create policy turno_ins on turno for insert with check (true);
-- "Sesion bloqueada" del spec: cerrada es cerrada.
create policy turno_upd on turno for update
  using (cerrado_at is null) with check (true);

-- producto ------------------------------------------------------------------
drop policy if exists p_producto on producto;
drop policy if exists producto_sel on producto;
create policy producto_sel on producto for select using (true);

-- settings ------------------------------------------------------------------
drop policy if exists p_settings on settings;
drop policy if exists settings_sel on settings;
drop policy if exists settings_upd on settings;
create policy settings_sel on settings for select using (true);
create policy settings_upd on settings for update using (true) with check (true);

-- print_job -----------------------------------------------------------------
drop policy if exists p_print_job on print_job;
drop policy if exists print_job_sel on print_job;
drop policy if exists print_job_ins on print_job;
drop policy if exists print_job_upd on print_job;
create policy print_job_sel on print_job for select using (true);
create policy print_job_ins on print_job for insert with check (true);
create policy print_job_upd on print_job for update using (true) with check (true);

-- puente_latido -------------------------------------------------------------
drop policy if exists p_puente_latido on puente_latido;
drop policy if exists puente_sel on puente_latido;
drop policy if exists puente_ins on puente_latido;
drop policy if exists puente_upd on puente_latido;
create policy puente_sel on puente_latido for select using (true);
create policy puente_ins on puente_latido for insert with check (true);
create policy puente_upd on puente_latido for update using (true) with check (true);

-- inventario ----------------------------------------------------------------
drop policy if exists p_insumo on insumo;
drop policy if exists insumo_sel on insumo;
drop policy if exists insumo_upd on insumo;
create policy insumo_sel on insumo for select using (true);
create policy insumo_upd on insumo for update using (true) with check (true);

drop policy if exists p_conteo on conteo;
drop policy if exists conteo_sel on conteo;
drop policy if exists conteo_ins on conteo;
drop policy if exists conteo_upd on conteo;
create policy conteo_sel on conteo for select using (true);
create policy conteo_ins on conteo for insert with check (true);
-- Un conteo cerrado tampoco se retoca.
create policy conteo_upd on conteo for update
  using (estado = 'abierto') with check (true);

drop policy if exists p_conteo_item on conteo_item;
drop policy if exists conteo_item_sel on conteo_item;
drop policy if exists conteo_item_ins on conteo_item;
drop policy if exists conteo_item_upd on conteo_item;
create policy conteo_item_sel on conteo_item for select using (true);
create policy conteo_item_ins on conteo_item for insert with check (true);
create policy conteo_item_upd on conteo_item for update using (true) with check (true);

-- pago ----------------------------------------------------------------------
drop policy if exists p_pago on pago;
drop policy if exists pago_sel on pago;
create policy pago_sel on pago for select using (true);

-- audit_log: ya estaba bien. Solo insertar y leer; ni modificar ni borrar.
-- Una bitacora que el cajero puede editar no sirve de nada.
